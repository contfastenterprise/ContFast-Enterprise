import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..');

const crudo = (rutaRelativa: string): string | null => {
  const p = join(RAIZ, rutaRelativa);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
};

/** Sin las lineas de comentario: los comentarios citan lo que se quito. */
const sinComentarios = (t: string): string =>
  t
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═══════ P2-37: un fallo al cargar no es "no tienes registros" ═══════
//
// Las listas del panel cargaban asi:
//
//     try { ... if (data.success) setLista(data.data) }
//     catch (err) { console.error(err) }        // o un toast que se va
//
// Si la carga fallaba -- red caida, 500, sesion expirada -- la lista se quedaba
// vacia y la pantalla pintaba su mensaje de "no hay nada". Y si el API
// respondia `success: false`, la mitad de las pantallas ni lo miraban: mismo
// resultado, sin siquiera el aviso.
//
// El caso extremo es Cuentas por Pagar: al fallar enseñaba un tilde verde y
// "¡Al dia con los proveedores!". Una felicitacion por no deber nada, dicha
// justo cuando no se habia podido comprobar si se debia algo.

const s = crudo('src/components/ui/estado-carga.tsx');
ok('existe el componente compartido', s !== null);
if (s) {
  ok(
    'dice que no haber podido leer no es no tener registros',
    s.includes('Esto NO significa que no haya registros: significa que no se pudieron leer.')
  );
  ok('enseña el motivo, no solo un boton de reintentar', s.includes('{mensaje}') && s.includes('onReintentar'));
  ok(
    'traduce los fallos de red, y no inventa los que no reconoce',
    s.includes('No se pudo contactar con el servidor') &&
      s.includes("return m || 'Error inesperado al cargar los datos.';")
  );
  ok('se puede localizar en el DOM para comprobarlo', s.includes('data-error-carga'));
} else {
  for (let i = 0; i < 4; i++) ok('componente: (no existe)', false);
}

