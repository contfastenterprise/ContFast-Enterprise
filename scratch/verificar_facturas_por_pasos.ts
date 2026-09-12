/**
 * P2-35: la emision de una factura va por pasos.
 *
 * EL PROBLEMA
 * -----------
 * `/dashboard/invoices` metia 622 lineas de formulario en una sola pantalla:
 * tipo de comprobante, forma de pago, banco, NCF modificado y su motivo,
 * cliente, la tabla de articulos, notas, retenciones y totales, todo seguido.
 * Es la tercera y ultima de las tres pantallas de P2-35; compras ya se partio en
 * el lote 82 y usa esta misma mecanica.
 *
 * LO QUE HABIA QUE ARREGLAR ANTES DE PARTIRLA
 * -------------------------------------------
 * Partir el formulario tal cual lo habria dejado roto de tres maneras:
 *
 *  1. SEIS `required` NATIVOS dentro de `<form onSubmit>`. Un campo obligatorio
 *     que no se esta pintando hace que Chrome se niegue a enviar el formulario
 *     y NO ensene nada -- solo un "not focusable" en la consola. Y cuando si se
 *     ve, el globo del navegador se adelanta a zod con su propia redaccion,
 *     que es justo lo que P2-34 vino a quitar. Los seis los cubre el esquema.
 *
 *  2. TRES ERRORES PINTADOS EN LA SECCION EQUIVOCADA. `modifiedNcf` e
 *     `indicadorNotaCredito` son del paso 1 y su `err(...)` estaba debajo de la
 *     tabla de articulos. Con pasos, el usuario se quedaria trabado en el paso 1
 *     con el error pintado en el paso 3, y `irAlPrimerError` haria scroll a un
 *     elemento que no existe.
 *
 *  3. DOS CAMPOS SIN DONDE PINTARSE. `ecfType` y `paymentType` no tenian
 *     `err(...)` en ninguna parte: si el esquema los rechazaba, el asistente
 *     frenaba un paso sin decir por que.
 *
 * Y `indicadorNotaCredito` tenia DOS mecanismos de error compitiendo: uno
 * propio escrito a mano y el del esquema. Dos redacciones para una regla.
 *
 * LO QUE ESTE BANCO NO COMPRUEBA
 * ------------------------------
 * Que el navegador pinte los pasos. Eso no es nuestro. Lo que se comprueba --
 * ejecutando el esquema de verdad, no leyendolo -- es que el REPARTO SEA TOTAL:
 * todo campo que `esquemaFactura` puede rechazar cae en exactamente un paso. Si
 * alguno no cayera en ninguno, el asistente dejaria pasar los cuatro pasos en
 * verde y reventaria al emitir, que es el peor asistente posible.
 */
import { fuente, crudo, bloque } from './_fuente';
import { esquemaFactura } from '@/schemas/factura';
import { erroresPorCampo } from '@/schemas/errores';

// `pasos.ts` es de este lote: contra el arbol ANTERIOR no existe. Con un
// `import` estatico, correr este banco contra el estado de antes no da FALLA --
// revienta antes de imprimir una sola linea, y una contraprueba que no imprime
// no verifica nada. Por eso va dentro de un `await import` con su try.
type Pasos = typeof import('@/app/dashboard/invoices/pasos');

const PG = 'src/app/dashboard/invoices/page.tsx';
const PS = 'src/app/dashboard/invoices/pasos.ts';
const PA = 'src/components/ui/product-autocomplete.tsx';
const CO = 'src/app/dashboard/quotes/new/page.tsx';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

/** Un fichero que puede no existir todavia. Vacio en vez de excepcion. */
const leer = (ruta: string, conComentarios = false): string => {
  try {
    return (conComentarios ? crudo(ruta) : fuente(ruta)).replace(/\r\n/g, '\n');
  } catch {
    return '';
  }
};

