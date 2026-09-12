/**
 * Las tablas de CxC y CxP son la misma (auditoria P2-36).
 *
 * QUE SE COMPRUEBA
 * ----------------
 * Lo que importa no es que las dos usen la misma libreria: es que no puedan
 * volver a DIVERGIR EN COMPORTAMIENTO, que es lo que habia pasado. Eran dos
 * ficheros de ~300 lineas haciendo lo mismo de dos formas, y con el tiempo:
 *
 *   - cobrar escondia las cuentas saldadas y pagar las enseñaba;
 *   - cobrar contaba los dias desde la EMISION bajo el rotulo "Dias Venc." y
 *     pagar desde el VENCIMIENTO;
 *   - la paginacion de cobrar era un adorno, con los dos botones `disabled`
 *     fijos y un contador que decia el total.
 *
 * Por eso este banco insiste en que los dos `ListTab` sean ENVOLTORIOS y que
 * lo unico que los distinga sea el `tipo`. Y ejecuta la normalizacion contra
 * las DOS formas de datos reales, que es donde estaba la mitad del problema:
 * cobrar manda los importes como cadena y pagar como numero.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { fuente, crudo } from './_fuente';

const RAIZ = join(__dirname, '..');

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
const veces = (s: string, t: string): number => s.split(t).length - 1;

/** Un fichero que aun no existe se lee como vacio: las comprobaciones fallan
 *  solas en vez de tumbar el banco con una excepcion de lectura. */
const leer = (ruta: string): string =>
  existsSync(join(RAIZ, ruta)) ? fuente(ruta).replace(/\r\n/g, '\n') : '';
const leerCrudo = (ruta: string): string =>
  existsSync(join(RAIZ, ruta)) ? crudo(ruta).replace(/\r\n/g, '\n') : '';

const TABLA = 'src/components/financial/TablaCuentas.tsx';
const LISTAS: [string, string][] = [
  ['cobrar', 'src/app/dashboard/financial/accounts-receivable/components/ListTab.tsx'],
  ['pagar', 'src/app/dashboard/financial/accounts-payable/components/ListTab.tsx'],
];