// [pantalla, nombre, funcion de recarga, cuantos sitios pintan el error]
const PANTALLAS: [string, string, string, number][] = [
  ['src/app/dashboard/ecf/page.tsx', 'e-CF', 'fetchInvoices', 1],
  ['src/app/dashboard/invoices/page.tsx', 'facturas', 'loadInvoices', 2],
  ['src/app/dashboard/ap/page.tsx', 'CxP', 'fetchData', 1],
  ['src/app/dashboard/quotes/page.tsx', 'cotizaciones', 'fetchQuotes', 2],
  ['src/app/dashboard/customers/page.tsx', 'clientes', 'fetchCustomers', 2],
  ['src/app/dashboard/suppliers/page.tsx', 'suplidores', 'fetchSuppliers', 1],
  ['src/app/dashboard/delivery-notes/page.tsx', 'conduces', 'loadDeliveryNotes', 1],
  ['src/app/dashboard/inventory/movements/page.tsx', 'movimientos', 'fetchMovements', 2],
  ['src/app/dashboard/purchases/orders/page.tsx', 'pedidos', 'fetchOrders', 1],
  ['src/app/dashboard/cash/page.tsx', 'caja', 'loadHistory', 1],
  ['src/app/dashboard/products/page.tsx', 'productos', '() => fetchProducts()', 2],
  ['src/app/dashboard/hr/employees/page.tsx', 'empleados', 'fetchData', 1],
  ['src/app/dashboard/hr/overtime/page.tsx', 'horas extra', 'fetchData', 1],
  ['src/app/dashboard/adjustments/page.tsx', 'notas de ajuste', 'loadAdjustments', 1],
  ['src/app/dashboard/receivables-report/page.tsx', 'reporte de cobros', 'fetchData', 1],
  ['src/app/dashboard/admin/companies/page.tsx', 'empresas', 'fetchData', 1],
  ['src/app/dashboard/products/barcodes/page.tsx', 'codigos de barras', 'fetchProducts', 1],
];
for (const [ruta, nombre, recarga, sitios] of PANTALLAS) {
  const tc = sinComentarios(crudo(ruta) ?? '');
  ok(
    `${nombre}: guarda el fallo en un estado que no se limpia solo`,
    tc.includes('const [errorCarga, setErrorCarga] = useState<string | null>(null);') && tc.includes('setErrorCarga(null);')
  );
  // El nombre del error ligado varia por fichero (`err`, `error`, `e`): lo que
  // importa es que el catch deje rastro, no como se llame la variable.
  ok(`${nombre}: el catch deja de callar`, /setErrorCarga\(motivoDeCarga\((?!null)/.test(tc));
  ok(`${nombre}: un success:false tampoco pasa por vacio`, tc.includes('setErrorCarga(motivoDeCarga(null,'));
  // Una pantalla con vista movil Y tabla tiene DOS sitios que pintan el vacio.
  // Cubrir uno solo deja el fallo disfrazado en la mitad de los casos.
  ok(
    `${nombre}: el error se pinta en sus ${sitios} vista(s), con su recarga`,
    tc.split(`<ErrorDeCarga mensaje={errorCarga} onReintentar={${recarga}} />`).length - 1 === sitios
  );
}

// El caso extremo, por su nombre: al fallar, CxP felicitaba.
{
  const t = crudo('src/app/dashboard/ap/page.tsx') ?? '';
  const iErr = t.indexOf('errorCarga ? (');
  const iFelicita = t.indexOf('¡Al día con los proveedores!');
  ok('CxP: la felicitacion ya no puede salir cuando la carga falla', iErr >= 0 && iFelicita >= 0 && iErr < iFelicita);
}


// `hr/overtime` guarda TRES listas en un objeto, no una. Vaciarlo con `[]` no
// compila -- y si compilara, romperia la pestaña activa. Se comprueba porque el
// barrido es mecanico y este es justo el sitio donde lo mecanico se equivoca.
{
  const ot = crudo('src/app/dashboard/hr/overtime/page.tsx') ?? '';
  ok(
    'horas extra: vaciar respeta la forma del estado, no es un [] a secas',
    ot.includes('const SIN_REGISTROS = { overtime: [], income: [], deduction: [] };') && !ot.includes('setRecords([])')
  );
}


// Contabilidad no encaja en la forma de las demas: un cargador atiende SEIS
// pestañas y ninguna tenia `else`. Un fallo dejaba cada una con los datos de la
// consulta anterior -- otro rango, otra cuenta -- presentados como los de esta.
// En contabilidad eso es un balance que no cuadra con el periodo que dice
// arriba.
{
  const ct = crudo('src/app/dashboard/accounting/page.tsx') ?? '';
  const ctc = sinComentarios(ct);
  ok(
    'contabilidad: un solo estado de error para las seis pestañas',
    ctc.includes('const [errorCarga, setErrorCarga] = useState<string | null>(null);') && ctc.includes('setErrorCarga(null);')
  );
  ok(
    'contabilidad: las seis ramas dejan rastro del success:false',
    ctc.split('setErrorCarga(motivoDeCarga(null, data.error?.message));').length - 1 === 5 &&
      ctc.includes('setErrorCarga(motivoDeCarga(err));')
  );
  ok(
    'contabilidad: cada rama vacia LO SUYO, no deja lo anterior en pantalla',
    ['setJournals([]);', 'setTrialBalanceData([]);', 'setFinancialsData(null);', 'setPeriods([]);'].every((x) =>
      ctc.includes(x)
    )
  );
  ok(
    'contabilidad: el auxiliar deja de fingir que no elegiste cuenta',
    ct.includes('Seleccione una cuenta contable') &&
      ctc.indexOf('setErrorCarga(motivoDeCarga(null, data.error?.message));') >= 0 &&
      ctc.indexOf('setErrorCarga(motivoDeCarga(null, data.error?.message));') < ctc.indexOf('Seleccione una cuenta contable')
  );
  ok(
    'contabilidad: el aviso se pinta encima, antes de cualquier pestaña',
    ctc.includes('{errorCarga && !loading && (') &&
      ctc.includes('<ErrorDeCarga mensaje={errorCarga} onReintentar={fetchData} />') &&
      ctc.indexOf('{errorCarga && !loading && (') >= 0 &&
      ctc.indexOf('{errorCarga && !loading && (') < ctc.indexOf("{activeTab === 'catalog' && (")
  );
}


// Conciliacion bancaria no encaja en la forma generica: el reintento necesita la
// cuenta seleccionada y hay DOS consultas -- movimientos e historial --, cada
// una con su `success`.
{
  const bc = sinComentarios(crudo('src/app/dashboard/reports/bank-reconciliation/page.tsx') ?? '');
  ok(
    'conciliacion: las dos consultas dejan rastro, y el catch tambien',
    bc.split('setErrorCarga(motivoDeCarga(null,').length - 1 === 2 && bc.includes('setErrorCarga(motivoDeCarga(err));')
  );
  ok(
    'conciliacion: el reintento pasa el id de la cuenta, no el objeto',
    bc.includes('onReintentar={() => selectedAccount && fetchData(selectedAccount.id)}')
  );
}


// Segunda vez en el barrido que se asume la FORMA del estado al vaciarlo:
// `hr/overtime` guarda tres listas en un objeto y aqui `data` es un array. tsc
// caza las dos, pero se fijan para que no vuelvan por la puerta de atras.
{
  const rr = crudo('src/app/dashboard/receivables-report/page.tsx') ?? '';
  ok(
    'reporte de cobros: vaciar respeta la forma del estado (un array, no null)',
    rr.includes('setData([]);') && !rr.includes('setData(null)')
  );
}


// Transferencias miraba `whData.data` a secas, nunca `success`: un cuerpo de
// error no trae `data`, asi que no entraba por ningun lado. Y su vacio vive
// DENTRO del desplegable de busqueda, o sea que el fallo se leia como "ese
// producto no existe" mientras escribias su nombre.
{
  const bruto = crudo('src/app/dashboard/inventory/transfer/page.tsx') ?? '';
  const tr = sinComentarios(bruto);
  ok(
    'transferencias: comprueba success, no la mera presencia de data',
    tr.includes('if (whData.success && whData.data) {') && tr.includes('if (prData.success && prData.data) {')
  );
  ok(
    'transferencias: el desplegable deja de decir que el producto no existe',
    bruto.includes('Esto no significa que el producto no exista.')
  );
}

// Ajustes de inventario carga con promesas dentro de un useEffect y usa `active`
// para descartar respuestas de una busqueda ya obsoleta. El error lo respeta.
{
  const ai = sinComentarios(crudo('src/app/dashboard/inventory/adjustments/page.tsx') ?? '');
  ok(
    'ajustes de inventario: el fallo respeta la busqueda en curso',
    ai.split('if (!active) return;').length - 1 === 2 && ai.includes('setErrorCarga(motivoDeCarga(err));')
  );
}

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
