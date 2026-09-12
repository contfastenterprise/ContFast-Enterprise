/**
 * P2-34 en productos: una sola validacion, y cada error debajo de su campo.
 *
 * LO QUE HABIA
 * ------------
 * TRES sitios y ninguno se hablaba con los otros:
 *
 *  1. `createProductSchema`, dentro de `api/v1/products/route.ts`.
 *  2. `updateProductSchema`, dentro de `api/v1/products/[id]/route.ts`.
 *  3. La pantalla, que no validaba NADA: armaba el cuerpo, lo mandaba, y si el
 *     servidor lo rechazaba enseñaba su mensaje en un aviso efimero sin marcar
 *     ningun campo.
 *
 * Los dos esquemas ya habian empezado a separarse -- `name` obligatorio en uno
 * y opcional en el otro, y los valores por defecto solo en el de crear -- y
 * ninguno de los dos lo podia importar la pantalla, porque viven dentro de
 * rutas.
 *
 * Y LOS ASTERISCOS MENTIAN
 * ------------------------
 * Nombre, categoria, costo y unidad llevan asterisco rojo en la pantalla, pero
 * en el servidor los cuatro eran opcionales: un POST directo creaba un producto
 * sin categoria y sin costo. Lo unico que los exigia eran cuatro `required` del
 * navegador -- que ademas hay que quitar, porque se adelantan a zod con su
 * propia redaccion y, en cuanto el campo no se esta pintando, hacen que Chrome
 * se niegue a enviar el formulario sin decir nada.
 *
 * EL VACIO NO ERA CERO, PERO SE GUARDABA COMO CERO
 * ------------------------------------------------
 * La pantalla mandaba `cost: Number(formData.cost)`, y `Number('')` es 0. Un
 * costo en blanco se guardaba como cero -- y el aviso de "precio por debajo del
 * costo" de la pantalla de facturas es `cost > 0 && unitPrice < cost`, asi que
 * ese producto se quedaba SIN suelo de precio y nadie lo decia.
 *
 * LO QUE ESTE BANCO NO COMPRUEBA
 * ------------------------------
 * Que el navegador pinte los mensajes. Eso no es nuestro. Lo que se comprueba
 * -- ejecutando el esquema de verdad, no leyendolo -- es que decida lo mismo
 * para el alta, la edicion y la pantalla, que distinga un hueco de un cero, y
 * que el parcial de la edicion NO invente valores.
 */
import { fuente, crudo } from './_fuente';

// `src/schemas/producto.ts` es de este lote: contra el arbol ANTERIOR no existe.
// Con un `import` estatico, correr este banco contra el estado de antes no da
// FALLA -- revienta antes de imprimir una sola linea, y una contraprueba que no
// imprime no verifica nada. Por eso va dentro de un `await import` con su try.
type Modulo = typeof import('@/schemas/producto');

const PG = 'src/app/dashboard/products/page.tsx';
const ES = 'src/schemas/producto.ts';
const RT = 'src/app/api/v1/products/route.ts';
const RI = 'src/app/api/v1/products/[id]/route.ts';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
/** Lo que manda la pantalla con el modal recien abierto. */
const VACIO = {
  sku: '', barcode: '', name: '', categoryId: '', unitOfMeasure: 'unidad',
  cost: '', price: '', priceConsumidor: '', priceMayorista: '', priceProveedor: '',
  status: 'active', isOnSale: false, tracksInventory: true, promotionalPrice: '',
};
const BUENO = { ...VACIO, name: 'Puerta de caoba', categoryId: UUID, cost: '1200' };