/** Sin texto, toda negacion es cierta gratis. Se ata a que haya algo que leer. */
const tiene = (s: string, t: string): boolean => s.length > 0 && s.includes(t);
const noTiene = (s: string, t: string): boolean => s.length > 0 && !s.includes(t);

/**
 * Lo que hay entre dos marcadores.
 *
 * `bloque` no sirve aqui: sirve para cuerpos `{ ... }`, y un `() => ( <jsx/> )`
 * no lo es -- se quedaba con la primera llave de dentro del JSX y devolvia un
 * trocito de nada. Contar parentesis tampoco, porque los hay dentro de cadenas
 * ("Comprobantes Gubernamentales (e-45)"). Las cuatro funciones de paso son
 * contiguas, asi que cortar entre marcadores es exacto y no se puede enganar.
 */
function entre(src: string, desde: string, hasta: string): string {
  const a = src.indexOf(desde);
  if (a < 0) return '';
  const b = src.indexOf(hasta, a + desde.length);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}

/** Las claves del objeto que hay debajo de la cadena de `.refine(...)`. */
function clavesDelEsquema(esquema: unknown): string[] {
  let s: any = esquema;
  for (let i = 0; i < 20 && s; i++) {
    if (s.shape) return Object.keys(s.shape);
    const d = s._def ?? s.def;
    if (d?.shape) return Object.keys(typeof d.shape === 'function' ? d.shape() : d.shape);
    s = d?.schema ?? d?.innerType ?? s.innerType;
  }
  return [];
}

/** Lo que `buildInvoicePayload` manda con el formulario recien abierto. */
const VACIA = {
  customerId: undefined, warehouseId: '', ecfType: '31', paymentType: 'cash',
  bankName: undefined, transactionNumber: undefined, notes: undefined,
  modifiedNcf: undefined, modifiedInvoiceId: undefined,
  indicadorNotaCredito: undefined, quoteId: undefined,
  buyerRnc: undefined, buyerName: undefined,
  lines: [{ productId: '', productName: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 0.18, taxCategory: null, warehouseId: '' }],
};

const rutasQueFallan = (p: unknown): string[] => {
  const v = esquemaFactura.safeParse(p);
  return v.success ? [] : Object.keys(erroresPorCampo(v.error));
};

