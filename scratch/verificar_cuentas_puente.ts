/**
 * Lote 171 -- nada de contabilidad escrito en el codigo.
 *
 * LA REGLA (del dueño, 2026-09-19)
 * --------------------------------
 * El plan de cuentas es del contador, no del programa. De ahi tres cosas:
 *   1. el catalogo se crea AL CREAR LA EMPRESA (el sembrador), no a mano ni
 *      con un guion de datos por empresa;
 *   2. que cuenta usa cada cosa se elige en Configuracion > Cuentas Puente;
 *   3. ningun codigo de cuenta fijado en el codigo, ni como "defecto".
 *
 * QUE SE VIGILA
 * -------------
 * La tabla `CUENTAS_DEL_SISTEMA` es la unica fuente: de ella salen el
 * sembrador, el plan para completar una empresa existente y -- esto es lo
 * nuevo -- las filas de la pantalla de Cuentas Puente, que llevaba su propia
 * lista con 9 de las 16 claves.
 *
 * Se EJECUTAN la tabla y el derivado; las pantallas se leen.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (t: string, motivo: string) => ok(t, false, motivo);

const AJUSTES = 'src/app/dashboard/settings/page.tsx';
const COMPRAS = 'src/app/dashboard/purchases/page.tsx';
const REPO = 'src/repositories/accountingRepository.ts';
const TABLA = 'src/services/accounting/cuentasDelSistema.ts';

async function main() {
  for (const f of [AJUSTES, COMPRAS, REPO, TABLA]) {
    if (!existsSync(join(raiz, f))) throw new Error(`Precondicion: falta ${f}`);
  }
  // Vale en los dos estados: lo que el lote cambia es de DONDE salen las filas,
  // no que la pantalla exista.
  const ajustes = leer(AJUSTES);
  if (!/Cuentas Puente/.test(ajustes)) throw new Error('Precondicion: la pantalla de Cuentas Puente ya no se llama asi');

  console.log('\n1) La tabla es la unica fuente\n');
  let T: typeof import('../src/services/accounting/cuentasDelSistema') | null = null;
  try { T = await import('../src/services/accounting/cuentasDelSistema'); } catch { T = null; }

  if (!T || !('PUENTES_DE_CUENTAS' in T)) {
    for (const t of [
      'la tarjeta de credito es una cuenta del sistema',
      'toda cuenta del sistema tiene etiqueta para la pantalla',
      'los puentes se derivan de la tabla',
      'un puente por CUENTA, no por clave',
      'ninguna clave se queda fuera de la pantalla',
      'las dos claves del ITBIS pagado caen en la MISMA fila',
      'cada puente dice de que tipo tiene que ser la cuenta',
    ]) falta(t, 'cuentasDelSistema.ts no exporta PUENTES_DE_CUENTAS');
  } else {
    const { CUENTAS_DEL_SISTEMA, PUENTES_DE_CUENTAS, cuentaDelSistema } = T;

    const tarjeta = CUENTAS_DEL_SISTEMA.find((c) => c.clave === 'credit_card_payable');
    ok('la tarjeta de credito es una cuenta del sistema',
      !!tarjeta && tarjeta.codigo === '2.1.01.03' && tarjeta.tipo === 'liability' && tarjeta.naturaleza === 'credit',
      JSON.stringify(tarjeta));
    ok('  y se puede pedir por su clave', (() => { try { return cuentaDelSistema('credit_card_payable').codigo === '2.1.01.03'; } catch { return false; } })());

    const sinEtiqueta = CUENTAS_DEL_SISTEMA.filter((c) => !c.etiqueta || !c.etiqueta.trim()).map((c) => c.clave);
    ok('toda cuenta del sistema tiene etiqueta para la pantalla', sinEtiqueta.length === 0, sinEtiqueta.join(', '));

    ok('los puentes se derivan de la tabla', PUENTES_DE_CUENTAS.length > 0);
    const codigos = PUENTES_DE_CUENTAS.map((p) => p.codigo);
    ok('un puente por CUENTA, no por clave (sin codigos repetidos)',
      new Set(codigos).size === codigos.length, codigos.join(' '));
    // La propiedad que de verdad importa: la pantalla no puede dejar fuera
    // ninguna clave, que es exactamente lo que pasaba con la lista a mano.
    const enPuentes = new Set(PUENTES_DE_CUENTAS.flatMap((p) => p.claves));
    const fuera = CUENTAS_DEL_SISTEMA.filter((c) => !enPuentes.has(c.clave)).map((c) => c.clave);
    ok('ninguna clave se queda fuera de la pantalla', fuera.length === 0, fuera.join(', '));
    ok('  ni sobra ninguna que el sistema no use',
      [...enPuentes].every((k) => CUENTAS_DEL_SISTEMA.some((c) => c.clave === k)));

    const itbis = PUENTES_DE_CUENTAS.find((p) => p.codigo === '1.1.04.01');
    ok('las dos claves del ITBIS pagado caen en la MISMA fila (si no, se podrian apuntar a cuentas distintas)',
      !!itbis && itbis.claves.includes('itbis_purchases') && itbis.claves.includes('purchase_itbis_paid'),
      JSON.stringify(itbis?.claves));

    // La invariante que hace seguro agrupar: la etiqueta es de la CUENTA, no
    // de la clave. Si se rompe, dos claves de la misma cuenta saldrian en dos
    // filas y el contador podria apuntarlas a sitios distintos.
    const etiquetaPorCodigo = new Map<string, string>();
    const etiquetasMal: string[] = [];
    for (const c of CUENTAS_DEL_SISTEMA) {
      const vista = etiquetaPorCodigo.get(c.codigo);
      if (vista === undefined) etiquetaPorCodigo.set(c.codigo, c.etiqueta);
      else if (vista !== c.etiqueta) etiquetasMal.push(`${c.codigo}: "${vista}" y "${c.etiqueta}"`);
    }
    ok('dos claves de la MISMA cuenta llevan la misma etiqueta (la etiqueta es de la cuenta)',
      etiquetasMal.length === 0, etiquetasMal.join('; '));
    // Y el derivado es exactamente el agrupado por codigo de la tabla.
    const esperado = [...new Set(CUENTAS_DEL_SISTEMA.map((c) => c.codigo))];
    ok('  y hay una fila por cada cuenta distinta de la tabla, en su orden',
      JSON.stringify(PUENTES_DE_CUENTAS.map((p) => p.codigo)) === JSON.stringify(esperado),
      `${PUENTES_DE_CUENTAS.length} filas / ${esperado.length} cuentas`);

    const tiposMal = PUENTES_DE_CUENTAS.filter((p) => {
      const c = CUENTAS_DEL_SISTEMA.find((x) => x.codigo === p.codigo);
      return !c || c.tipo !== p.tipo;
    }).map((p) => p.codigo);
    ok('cada puente dice de que tipo tiene que ser la cuenta', tiposMal.length === 0, tiposMal.join(', '));
    ok('la tarjeta tiene su propia fila, de pasivo',
      PUENTES_DE_CUENTAS.some((p) => p.codigo === '2.1.01.03' && p.tipo === 'liability'));
  }

  console.log('\n2) El catalogo se crea al crear la empresa\n');
  const repo = leer(REPO);
  const iSembrador = repo.indexOf('public static async seedDefaultChartOfAccounts(');
  const sembrador = iSembrador > 0 ? repo.slice(iSembrador, repo.indexOf('\n  public static', iSembrador + 10)) : '';
  ok('el sembrador existe y crea la cuenta de la tarjeta',
    sembrador.length > 0 && /code: '2\.1\.01\.03', name: 'Tarjetas de Crédito por Pagar'/.test(sembrador));
  // Las tres que siguen son ciertas ANTES del lote (2.1.01 se siembra desde
  // siempre, y enlazar desde la tabla y derivar el nivel son del 165): van
  // unidas a la cuenta que este lote anade, o serian OK regalados.
  const tarjetaSembrada = /code: '2\.1\.01\.03', name: 'Tarjetas de Crédito por Pagar'/.test(sembrador);
  ok('  bajo su padre 2.1.01, que el sembrador tambien crea',
    /code: '2\.1\.01', name: 'Cuentas por Pagar'/.test(sembrador) && tarjetaSembrada);
  ok('el sembrador enlaza las claves DESDE la tabla, no a mano',
    /const defaultMappings = CUENTAS_DEL_SISTEMA\.map\(/.test(sembrador) && tarjetaSembrada);
  // Completar una empresa que ya existe deriva el nivel del codigo. Esto es lo
  // que hace innecesario un guion de datos por empresa -- y es lo que yo hice
  // mal a mano el 19/09 al crear 2.1.01.03 con nivel 3 en vez de 4.
  ok('completar una empresa deriva el nivel del codigo (no lo lleva a mano)',
    /level: paso\.cuenta\.codigo\.split\('\.'\)\.length/.test(repo) && tarjetaSembrada);

  console.log('\n3) El plan para una empresa que ya existe, ejecutado\n');
  if (!T) {
    falta('crea 2.1.01.03 bajo 2.1.01 en una empresa antigua', 'no se pudo cargar la tabla');
  } else {
    const { planParaCompletar, CUENTAS_DEL_SISTEMA } = T;
    type Cta = { id: string; code: string; type: string; isTransactional: boolean; status: string; renglones: number };
    const cta = (code: string, type: string, grupo = false): Cta =>
      ({ id: `id-${code}`, code, type, isTransactional: !grupo, status: 'active', renglones: 0 });
    // Una empresa sembrada antes del 171: tiene 2.1.01 y sus dos hijas, no la tarjeta.
    const catalogo: Cta[] = [
      cta('1.1.01.01', 'asset'), cta('1.1.01.02', 'asset'), cta('1.1.02.01', 'asset'), cta('1.1.03.01', 'asset'),
      cta('1.1.04.01', 'asset'), cta('1.1.04.02', 'asset'), cta('1.1.04.03', 'asset'), cta('1.1.04.04', 'asset'),
      cta('2.1.01.01', 'liability'), cta('2.1.01.02', 'liability'), cta('2.1.02.01', 'liability'),
      cta('2.1.02.02', 'liability'), cta('2.1.02.03', 'liability'), cta('4.1.01', 'revenue'),
      cta('5.1.01', 'expense'), cta('5.1.02', 'expense'),
      cta('2.1.01', 'liability', true), cta('1.1.04', 'asset', true), cta('5.1', 'expense', true),
    ];
    const plan = planParaCompletar(catalogo, new Set());
    const crea = plan.filter((p) => p.accion === 'crear_y_enlazar') as { cuenta: { codigo: string }; codigoPadre: string; claves: string[] }[];
    ok('crea 2.1.01.03 bajo 2.1.01 en una empresa antigua',
      crea.length === 1 && crea[0].cuenta.codigo === '2.1.01.03' && crea[0].codigoPadre === '2.1.01',
      JSON.stringify(crea.map((c) => `${c.cuenta.codigo} bajo ${c.codigoPadre}`)));
    ok('  y le enlaza su clave', crea[0]?.claves.includes('credit_card_payable'));
    // Sin el padre no adivina: crear 2.1.01.03 colgando de cualquier sitio
    // seria peor que no crearla.
    let sinPadre = '';
    try { planParaCompletar(catalogo.filter((c) => c.code !== '2.1.01'), new Set()); } catch (e) { sinPadre = (e as Error).message; }
    ok('sin el padre 2.1.01 se niega en vez de colgarla de cualquier sitio',
      /falta su cuenta padre 2\.1\.01/.test(sinPadre), sinPadre);
    // "No hace nada" es verdad de balde si la clave de la tarjeta no existe:
    // va unida a que el plan SI la contemple cuando falta.
    const todoEnlazado = planParaCompletar([...catalogo, cta('2.1.01.03', 'liability')],
      new Set(CUENTAS_DEL_SISTEMA.map((c) => c.clave)));
    ok('y en una empresa que ya tiene todo enlazado no hace nada',
      todoEnlazado.every((p) => p.accion === 'nada')
      && todoEnlazado.some((p) => 'clave' in p && p.clave === 'credit_card_payable'));
  }

  console.log('\n4) La pantalla de Cuentas Puente sale de la tabla\n');
  ok('la pantalla importa los puentes', /import \{ PUENTES_DE_CUENTAS \} from '@\/services\/accounting\/cuentasDelSistema'/.test(ajustes));
  ok('  y pinta una fila por cada uno', /PUENTES_DE_CUENTAS\.map\(/.test(ajustes));
  // La negacion sola seria verdad de balde si la pantalla no existiera: va
  // unida a que los puentes SI esten.
  const claveAMano = /\{ key: '(sales_revenue|cash|bank|inventory|supplier_payable)', label:/.test(ajustes);
  ok('ya no queda la lista de claves escrita a mano', !claveAMano && /PUENTES_DE_CUENTAS/.test(ajustes));
  ok('guardar escribe TODAS las claves de la fila (no solo la primera)',
    /Object\.fromEntries\(puente\.claves\.map\(k => \[k, e\.target\.value\]\)\)/.test(ajustes));
  ok('el desplegable solo ofrece cuentas del tipo que el sistema espera',
    /acc\.type === puente\.tipo/.test(ajustes));
  // Sin esto, una empresa con un enlace antiguo de otro tipo abriria el
  // desplegable en blanco y guardar le borraria el enlace sin pedirlo.
  ok('  pero nunca esconde la cuenta ya elegida', /\|\| acc\.id === valor/.test(ajustes));
  ok('una clave sin cuenta elegida no se manda al servidor',
    /\.filter\(\(\[, accountId\]\) => !!accountId\)/.test(ajustes));

  console.log('\n5) La compra no fija ninguna cuenta\n');
  const compras = leer(COMPRAS);
  ok('la compra pide las cuentas puente', /fetch\('\/api\/v1\/accounting\/mappings'\)/.test(compras));
  ok('la cuenta de costo sale del puente cost_of_goods_sold', /enlaces\['cost_of_goods_sold'\]/.test(compras));
  // Habia DOS busquedas asi (al cargar y al reiniciar el formulario): por eso
  // no basta con mirar que no quede "la" linea, sino que no quede NINGUNA.
  ok('  y ya no se busca por el prefijo del codigo ni por el nombre, en ningun sitio',
    !/code\.startsWith\(/.test(compras) && !/includes\('costo de ventas'\)/.test(compras)
    && /enlaces\['cost_of_goods_sold'\]/.test(compras));
  // No basta con que el nombre aparezca: `false && mapeos['credit_card_payable']`
  // lo deja presente y no propone nada. Se ancla la PROPIEDAD: la propuesta
  // cuelga de que la forma de pago admita tarjeta, y lo propuesto es esa cuenta.
  ok('con tarjeta se propone la cuenta configurada',
    /admiteTarjetaDeCredito\([^)]*\)\s*&&\s*mapeos\['credit_card_payable'\]/.test(compras)
    && /setOrigenDelPago\(\s*conTarjeta \? valorDeOrigen\(\{ paymentAccountId: mapeos\['credit_card_payable'\] \}\)/.test(compras));
  // El filtro por pasivo es del lote 170: va unido a que la configurada se
  // distinga, que es lo que este lote añade.
  ok('  pero se puede elegir otra (una empresa puede tener varias tarjetas)',
    /acc\.type === 'liability'/.test(compras) && /\(configurada\)/.test(compras));

  console.log('\n6) El trinquete: ningun codigo de cuenta nuevo escrito a mano\n');
  // Los defectos de `resolverCuentaPorMapeo` son la lista de la tabla y los
  // vigila `cuentasDelSistema.vitest.ts`. Lo que se mira aqui es que no
  // aparezcan codigos de cuenta sueltos en las PANTALLAS, que es donde no hay
  // ninguna guarda.
  const codigoSuelto = /['"`]\d\.\d(\.\d\d)+['"`]/g;
  // La negacion sola es verdad de balde en ajustes (ahi nunca hubo codigos,
  // sino claves): va unida a que las filas salgan ya de la tabla.
  for (const [nombre, src, marca] of [
    ['compras', compras, /mapeos\['credit_card_payable'\]/],
    ['ajustes', ajustes, /PUENTES_DE_CUENTAS\.map\(/],
  ] as const) {
    const hallados = [...src.matchAll(codigoSuelto)].map((m) => m[0]);
    ok(`la pantalla de ${nombre} no lleva ningun codigo de cuenta escrito`,
      hallados.length === 0 && marca.test(src), hallados.join(' '));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