async function main(): Promise<void> {

let M: Modulo | null = null;
try {
  M = await import('@/schemas/producto');
} catch {
  M = null;
}
/** Una comprobacion que necesita el modulo. Sin el, FALLA -- no revienta. */
const conModulo = (t: string, f: (m: Modulo) => boolean): void =>
  ok(t, M !== null && f(M));

const rutas = (p: unknown): Record<string, string> => {
  if (!M) return {};
  const r = M.esquemaProducto.safeParse(p);
  return r.success ? {} : M.erroresPorCampo(r.error);
};
const pasa = (p: unknown): boolean => M !== null && M.esquemaProducto.safeParse(p).success;
const falla = (p: unknown): boolean => M !== null && !M.esquemaProducto.safeParse(p).success;

// ============================================================================
// A. LA REGLA, EJECUTADA
// ============================================================================
const vacio = rutas(VACIO);
ok('el formulario recien abierto falla por nombre, categoria y costo',
  Object.keys(vacio).sort().join(',') === 'categoryId,cost,name');

ok('y cada fallo dice de que campo es, no "error de validacion"',
  !!vacio.cost?.includes('costo') && !!vacio.categoryId?.includes('categor')
  && !!vacio.name?.includes('nombre'));

ok('bien relleno, pasa', pasa(BUENO));

// ESTE es el hueco de `Number('')`.
ok('un costo en blanco se rechaza; NO se convierte en cero',
  falla({ ...BUENO, cost: '' }) && !!rutas({ ...BUENO, cost: '' }).cost?.includes('requerido'));

// Pero cero SI es un costo valido: un servicio puede costar cero, y hay uno asi
// en la base. Confundirlos habria bloqueado su edicion.
ok('un costo de CERO escrito a proposito si pasa',
  pasa({ ...BUENO, cost: '0' }) && pasa({ ...BUENO, cost: 0 }));

ok('un costo negativo se rechaza por negativo, no por ausente',
  !!rutas({ ...BUENO, cost: '-5' }).cost?.includes('negativo'));

// `Number(true)` es 1: aceptar `cost: true` como "cuesta 1" seria peor que
// rechazarlo.
ok('un costo que no es numero se rechaza, booleanos incluidos',
  !!rutas({ ...BUENO, cost: 'abc' }).cost?.includes('número')
  && !!rutas({ ...BUENO, cost: true }).cost?.includes('número'));

ok('la categoria tiene que ser una de verdad, no texto suelto',
  falla({ ...BUENO, categoryId: 'ferreteria' }) && falla({ ...BUENO, categoryId: '' }));

ok('el estado solo puede ser activo o inactivo',
  falla({ ...BUENO, status: 'archivado' }) && pasa({ ...BUENO, status: 'inactive' }));

ok('una oferta sin precio promocional no pasa, y el fallo es del precio',
  rutas({ ...BUENO, isOnSale: true, promotionalPrice: '' }).promotionalPrice !== undefined
  && pasa({ ...BUENO, isOnSale: true, promotionalPrice: '999' }));

conModulo('al crear si se asumen los valores por defecto', (m) => {
  const r = m.esquemaProducto.safeParse({ name: 'X', categoryId: UUID, cost: 10, unitOfMeasure: 'unidad' });
  return r.success && r.data.status === 'active'
    && r.data.isOnSale === false && r.data.tracksInventory === true;
});

// --- El parcial de la edicion
conModulo('la edicion admite un cuerpo con un solo campo',
  (m) => m.esquemaProductoParcial.safeParse({ name: 'Solo el nombre' }).success);

// Casi se cuela: `.partial()` NO se lleva por delante un `.default(...)`. Con
// los valores por defecto en el objeto base, un `PUT {}` devolvia
// `isOnSale: false` y `tracksInventory: true` y los ESCRIBIA, apagando la
// oferta y encendiendo el control de existencia de un producto que nadie habia
// tocado. Se vio ejecutandolo.
conModulo('la edicion NO inventa valores: lo que no viene, no se toca', (m) => {
  const r = m.esquemaProductoParcial.safeParse({});
  return r.success && Object.keys(r.data).length === 0;
});

conModulo('pero lo que SI viene en la edicion se valida igual que al crear',
  (m) => !m.esquemaProductoParcial.safeParse({ cost: -1 }).success
    && !m.esquemaProductoParcial.safeParse({ status: 'archivado' }).success);

// --- La regla de los precios, que estaba dos veces
conModulo('el precio base y el de consumidor se cubren el uno al otro',
  (m) => m.completarPrecios({ price: 100 }).priceConsumidor === 100
    && m.completarPrecios({ priceConsumidor: 90 }).price === 90);

conModulo('y si vienen los dos, no se pisan',
  (m) => m.completarPrecios({ price: 100, priceConsumidor: 90 }).price === 100
    && m.completarPrecios({ price: 100, priceConsumidor: 90 }).priceConsumidor === 90);

conModulo('sin ninguno de los dos, no se inventa ninguno',
  (m) => Object.keys(m.completarPrecios({})).length === 0);

// ============================================================================
// B. EL RESTO SE LEE
// ============================================================================
const leer = (ruta: string, conComentarios = false): string => {
  try {
    return (conComentarios ? crudo(ruta) : fuente(ruta)).replace(/\r\n/g, '\n');
  } catch {
    return '';
  }
};
const tiene = (s: string, t: string): boolean => s.length > 0 && s.includes(t);
const noTiene = (s: string, t: string): boolean => s.length > 0 && !s.includes(t);
const veces = (s: string, t: string): number => s.split(t).length - 1;

const pg = leer(PG);
const rt = leer(RT);
const ri = leer(RI);
const es = leer(ES);

// Precondicion, no comprobacion: casi todo lo que sigue son negaciones, y una
// negacion sobre una cadena vacia es cierta gratis.
if (pg.length < 50000 || rt.length < 5000 || ri.length < 3000) {
  throw new Error(
    'No se pudieron leer los fuentes de productos. Revisa las rutas antes de ' +
    'creerte nada de lo que siga.'
  );
}

// --- Una sola copia
ok('ya no hay dos esquemas de producto escondidos en las rutas',
  noTiene(rt, 'createProductSchema') && noTiene(ri, 'updateProductSchema'));

ok('las dos rutas importan el compartido',
  tiene(rt, "from '@/schemas/producto'") && tiene(ri, "from '@/schemas/producto'"));

ok('el alta usa el entero y la edicion el parcial',
  tiene(rt, 'esquemaProducto.safeParse(body)')
  && tiene(ri, 'esquemaProductoParcial.safeParse(body)'));

// `z` se quedaba huerfano en las dos: su unico uso era el esquema que se fue.
ok('y ninguna de las dos se deja el import de zod sin usar',
  noTiene(rt, "from 'zod'") && noTiene(ri, "from 'zod'"));

ok('la resta de precios se escribe UNA vez, en el modulo',
  tiene(rt, 'completarPrecios(') && tiene(ri, 'completarPrecios(')
  && noTiene(rt, 'data.priceConsumidor = data.price')
  && noTiene(ri, 'data.priceConsumidor = data.price')
  && veces(es, 'salida.priceConsumidor = salida.price') === 1);

// --- El servidor dice QUE campo
ok('las dos rutas devuelven `fields`, no solo el primer mensaje',
  tiene(rt, 'fields: campos') && tiene(ri, 'fields: campos'));

// --- La pantalla
ok('la pantalla valida con el MISMO esquema antes de mandar',
  tiene(pg, "from '@/schemas/producto'") && tiene(pg, 'esquemaProducto.safeParse('));

ok('y manda lo que salio del esquema, no el formulario en crudo',
  tiene(pg, 'JSON.stringify(validacion.data)')
  && noTiene(pg, 'cost: Number(formData.cost)'));

ok('cada error se pinta debajo de su campo',
  tiene(pg, 'data-campo={campo}') && veces(pg, "err('") >= 12);

ok('y si el servidor manda `fields`, tambien se pintan',
  tiene(pg, 'data.error?.fields'));

// Mirar solo el `.filter(...)` no bastaba: al mutante le sobraba con cambiar de
// DONDE salen las filas -- `[]` en vez de los errores -- y el filtro seguia
// intacto. Lo que importa es que la red lea `errores`.
ok('hay una red para el fallo que no tenga su propio hueco',
  tiene(pg, 'CAMPOS_CON_SITIO')
  && tiene(pg, 'Object.entries(errores)\n                  .filter(([k]) => !CAMPOS_CON_SITIO.includes(k))')
  && tiene(pg, 'data-campo={k}'));

ok('se salta al primer error, y se limpian al abrir y al cerrar',
  tiene(pg, 'irAlPrimerError') && veces(pg, 'setErrores({})') >= 3);

// --- Los required nativos
// El unico que se queda es el del sub-modal de crear categoria: es OTRO <form>
// con su propio submit y no entra en esto. Uno, no cero: con "ninguno" la
// comprobacion se rompe el dia que alguien toque ese modal.
ok('en la pantalla de productos solo queda UN required, el del modal de categoria',
  veces(pg, '\n                    required\n')
  + veces(pg, '\n                      required\n')
  + veces(pg, '\n                        required\n')
  + veces(pg, 'required={formData.isOnSale}') === 1);

// --- El contrato escrito
const aplanado = leer(ES, true).replace(/\n\s*\*?/g, ' ').replace(/\s+/g, ' ');
ok('el modulo explica por que el vacio no es cero',
  tiene(aplanado, 'EL VACIO NO ES CERO'));

ok('y deja escrito que se midio antes de apretar los campos',
  tiene(aplanado, 'productos_sin_datos.sql'));

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);

}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