async function main(): Promise<void> {

let P: Pasos | null = null;
try {
  P = await import('@/app/dashboard/invoices/pasos');
} catch {
  P = null;
}
/** Una comprobacion que necesita la tabla de pasos. Sin ella, FALLA -- no crash. */
const conPasos = (t: string, f: (p: Pasos) => boolean): void =>
  ok(t, P !== null && f(P));

const src = leer(PG);
const pasos = leer(PS);
const auto = leer(PA);
const cot = leer(CO);

// No es una comprobacion, es la condicion para comprobar. Casi todo lo de abajo
// son negaciones, y una negacion sobre una cadena vacia es cierta gratis: con un
// fichero que no se pudo leer, este banco daria verde entero sin mirar nada.
// `pasos.ts` NO entra aqui: que falte es un resultado (FALLA), no un fallo de
// rutas. Los tres que si entran existen desde siempre.
if (src.length < 50000 || auto.length < 5000 || cot.length < 5000) {
  throw new Error(
    'No se pudieron leer los fuentes de facturas. Revisa las rutas antes de ' +
    'creerte nada de lo que siga.'
  );
}

// ============================================================================
// A. EL REPARTO ES TOTAL  (se EJECUTA el esquema, no se lee)
// ============================================================================
const claves = clavesDelEsquema(esquemaFactura);

// Precondicion, no comprobacion: este lote no toca el esquema, asi que salir
// OK aqui no dice nada -- salia OK igual antes. Lo que hace falta es que el
// desenvuelto de la cadena de `.refine(...)` haya funcionado: con `claves`
// vacio, los dos `every` de abajo son ciertos gratis y el banco daria verde sin
// mirar nada. Si cambia el numero de campos, hay que revisar el reparto a mano.
if (claves.length !== 17) {
  throw new Error(
    `Se esperaban 17 campos en esquemaFactura y se leyeron ${claves.length}. ` +
    'O el esquema cambio -- y entonces hay que repartir el campo nuevo en ' +
    'pasos.ts -- o el desenvuelto de los .refine() dejo de funcionar.'
  );
}

conPasos('cada campo del esquema cae en EXACTAMENTE un paso',
  (P) => claves.length > 0 && claves.every(c => P.PASOS.filter(p => P.campoDelPaso(c, p.n)).length === 1));

conPasos('no se reparte ningun campo que el esquema no tenga',
  (P) => P.PASOS.flatMap(p => p.campos as readonly string[]).every(c => claves.includes(c)));

conPasos('los cuatro pasos, y solo cuatro',
  (P) => P.PASOS.length === 4 && P.PASOS.map(p => p.n).join(',') === '1,2,3,4');

// Un paso sin campos no frena nunca: seria un "Siguiente" que siempre pasa.
// Solo el ultimo puede permitirselo, porque ahi no se avanza, se emite.
conPasos('solo el ultimo paso puede no vigilar nada',
  (P) => P.PASOS.slice(0, 3).every(p => p.campos.length > 0));

// --- Y lo mismo con facturas concretas, que es donde se ve el efecto.
const vacia = rutasQueFallan(VACIA);
conPasos('una factura vacia falla, y todo lo que falla tiene paso',
  (P) => vacia.length > 0 && vacia.every(c => P.PASOS.filter(p => P.campoDelPaso(c, p.n)).length === 1));

conPasos('una factura vacia manda al paso 2 (falta el RNC del credito fiscal)',
  (P) => P.primerPasoConFallo(vacia) === 2 && vacia.includes('buyerRnc'));

const nota = rutasQueFallan({ ...VACIA, ecfType: '34', indicadorNotaCredito: 0 });
conPasos('una nota de credito sin motivo manda al paso 1, no al 3',
  (P) => P.primerPasoConFallo(nota) === 1
    && nota.includes('modifiedNcf') && nota.includes('indicadorNotaCredito')
    && P.campoDelPaso('indicadorNotaCredito', 1) && !P.campoDelPaso('indicadorNotaCredito', 3));

const transfer = rutasQueFallan({ ...VACIA, paymentType: 'bank_transfer' });
conPasos('una transferencia sin banco manda al paso 1',
  (P) => P.primerPasoConFallo(transfer) === 1 && transfer.includes('bankName'));

conPasos('las lineas y el almacen son del paso 3',
  (P) => vacia.filter(c => c.startsWith('lines') || c === 'warehouseId').length > 0
    && vacia.filter(c => c.startsWith('lines') || c === 'warehouseId').every(c => P.campoDelPaso(c, 3)));

conPasos('sin nada que corregir no hay paso al que mandar',
  (P) => P.primerPasoConFallo([]) === null);

// ============================================================================
// B. LOS `required` NATIVOS
// ============================================================================
// El unico que queda es el del modal de crear cliente, que es OTRO <form> con su
// propio submit y no entra en el asistente. Por eso se cuenta uno, no cero: con
// "ninguno" la comprobacion se rompería el dia que alguien toque ese modal, y
// con "los del formulario de factura" haria falta recortar el fichero. Uno es
// exacto y se explica solo.
const veces = (s: string, t: string): number => s.split(t).length - 1;
ok('en la pantalla de facturas solo queda UN required, el del modal de cliente',
  veces(src, '\n                    required\n') + veces(src, '\n                required\n')
  + veces(src, 'step="any" required') === 1);

ok('el selector de producto ya no lleva required',
  !auto.includes('required'));

// Precondicion: quitar el `required` del componente compartido solo es seguro
// porque cotizaciones ya comprueba lo mismo por su cuenta, y MAS estricto
// -- exige producto elegido, no solo texto escrito. Eso era cierto antes de
// este lote tambien, asi que como `ok(...)` solo inflaria el marcador. Como
// excepcion sirve: el dia que esa guarda desaparezca, quitar el `required` pasa
// a ser una perdida de validacion y este banco lo dice.
if (!cot.includes('lines.some(l => !l.productId)')) {
  throw new Error(
    'Cotizaciones ya no comprueba por su cuenta que cada linea tenga producto. ' +
    'Sin esa guarda, quitar el `required` del selector compartido SI debilita ' +
    'la pantalla: revisa esto antes de creerte el resto.'
  );
}

// ============================================================================
// C. CADA ERROR, EN SU PASO
// ============================================================================
const p1 = entre(src, 'const paso1 = () => (', 'const paso2 = () => (');
const p2 = entre(src, 'const paso2 = () => (', 'const paso3 = () => (');
const p3 = entre(src, 'const paso3 = () => (', 'const paso4 = () => (');
const p4 = entre(src, 'const paso4 = () => (', 'const repaso = () => {');
const rep4 = entre(src, 'const repaso = () => {', 'const barraPasos = () => (');
const nav = entre(src, 'const navegacionPasos = () => (', '\n  return (');

// Aqui NO hay excepcion: que los pasos no existan es justo lo que este lote
// cambia, asi que contra el arbol anterior tiene que salir FALLA y seguir
// imprimiendo. Lo que si hace falta es que ningun trozo vacio de por buena una
// negacion -- de eso se encargan `tiene` y `noTiene`.

ok('el error del NCF modificado y el del motivo se pintan en el paso 1',
  tiene(p1, "err('modifiedNcf')") && tiene(p1, "err('indicadorNotaCredito')"));

ok('y ya NO se pintan debajo de la tabla de articulos',
  noTiene(p3, "err('modifiedNcf')") && noTiene(p3, "err('indicadorNotaCredito')"));

ok('el tipo de comprobante y la forma de pago ya tienen donde pintar su error',
  tiene(p1, "err('ecfType')") && tiene(p1, "err('paymentType')"));

ok('el almacen se queda con los articulos, que es de lo que habla',
  tiene(p3, "err('warehouseId')") && noTiene(p1, "err('warehouseId')"));

ok('los datos del comprador se pintan en el paso 2',
  tiene(p2, "err('buyerRnc')") && tiene(p2, "err('buyerName')"));

// El motivo de la nota tenia su propio aviso a mano ADEMAS del del esquema.
ok('el motivo de la nota ya no tiene dos mensajes para la misma regla',
  !src.includes('Campo obligatorio'));

// ============================================================================
// D. EL ASISTENTE
// ============================================================================
ok('la pantalla usa la tabla de pasos, no una lista suya',
  tiene(src, "from './pasos'") && tiene(src, 'campoDelPaso(')
  && tiene(src, 'PASOS.length'));

const del = bloque(src, 'const erroresDelPaso =');
ok('lo que frena un paso sale del MISMO esquema que valida el servidor',
  tiene(del, 'esquemaFactura.safeParse(buildInvoicePayload())')
  && tiene(del, 'campoDelPaso(campo, n)'));

// Sin esto, un precio por debajo del costo dejaria pasar los cuatro pasos en
// verde y saltaria al emitir -- que es justo el asistente que no se quiere.
ok('un paso tambien frena por lo que el esquema no puede ver (precio bajo costo)',
  tiene(del, 'erroresBasicos()'));

const ir = bloque(src, 'const irAPaso =');
ok('saltar hacia adelante valida lo de en medio; hacia atras es libre',
  tiene(ir, 'if (n <= paso)')
  && tiene(ir, 'for (let i = paso; i < n; i++)') && tiene(ir, 'frenaElPaso(i)'));

ok('cada paso es una FUNCION que devuelve JSX, no un componente',
  ['paso1', 'paso2', 'paso3', 'paso4'].every(p => tiene(src, `const ${p} = () => (`))
  && noTiene(src, 'function Paso'));

ok('sigue habiendo forma de verlo todo de una vez',
  tiene(src, 'vistaCompleta') && tiene(src, 'setVistaCompleta(v => !v)'));

ok('el repaso del paso 4 enseña el comprobante y el cliente, no solo el total',
  tiene(rep4, 'Tipo de comprobante') && tiene(rep4, 'Cliente')
  && tiene(rep4, 'irAPaso(dePaso)'));

// ============================================================================
// E. LAS TRES PUERTAS DE ENTRADA
// ============================================================================
ok('una factura convertida desde cotizacion se suelta en el repaso',
  tiene(bloque(src, 'const cargarCotizacion ='), 'setPaso(PASOS.length)'));

ok('editar un borrador abre la vista completa, no el asistente',
  tiene(bloque(src, 'const handleLoadDraft ='), 'setVistaCompleta(true)'));

ok('empezar de cero vuelve al paso 1 y a la vista por pasos',
  tiene(bloque(src, 'const resetForm = () =>'), 'setPaso(1)')
  && tiene(bloque(src, 'const resetForm = () =>'), 'setVistaCompleta(false)'));

// Un borrador es una factura A MEDIAS: si el boton solo viviera en el paso 4
// habria que atravesar la validacion de los tres anteriores para aparcarla.
ok('se puede guardar un borrador desde cualquier paso',
  tiene(nav, 'handleSaveDraft'));

// Y no puede salir dos veces: en el paso 4 la navegacion no pinta boton.
ok('y no sale dos veces en el ultimo paso',
  tiene(nav, 'paso < PASOS.length ?'));

// ============================================================================
// F. LO QUE SE MOVIO, SE MOVIO ENTERO
// ============================================================================
// Las seis secciones se mudaron tal cual. Si al partirlas se hubiera perdido un
// campo por el camino, esto lo caza: son los controles que tenian que seguir
// existiendo, cada uno en su paso.
ok('el paso 1 conserva sus cinco controles',
  ['value={ecfType}', 'value={paymentType}', 'value={bankName}',
   'value={transactionNumber}', 'value={indicadorNotaCredito}'].every(c => tiene(p1, c)));

ok('el paso 2 conserva el cliente entero',
  ['<CustomerAutocomplete', 'value={customerRnc}', 'value={customerPhone}'].every(c => tiene(p2, c)));

ok('el paso 3 conserva la tabla de articulos',
  ['<ProductAutocomplete', 'handleAddLine', 'avisosDeStock'].every(c => tiene(p3, c)));

ok('el paso 4 conserva notas, retenciones, totales y los botones de emitir',
  ['value={notes}', '<RetentionSelector', 'Total Bruto', 'Emitir e Imprimir',
   'handleSaveDraft'].every(c => tiene(p4, c)));

// El aviso de existencia se repite en el repaso a proposito: en el paso 4 las
// lineas ya no se ven, y es justo cuando mas importa.
//
// Contar `avisosDeStock.map(` no basta por si solo: quitar la LLAMADA a
// `repaso()` deja su definicion entera en el fichero y el numero no se mueve.
// Por eso se comprueba tambien que el paso 4 lo llame.
ok('el paso 4 llama al repaso, y el aviso de existencia lo acompaña',
  tiene(p4, 'repaso()') && veces(src, 'avisosDeStock.map(') === 2);

// ============================================================================
// G. EL CONTRATO ESCRITO
// ============================================================================
// La frase va partida por el salto de linea del comentario (`EXACTAMENTE un\n
// * paso`), asi que buscarla tal cual no la encuentra nunca. Se aplana primero.
// Lo cazo el propio contraste, no la lectura.
const aplanado = leer(PS, true).replace(/\n\s*\*?/g, ' ').replace(/\s+/g, ' ');
ok('pasos.ts explica por que el reparto tiene que ser total',
  tiene(aplanado, 'EXACTAMENTE un paso'));

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);

}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
