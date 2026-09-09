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
];
for (const [ruta, nombre, recarga, sitios] of PANTALLAS) {
  const tc = sinComentarios(crudo(ruta) ?? '');
  ok(
    `${nombre}: guarda el fallo en un estado que no se limpia solo`,
    tc.includes('const [errorCarga, setErrorCarga] = useState<string | null>(null);') && tc.includes('setErrorCarga(null);')
  );
  ok(
    `${nombre}: el catch deja de callar`,
    tc.includes('setErrorCarga(motivoDeCarga(err') || tc.includes('setErrorCarga(motivoDeCarga(error')
  );
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

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
