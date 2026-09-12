/**
 * P2-35 en productos: el alta va por pasos.
 *
 * Cierra P2-35. Compras fue el lote 82, facturas el 87, y esta es la tercera de
 * las tres pantallas que nombraba la auditoria.
 *
 * POR QUE HIZO FALTA EL LOTE 88 PRIMERO
 * -------------------------------------
 * En compras y en facturas, lo que frena un paso sale de correr el esquema
 * compartido y mirar que ruta de error cae en que paso. Productos no tenia
 * esquema compartido: habia DOS copias, las dos dentro de rutas, y la pantalla
 * no validaba nada. Hacer los pasos antes del 88 habria significado escribir a
 * mano las reglas de cada paso -- la cuarta copia, y la unica que el servidor
 * no comprueba.
 *
 * LO QUE ES DISTINTO AQUI
 * -----------------------
 * 1. TRES pasos, no cuatro. No hay paso de repaso: un producto no es un
 *    comprobante fiscal, no hay un momento "ahora se firma" que revisar.
 *
 * 2. SE PUEDE GUARDAR DESDE CUALQUIER PASO. Por lo mismo. Y eso obliga a algo
 *    que en las otras dos no hacia falta: si el esquema rechaza un campo de un
 *    paso que no se esta viendo, el asistente tiene que IR a ese paso. Si no, el
 *    error se pinta en una pantalla invisible y el boton parece no hacer nada.
 *    De eso se encarga `primerPasoConFallo`.
 *
 * 3. Los codigos de barra bajan al final. Es el bloque mas grande, el que menos
 *    gente toca, y todo lo suyo es opcional; tenerlo en medio obligaba a
 *    atravesarlo para llegar al costo, que si es obligatorio.
 *
 * LO QUE ESTE BANCO NO COMPRUEBA
 * ------------------------------
 * Que el navegador pinte los pasos. Eso no es nuestro. Lo que se comprueba --
 * ejecutando el esquema de verdad, no leyendolo -- es que el reparto sea TOTAL
 * y que guardar lleve al paso correcto.
 */
import { fuente, crudo } from './_fuente';
import { esquemaProducto, erroresPorCampo } from '@/schemas/producto';

// `pasos.ts` es de este lote: contra el arbol ANTERIOR no existe. Con un
// `import` estatico, correr este banco contra el estado de antes no da FALLA --
// revienta antes de imprimir una sola linea, y una contraprueba que no imprime
// no verifica nada.
type Pasos = typeof import('@/app/dashboard/products/pasos');

const PG = 'src/app/dashboard/products/page.tsx';
const PS = 'src/app/dashboard/products/pasos.ts';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

/**
 * Lo que hay entre dos marcadores.
 *
 * Cortar un `() => ( <jsx/> )` emparejando llaves no vale -- se queda con la
 * primera llave de dentro del JSX -- y contar parentesis tampoco, porque los hay
 * dentro de cadenas. Las funciones de paso son contiguas, asi que cortar entre
 * marcadores es exacto. (Aprendido en el lote 87.)
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

const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
/** Lo que manda la pantalla con el modal recien abierto. */
const VACIO = {
  sku: '', barcode: '', name: '', categoryId: '', unitOfMeasure: 'unidad',
  cost: '', price: '', priceConsumidor: '', priceMayorista: '', priceProveedor: '',
  status: 'active', isOnSale: false, tracksInventory: true, promotionalPrice: '',
};
const BUENO = { ...VACIO, name: 'Puerta de caoba', categoryId: UUID, cost: '1200' };

const rutasQueFallan = (p: unknown): string[] => {
  const r = esquemaProducto.safeParse(p);
  return r.success ? [] : Object.keys(erroresPorCampo(r.error));
};