async function main(): Promise<number> {
  // Contra el arbol anterior el modulo NO EXISTE, y un `import` normal ni
  // siquiera llega a ejecutarse: revienta al cargar. Una contraprueba que se
  // cae no dice si falla por lo que crees, asi que se carga a mano.
  let Docs: any = null;
  try {
    Docs = await import('../src/services/cartera/documentos');
  } catch {
    Docs = null;
  }
  const hay = !!Docs && typeof Docs.normalizarFila === 'function'
    && typeof Docs.filtrarFilas === 'function';

  ok('existe el modulo de normalizacion, fuera de las pantallas', hay);

  // ─────────────────────── lo que se ejecuta ───────────────────────
  const HOY = '2026-09-12';

  // Las formas REALES de las dos acciones. Cobrar manda decimales como cadena
  // (columna `decimal` de drizzle) y trae ncf/codigoFactura; pagar manda numeros
  // y no trae ninguno de los dos.
  const bCobrar = {
    id: 'a1b2c3d4-0000-0000-0000-000000000000',
    amount: '1180.00', balance: '1180.00',
    dueDate: '2026-08-13', createdAt: new Date('2026-07-14T10:30:00'),
    customerName: 'Ferretería Central', ncf: 'B0100000123', codigoFactura: 'FAC-0042',
  };
  const bPagar = {
    id: 'ff001122-0000-0000-0000-000000000000',
    amount: 5000, balance: 5000,
    dueDate: '2026-09-12', createdAt: new Date('2026-08-12T09:00:00'),
    supplierName: 'Aluminios del Este',
  };

  const c = hay ? Docs.normalizarFila(bCobrar, 'cobrar', HOY) : null;
  const p = hay ? Docs.normalizarFila(bPagar, 'pagar', HOY) : null;

  ok('las dos formas de datos acaban en la misma fila',
    !!c && !!p
    && c.montoOriginal === 1180 && c.saldo === 1180       // venian como cadena
    && p.montoOriginal === 5000 && p.saldo === 5000       // venian como numero
    && c.entidad === 'Ferretería Central' && p.entidad === 'Aluminios del Este');

  ok('el documento usa el codigo cuando lo hay, y el id cuando no',
    !!c && c.documento === 'FAC-0042'
    && Docs.normalizarFila({ ...bCobrar, ncf: null, codigoFactura: null }, 'cobrar', HOY).documento === 'CXC-A1B2C3D4'
    && !!p && p.documento === 'CXP-FF001122');

  // Las dos cifras que antes se llamaban igual.
  ok('antiguedad y atraso salen por separado y son distintas',
    !!c && c.antiguedad === 60 && c.atraso === 30);

  // El fallo de fechas del lote anterior, visto desde aqui.
  ok('lo que vence hoy no esta vencido',
    !!p && p.atraso === 0 && p.estado === 'al-dia');

  ok('una saldada no es una vencida, aunque su fecha pasara',
    hay && Docs.normalizarFila({ ...bCobrar, balance: '0.00' }, 'cobrar', HOY).estado === 'pagado'
    && Docs.normalizarFila({ ...bCobrar, balance: '0.01' }, 'cobrar', HOY).estado === 'pagado'
    && Docs.normalizarFila({ ...bCobrar, balance: '0.02' }, 'cobrar', HOY).estado === 'vencida');

  ok('una fila rota no tumba la tabla',
    hay && Docs.normalizarFila({}, 'cobrar', HOY).saldo === 0
    && Docs.normalizarFila({ ...bCobrar, balance: 'x' }, 'cobrar', HOY).saldo === 0
    && Docs.normalizarFilas(null as any, 'cobrar', HOY).length === 0);

  // La discrepancia que resolvio el interruptor.
  {
    const filas = hay ? Docs.normalizarFilas([bCobrar, { ...bCobrar, id: 'z', balance: '0.00' }], 'cobrar', HOY) : [];
    ok('por defecto las saldadas no salen, y con el interruptor si',
      hay && Docs.filtrarFilas(filas, '', false).length === 1
      && Docs.filtrarFilas(filas, '', true).length === 2);
    ok('buscar no resucita una saldada',
      hay && Docs.filtrarFilas(filas, 'ferret', false).length === 1);
  }

  // ─────────────────────── lo que se lee ───────────────────────

  for (const [tipo, ruta] of LISTAS) {
    const src = leer(ruta);
    const lineas = leerCrudo(ruta).split('\n').length;

    // Un envoltorio de 300 lineas no es un envoltorio.
    ok(`${tipo}: el ListTab es un envoltorio (${lineas} lineas)`, lineas < 30);

    ok(`${tipo}: solo delega en la tabla compartida`,
      src.includes("import TablaCuentas from '@/components/financial/TablaCuentas'")
      && src.includes(`tipo="${tipo}"`)
      && veces(src, '<TablaCuentas') === 1);

    // Si alguno vuelve a traerse columnas, impresion o CSV, ya empezaron a
    // separarse otra vez.
    ok(`${tipo}: no se queda con logica propia`,
      !src.includes('columns') && !src.includes('handlePrint')
      && !src.includes('handleExportCSV') && !src.includes('<table'));
  }

  {
    const t = leer(TABLA);

    ok('la tabla usa tanstack con paginacion de verdad',
      t.includes("from '@tanstack/react-table'")
      && t.includes('getPaginationRowModel()')
      && t.includes('disabled={!table.getCanPreviousPage()}')
      && t.includes('disabled={!table.getCanNextPage()}'));

    // Lo que habia antes: `<Button ... disabled>` a secas, siempre apagado.
    //
    // Acotado AL PIE, no a todo el fichero. Con la regex suelta sobre el
    // fichero entero esto no cazaba nada: `[^>]*` se corta en el `>` de la
    // flecha del `onClick`, asi que un boton apagado a mano se le escapaba.
    // Lo comprobe con un mutante.
    //
    // Y el `pie.length > 0` tampoco sobra: sin el, con el fichero todavia
    // inexistente el recorte sale vacio, la negacion se cumple sola y esta
    // linea salia VERDE contra el arbol anterior.
    // Anclado en el `className` del pie, que es CODIGO. Mi primera version lo
    // anclaba en el comentario `{/* Pie: paginacion de verdad */}` -- y
    // `fuente()` quita los comentarios, asi que el recorte salia vacio. Es la
    // tercera vez en esta auditoria que caigo en lo mismo.
    const pie = t.slice(t.indexOf('border-t border-outline-variant/20 flex flex-col'));
    ok('ningun boton del pie esta apagado a mano',
      pie.length > 0 && !/disabled(?!=)/.test(pie) && veces(pie, 'disabled={!table.getCan') === 2);

    ok('estan las DOS columnas de dias, cada una con su nombre',
      t.includes("accessorKey: 'antiguedad'") && t.includes("accessorKey: 'atraso'")
      && t.includes('Antigüedad') && t.includes('Atraso')
      && !t.includes('Días Venc'));

    ok('el interruptor de saldadas existe y arranca oculto',
      t.includes('const [verSaldadas, setVerSaldadas] = useState(false)')
      && t.includes('setVerSaldadas(v => !v)'));

    // Si el papel trajera otra cosa que la pantalla, nadie sabria cual creer.
    ok('el papel y el CSV salen de lo que se ve, no de los datos crudos',
      veces(t, 'const visibles = ') === 1
      && t.includes('table.getSortedRowModel().rows.map(r => r.original)')
      && t.includes('const filasVisibles = visibles();')   // impresion
      && t.includes('visibles().map(f => [')               // csv
      // Si alguno leyera `data` por su cuenta, imprimiria tambien las saldadas
      // y las filas filtradas: el papel diria otra cosa que la pantalla.
      && !/handlePrint[\s\S]*?data\.(map|filter|reduce)/.test(t)
      && !/handleExportCSV[\s\S]*?data\.(map|filter|reduce)/.test(t));

    // Un `hoyDia()` por celda parte la tabla en dos si la pestaña cruza la
    // medianoche.
    ok('el dia de hoy se congela una vez, no por fila',
      t.includes('const hoy = useMemo(() => hoyDia(), [])')
      && veces(t, 'hoyDia()') === 1);

    // Todo lo que distingue a las dos pantallas sale de un solo sitio.
    ok('los rotulos salen de PALABRAS[tipo], no escritos a mano',
      t.includes('const P = PALABRAS[tipo]')
      && !t.includes('Cuentas por Cobrar') && !t.includes('Cuentas por Pagar')
      && !t.includes('supplierName') && !t.includes('customerName'));

    ok('el dinero va en la fuente de cifras de la casa',
      veces(t, 'font-mono-data') >= 4);
  }

  console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
  return fallos === 0 ? 0 : 1;
}

main().then(c => process.exit(c), e => { console.error(e); process.exit(2); });
