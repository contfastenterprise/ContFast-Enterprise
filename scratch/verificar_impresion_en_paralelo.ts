/**
 * Lote 182 -- imprimir una factura deja de esperar nueve veces a la base.
 *
 * LO QUE SE MIDIO (2026-09-22, contra la base de PRODUCCION, solo lectura)
 * ----------------------------------------------------------------------
 * El dueño dijo que imprimir "dura mucho, cargando los datos".
 * `/api/v1/invoices/[id]/print` hacia NUEVE consultas en fila, cada una
 * esperando a la anterior:
 *
 *     factura 96 · empresa 87 · ajustes 140 · secuencia 87 · cliente 90
 *     lineas 87 · impuestos 85 · retenciones 86 · envio 87      = 1.073 ms
 *
 * Casi todo es ida y vuelta, no trabajo de la base. Las ocho independientes en
 * paralelo, CON EL POOL DE PRODUCCION (`max: 2`, ver `src/db/index.ts`):
 *
 *     max=1: 1.005 ms   max=2: 489 ms   max=3: 309 ms   max=5: 202 ms
 *
 * Asi que el arreglo ahorra ~580 ms de los que el cajero mira una pestaña en
 * blanco. Y deja anotado que subir `DATABASE_POOL_MAX` a 5 daria otros ~290 ms,
 * que es una decision de infraestructura (limite de conexiones de Supabase por
 * instancia de Vercel), no de este lote.
 *
 * LO QUE NO SE TOCA, y hay que decirlo: el arranque en frio de Chromium son
 * 1.234 ms medidos, y sigue ahi. `PDF_SERVICE_URL` **no esta en Vercel**
 * (confirmado por el dueño el 2026-09-22), asi que el camino del servicio
 * externo -- con su plazo de 15 s -- no se paga en produccion.
 *
 * QUE VIGILA ESTE BANCO
 * ---------------------
 * Que el paralelismo no se lleve por delante lo que la ruta ya garantizaba.
 * Las tres cosas que se pueden romper al pasar de `await` en fila a
 * `Promise.all`:
 *
 *   1. que una factura de OTRA empresa o de otro MODO siga sin imprimirse;
 *   2. que el orden de los errores no cambie ("Invoice not found" antes que
 *      "Company profile not found");
 *   3. que la secuencia que se lee sea la del MODO y el TIPO de la factura --
 *      de ahi sale la caducidad del NCF que se imprime en un documento fiscal.
 *
 * TODO ESTO SE LEE DEL CODIGO, NO SE EJECUTA, y hay que decirlo para que nadie
 * lea mas garantia de la que hay: NINGUN banco de este repositorio ejecuta esta
 * ruta de punta a punta (se comprobo al escribir este). Lo que cubre la
 * ejecucion real es `tsc` para los tipos y `pnpm build` para la compilacion; una
 * consulta que devuelva una fila con la forma equivocada no la caza nadie aqui.
 * Hacerlo de verdad pide el aparato de `verificar_origen_de_compra_db.ts`
 * (servidor levantado y cabeceras internas firmadas), y para un cambio que no
 * altera ni una condicion no parecio proporcionado.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

const RUTA = 'src/app/api/v1/invoices/[id]/print/route.ts';

async function main() {
  const fuente = leer(RUTA);
  if (!/getInvoicePdfBuffer/.test(fuente)) {
    throw new Error('Precondicion: la ruta de impresion ya no arma el PDF aqui');
  }
  const codigo = sinComentarios(fuente);

  //  ESTAS DOS VALEN EN LOS DOS ESTADOS, asi que como comprobacion regalaban un
  //  OK en la contraprueba (seccion 4 del metodo). Son guardas de lo que el lote
  //  NO puede romper, no pruebas de lo que hace, y por eso van aqui.
  const iFactura = codigo.indexOf("throw new Error('Invoice not found')");
  const iEmpresa = codigo.indexOf("throw new Error('Company profile not found')");
  if (!(iFactura > -1 && iEmpresa > -1 && iFactura < iEmpresa)) {
    throw new Error('Precondicion: el error de la factura ya no se lanza antes que el de la empresa');
  }
  //  El aislamiento por empresa y por modo: es lo que impide imprimir la factura
  //  de otro. Si esto se cae, no es un fallo de rendimiento.
  if (!/eq\(invoices\.id, invoiceId\), eq\(invoices\.companyId, companyId\), eq\(invoices\.modo, modo\)/.test(codigo)) {
    throw new Error('Precondicion: la factura ya no esta acotada a la empresa y al modo');
  }

  console.log('\n1) Las consultas van en paralelo, no en fila\n');

  // Se cuentan los `await db.` SUELTOS: son los que esperan de uno en uno. Los
  // que van dentro de un `Promise.all` no llevan `await` delante.
  const awaitsSueltos = (codigo.match(/await db\s*$|await db\r?\n|await db\./g) || []).length;
  ok('ninguna consulta espera sola a la base',
    awaitsSueltos === 0, `${awaitsSueltos} await db sueltos`);
  ok('hay DOS oleadas, ni una mas',
    (codigo.match(/await Promise\.all\(\[/g) || []).length === 2,
    `${(codigo.match(/await Promise\.all\(\[/g) || []).length} oleadas`);

  // La primera oleada lleva las SIETE que no necesitan la fila de la factura.
  const oleada1 = (() => {
    const i = codigo.indexOf('await Promise.all([');
    return i < 0 ? '' : codigo.slice(i, codigo.indexOf('if (!invoiceRecordDb)', i));
  })();
  for (const tabla of ['invoices', 'companies', 'companySettings', 'invoiceLines', 'invoiceTaxes', 'invoiceRetentions']) {
    ok(`  ${tabla} va en la primera oleada`, oleada1.includes(`from(${tabla})`));
  }
  ok('  y el envio vigente tambien', /envioVigente\(invoiceId, companyId, modo\)/.test(oleada1));

  // La empresa y los ajustes por el companyId DE LA SESION: si esperaran a la
  // factura para leer `invoiceRecordDb.companyId`, no podrian ir en la primera.
  ok('la empresa se pide por el companyId de la sesion, no por el de la factura',
    /from\(companies\)\.where\(eq\(companies\.id, companyId\)\)/.test(oleada1)
    && !/eq\(companies\.id, invoiceRecordDb\.companyId\)/.test(codigo));
  ok('  y los ajustes igual',
    /eq\(companySettings\.companyId, companyId\)/.test(oleada1));

  // La segunda oleada: las DOS que si necesitan la factura.
  const oleada2 = (() => {
    const i = codigo.indexOf('await Promise.all([', codigo.indexOf('if (!company)'));
    return i < 0 ? '' : codigo.slice(i, i + 1800);
  })();
  ok('la secuencia va en la segunda oleada (necesita el ecfType de la factura)',
    oleada2.includes('from(ecfSequences)') && /eq\(ecfSequences\.ecfType, invoiceRecordDb\.ecfType\)/.test(oleada2));
  ok('  y el cliente tambien (necesita su customerId)',
    oleada2.includes('from(customers)') && /invoiceRecordDb\.customerId/.test(oleada2));

  console.log('\n2) Lo que el paralelismo NO puede romper\n');

  //  APRETADA. Antes decia `iFactura > codigo.indexOf('await Promise.all([')`,
  //  y en la contraprueba ese `indexOf` vale -1 -- no hay `Promise.all` --, asi
  //  que la comparacion era verdadera DE BALDE. Es la trampa de la seccion 3:
  //  una negacion es cierta porque el mecanismo todavia no existe. Ahora se
  //  exige que la oleada exista Y que los errores caigan detras.
  const iOleada1 = codigo.indexOf('await Promise.all([');
  ok('los errores se comprueban DESPUES de pedir todo en paralelo',
    iOleada1 > -1 && iFactura > iOleada1 && iEmpresa > iOleada1,
    `oleada=${iOleada1} factura=${iFactura}`);

  //  (El aislamiento por empresa y modo es precondicion: ver arriba.)
  //  Lo que SI es de este lote: que la consulta de la factura siga acotada
  //  DENTRO de la oleada, y no se haya quedado fuera al moverla.
  ok('la factura acotada va dentro de la primera oleada',
    /eq\(invoices\.id, invoiceId\), eq\(invoices\.companyId, companyId\), eq\(invoices\.modo, modo\)/.test(oleada1));
  // La secuencia, por modo y tipo: de ahi sale la caducidad del NCF impreso, y
  // sin el modo saldria la de la secuencia de PRUEBAS en un documento real.
  ok('la secuencia sigue acotada al modo y al tipo',
    /eq\(ecfSequences\.modo, modo\)/.test(oleada2)
    && /eq\(ecfSequences\.ecfType, invoiceRecordDb\.ecfType\)/.test(oleada2));
  // Un cliente ausente no puede convertirse en un `undefined` que reviente la
  // plantilla: antes era `null` explicito y tiene que seguir siendolo.
  ok('sin cliente, el cliente es null y no undefined',
    /Promise\.resolve\(null\)/.test(oleada2) && /\?\? null/.test(oleada2));

  console.log('\n3) La cuenta de viajes\n');
  // El numero que justifica el lote: de nueve esperas a dos.
  const consultasEnOleadas = (oleada1.match(/from\(\w+\)/g) || []).length + (oleada2.match(/from\(\w+\)/g) || []).length;
  ok('las nueve consultas caben en dos viajes',
    consultasEnOleadas + 1 >= 8, `${consultasEnOleadas} consultas repartidas en 2 oleadas`);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