async function main(): Promise<void> {

let P: Pasos | null = null;
try {
  P = await import('@/app/dashboard/products/pasos');
} catch {
  P = null;
}
/** Una comprobacion que necesita la tabla de pasos. Sin ella, FALLA -- no crash. */
const conPasos = (t: string, f: (p: Pasos) => boolean): void =>
  ok(t, P !== null && f(P));

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
const veces = (s: string, t: string): number => s.split(t).length - 1;

const src = leer(PG);

// `pasos.ts` NO entra aqui: que falte es un resultado (FALLA), no un fallo de
// rutas. La pantalla existe desde siempre.
if (src.length < 50000) {
  throw new Error(
    'No se pudo leer la pantalla de productos. Revisa las rutas antes de ' +
    'creerte nada de lo que siga.'
  );
}

// ============================================================================
// A. EL REPARTO ES TOTAL  (se EJECUTA el esquema, no se lee)
// ============================================================================
const claves = clavesDelEsquema(esquemaProducto);

// Precondicion, no comprobacion: este lote no toca el esquema, asi que salir OK
// aqui no diria nada -- salia OK igual antes. Lo que hace falta es que el
// desenvuelto haya funcionado: con `claves` vacio, los `every` de abajo son
// ciertos gratis y el banco daria verde sin mirar nada.
if (claves.length !== 17) {
  throw new Error(
    `Se esperaban 17 campos en esquemaProducto y se leyeron ${claves.length}. ` +
    'O el esquema cambio -- y entonces hay que repartir el campo nuevo en ' +
    'pasos.ts -- o el desenvuelto de los .refine() dejo de funcionar.'
  );
}

conPasos('cada campo del esquema cae en EXACTAMENTE un paso',
  (P) => claves.length > 0 && claves.every(c => P.PASOS.filter(p => P.campoDelPaso(c, p.n)).length === 1));

conPasos('no se reparte ningun campo que el esquema no tenga',
  (P) => P.PASOS.flatMap(p => p.campos as readonly string[]).every(c => claves.includes(c)));

conPasos('los tres pasos, y solo tres',
  (P) => P.PASOS.length === 3 && P.PASOS.map(p => p.n).join(',') === '1,2,3');

// Un paso que no vigila nada no puede frenar nunca: su "Siguiente" siempre pasa.
// Aqui NINGUNO puede permitirselo, porque no hay paso de repaso.
conPasos('los tres pasos vigilan algo: ninguno es un Siguiente que siempre pasa',
  (P) => P.PASOS.every(p => p.campos.length > 0));

// --- Y a donde manda guardar, que es lo propio de este lote
const vacio = rutasQueFallan(VACIO);
conPasos('un formulario vacio manda al paso 1',
  (P) => vacio.length > 0 && P.primerPasoConFallo(vacio) === 1);

conPasos('si solo falta el costo, guardar lleva al paso 2 -- no deja el error escondido',
  (P) => {
    const f = rutasQueFallan({ ...VACIO, name: 'X', categoryId: UUID });
    return f.join(',') === 'cost' && P.primerPasoConFallo(f) === 2;
  });

conPasos('una oferta sin precio promocional tambien lleva al paso 2',
  (P) => {
    const f = rutasQueFallan({ ...BUENO, isOnSale: true });
    return f.includes('promotionalPrice') && P.primerPasoConFallo(f) === 2;
  });

conPasos('los codigos de barra son del paso 3, el ultimo',
  (P) => P.campoDelPaso('barcode', 3) && P.campoDelPaso('secondaryBarcodes.0.barcode', 3)
    && !P.campoDelPaso('barcode', 1) && !P.campoDelPaso('barcode', 2));

conPasos('el costo va ANTES que los codigos de barra',
  (P) => {
    const dePaso = (c: string) => P.PASOS.find(p => P.campoDelPaso(c, p.n))?.n ?? 99;
    return dePaso('cost') < dePaso('barcode');
  });

conPasos('sin nada que corregir no hay paso al que mandar',
  (P) => P.primerPasoConFallo([]) === null && rutasQueFallan(BUENO).length === 0);

// ============================================================================
// B. EL RESTO SE LEE
// ============================================================================
const p1 = entre(src, 'const paso1 = () => (', 'const paso2 = () => (');
const p2 = entre(src, 'const paso2 = () => (', 'const paso3 = () => (');
const p3 = entre(src, 'const paso3 = () => (', 'const barraPasos = () => (');

ok('la pantalla usa la tabla de pasos, no una lista suya',
  tiene(src, "from './pasos'") && tiene(src, 'campoDelPaso(') && tiene(src, 'PASOS.length'));

const del = entre(src, 'const erroresDelPaso =', 'const frenaElPaso =');
ok('lo que frena un paso sale del MISMO esquema que valida el servidor',
  tiene(del, 'esquemaProducto.safeParse(cuerpoDelFormulario())')
  && tiene(del, 'campoDelPaso(campo, n)'));

// Si cada uno armara el cuerpo por su cuenta, un paso podria dar verde con un
// cuerpo distinto del que se acaba mandando.
ok('el paso y el guardado validan EL MISMO cuerpo',
  tiene(src, 'const cuerpoDelFormulario = () => ({')
  && veces(src, 'cuerpoDelFormulario()') === 2);

ok('guardar desde cualquier paso lleva al paso dueño del primer fallo',
  tiene(src, 'primerPasoConFallo(Object.keys(campos))')
  && tiene(src, 'if (destino !== null && !vistaCompleta) setPaso(destino)'));

const ir = entre(src, 'const irAPaso =', 'const paso1 = () => (');
ok('saltar hacia adelante valida lo de en medio; hacia atras es libre',
  tiene(ir, 'if (n <= paso)')
  && tiene(ir, 'for (let i = paso; i < n; i++)') && tiene(ir, 'frenaElPaso(i)'));

ok('cada paso es una FUNCION que devuelve JSX, no un componente',
  ['paso1', 'paso2', 'paso3'].every(p => tiene(src, `const ${p} = () => (`))
  && noTiene(src, 'function Paso'));

ok('sigue habiendo forma de verlo todo de una vez',
  tiene(src, 'vistaCompleta') && tiene(src, 'setVistaCompleta(v => !v)'));

ok('editar un producto abre la vista completa, no el asistente',
  tiene(entre(src, 'const openEditModal =', 'const openInventoryModal ='), 'setVistaCompleta(true)'));

ok('empezar de cero vuelve al paso 1 y a la vista por pasos',
  tiene(entre(src, 'const openNewModal =', 'const openEditModal ='), 'setPaso(1)')
  && tiene(entre(src, 'const openNewModal =', 'const openEditModal ='), 'setVistaCompleta(false)'));

// El "Siguiente" no puede salir en el ultimo paso -- no hay a donde --, pero
// guardar tiene que salir en TODOS, que es la decision de este lote.
ok('el Siguiente desaparece en el ultimo paso; guardar no',
  tiene(src, '{paso < PASOS.length && (') && veces(src, "type=\"submit\"") === 2);

// ============================================================================
// C. LO QUE SE MOVIO, SE MOVIO ENTERO
// ============================================================================
// Los bloques se mudaron tal cual. Si al partirlos se hubiera perdido un campo,
// esto lo caza: son los controles que tenian que seguir existiendo, cada uno en
// su paso -- y en el paso que le toca, que es lo que el reordenado pudo romper.
// Aqui NO hay excepcion: que los pasos no existan es justo lo que este lote
// cambia, asi que contra el arbol anterior tiene que salir FALLA y seguir
// imprimiendo. Lo que si hace falta es que ningun trozo vacio de por buena una
// negacion -- de eso se encargan `tiene` y `noTiene`.

ok('el paso 1 lleva lo que identifica al producto',
  ['value={formData.name}', 'value={formData.categoryId}', 'value={formData.unitOfMeasure}',
   'value={formData.status}', 'value={formData.sku}'].every(c => tiene(p1, c)));

ok('el paso 2 lleva el costo, los cuatro precios y los dos interruptores',
  ['value={formData.cost}', 'value={formData.price}', 'value={formData.priceConsumidor}',
   'value={formData.priceMayorista}', 'value={formData.priceProveedor}',
   'value={formData.promotionalPrice}', 'formData.tracksInventory', 'formData.isOnSale',
  ].every(c => tiene(p2, c)));

ok('el paso 3 lleva los codigos de barra enteros, secundarios incluidos',
  ['value={formData.barcode}', '<BarcodeRenderer', 'secondaryBarcodes.map',
   'handleAddSecondaryBarcode'].every(c => tiene(p3, c)));

// El reordenado es justo lo que puede dejar un bloque en el paso equivocado.
ok('y nada se quedo donde estaba: los codigos NO estan en el paso 1',
  noTiene(p1, 'value={formData.barcode}') && noTiene(p2, 'value={formData.barcode}'));

ok('ni el costo en el paso 3',
  noTiene(p3, 'value={formData.cost}') && noTiene(p1, 'value={formData.cost}'));

// "siguen puestos" salia OK contra el arbol anterior: los errores por campo son
// del lote 88, no de este. Lo que SI es de este lote es que cada uno este en el
// paso que le toca -- y es justo lo que el reordenado de los bloques pudo
// romper: un `err('barcode')` que se quedara en el paso 1 marcaria un campo que
// no se esta viendo.
conPasos('cada error por campo se pinta en el paso dueño de ese campo', (P) => {
  const trozo: Record<number, string> = { 1: p1, 2: p2, 3: p3 };
  const campos = [...src.matchAll(/err\('(\w+)'\)/g)].map(m => m[1]);
  const unicos = [...new Set(campos)];
  if (unicos.length < 12) return false;
  return unicos.every((campo) => {
    const suyo = P.PASOS.find(p => P.campoDelPaso(campo, p.n))?.n;
    if (suyo === undefined) return false;
    // En SU paso si, y en los otros dos no.
    return tiene(trozo[suyo], `err('${campo}')`)
      && [1, 2, 3].filter(n => n !== suyo).every(n => noTiene(trozo[n], `err('${campo}')`));
  });
});

// Precondicion, no comprobacion: el mecanismo de pintar errores es del lote 88,
// asi que salir OK aqui no dice nada de este. Como excepcion si sirve: sin el,
// la comprobacion de arriba -- que cada error este en su paso -- no tendria
// errores que repartir y pasaria por vacuidad.
if (!tiene(src, 'data-campo={campo}') || !tiene(src, 'CAMPOS_CON_SITIO')) {
  throw new Error(
    'La pantalla de productos ya no pinta errores por campo (lote 88). Sin eso, ' +
    'repartirlos en pasos no significa nada: revisa esto antes de creerte el resto.'
  );
}

// ============================================================================
// D. EL CONTRATO ESCRITO
// ============================================================================
const aplanado = leer(PS, true).replace(/\n\s*\*?/g, ' ').replace(/\s+/g, ' ');
ok('pasos.ts explica por que el reparto tiene que ser total',
  tiene(aplanado, 'EXACTAMENTE un paso'));

ok('y por que los codigos de barra van al final',
  tiene(aplanado, 'CODIGOS DE BARRA VAN AL FINAL'));

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);

}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
