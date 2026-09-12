/**
 * El cuerpo de un producto, validado en UN sitio.
 *
 * POR QUE EXISTE
 * --------------
 * Habia DOS copias, las dos dentro de rutas, asi que la pantalla no podia usar
 * ninguna: `createProductSchema` en `api/v1/products/route.ts` y
 * `updateProductSchema` en `api/v1/products/[id]/route.ts`. Y ya habian
 * empezado a separarse -- `name` obligatorio en una y opcional en la otra,
 * `unitOfMeasure`, `status`, `isOnSale` y `tracksInventory` con valor por
 * defecto solo en la de crear.
 *
 * La pantalla, mientras tanto, no validaba NADA: armaba el cuerpo, lo mandaba,
 * y si el servidor lo rechazaba enseñaba el mensaje en un aviso efimero sin
 * marcar ningun campo. Lo unico que exigia algo eran cuatro `required` del
 * navegador -- que ademas hay que quitar, porque un campo obligatorio que no se
 * esta pintando hace que Chrome se niegue a enviar el formulario sin decir
 * nada.
 *
 * LO QUE LA PANTALLA YA PEDIA, AHORA SE PIDE DE VERDAD
 * ----------------------------------------------------
 * Nombre, categoria, costo y unidad de medida llevan asterisco rojo en la
 * pantalla desde siempre, pero en el servidor los cuatro eran opcionales: un
 * POST directo creaba un producto sin categoria y sin costo. Ahora son
 * obligatorios en los dos lados.
 *
 * Se midio antes de decidirlo (`scratch/_to_delete/productos_sin_datos.sql`):
 * de 87 productos, NINGUNO sin categoria, NINGUNO sin unidad y UNO con costo
 * cero. Como cero es un costo valido -- un servicio puede tener costo cero --,
 * no se bloquea a nadie al editar.
 *
 * EL VACIO NO ES CERO
 * -------------------
 * `Number('')` es 0, y la pantalla mandaba `cost: Number(formData.cost)`: un
 * costo en blanco llegaba al servidor como 0 y se guardaba tan campante. Eso
 * importa mas de lo que parece, porque el aviso de "precio por debajo del
 * costo" de la pantalla de facturas es `cost > 0 && unitPrice < cost` -- un
 * producto con costo 0 se queda SIN suelo de precio y nadie lo dice. Aqui un
 * campo vacio es `undefined`, no cero, y se rechaza por su nombre.
 */
import { z } from 'zod';
export { erroresPorCampo } from './errores';

/**
 * Lo que llega de un formulario: decimales como texto, y campos vacios.
 *
 * Un booleano o un objeto pasan TAL CUAL a proposito, para que fallen por tipo:
 * `Number(true)` es 1, y aceptar `cost: true` como "cuesta 1" seria peor que
 * rechazarlo.
 */
const aCantidad = (v: unknown): unknown => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isNaN(n) ? v : n;
};

/** Un texto de formulario: en blanco es "no lo escribio", no cadena vacia. */
const aTexto = (v: unknown): unknown => {
  if (v === null || v === undefined) return undefined;
  if (typeof v !== 'string') return v;
  const t = v.trim();
  return t === '' ? undefined : t;
};

const dinero = (que: string) =>
  z.preprocess(aCantidad, z.number({
    error: (iss) => iss.input === undefined ? `${que} es requerido.` : `${que} debe ser un número.`,
  }).nonnegative(`${que} no puede ser negativo.`));

const dineroOpcional = (que: string) =>
  z.preprocess(aCantidad, z.number({ error: `${que} debe ser un número.` })
    .nonnegative(`${que} no puede ser negativo.`).optional());

/** Texto que puede venir vacio o nulo y se guarda como nulo. */
const textoOpcional = (max: number, que: string) =>
  z.preprocess(aTexto, z.string({ error: `${que} debe ser texto.` }).max(max, `${que} no puede pasar de ${max} caracteres.`).nullish());

/**
 * Los campos, sin reglas cruzadas y SIN valores por defecto.
 *
 * Va aparte por dos motivos, y el segundo casi se cuela:
 *
 *  1. zod no deja `.partial()` sobre un esquema que ya lleva `.refine(...)`:
 *     "cannot be used on object schemas containing refinements".
 *
 *  2. `.partial()` NO se lleva por delante un `.default(...)`. La primera
 *     version ponia los valores por defecto aqui, y entonces el parcial de la
 *     edicion los seguia aplicando: un `PUT {}` -- o un `PUT` con un solo campo
 *     -- devolvia `isOnSale: false` y `tracksInventory: true` y los ESCRIBIA,
 *     apagando la oferta y encendiendo el control de existencia de un producto
 *     que nadie habia tocado. Se vio ejecutandolo, no leyendolo. Los valores por
 *     defecto se ponen abajo, solo en el esquema de crear.
 */
const camposProducto = z.looseObject({
  // Los cuatro con asterisco en la pantalla.
  name: z.preprocess(aTexto, z.string({ error: 'El nombre del producto es requerido.' })
    .max(255, 'El nombre no puede pasar de 255 caracteres.')),
  categoryId: z.preprocess(aTexto, z.string({ error: 'Selecciona una categoría.' })
    .uuid('Selecciona una categoría.')),
  cost: dinero('El costo'),
  unitOfMeasure: z.preprocess(aTexto, z.string({ error: 'Selecciona la unidad de medida.' })
    .max(50, 'La unidad de medida no puede pasar de 50 caracteres.')),

  // Los precios los rellena sola la pantalla desde el costo, asi que no se
  // exigen: lo que no puede es venir negativo.
  price: dineroOpcional('El precio base'),
  priceConsumidor: dineroOpcional('El precio consumidor'),
  priceProveedor: dineroOpcional('El precio proveedor'),
  priceMayorista: dineroOpcional('El precio mayorista'),
  promotionalPrice: dineroOpcional('El precio promocional'),

  sku: textoOpcional(100, 'El SKU'),
  description: z.preprocess(aTexto, z.string().nullish()),
  imageUrl: z.preprocess(aTexto, z.string().nullish()),
  barcode: textoOpcional(100, 'El código de barra'),

  status: z.preprocess(aTexto, z.enum(['active', 'inactive'], {
    error: 'El estado solo puede ser activo o inactivo.',
  }).optional()),
  isOnSale: z.boolean({ error: 'La oferta solo puede estar activada o desactivada.' }).optional(),
  tracksInventory: z.boolean({ error: 'El control de existencia solo puede estar activado o desactivado.' }).optional(),

  secondaryBarcodes: z.array(z.object({
    barcode: z.string().min(1, 'El código secundario no puede ir vacío.'),
    barcodeType: z.string(),
  })).optional(),
});

/**
 * Lo que valida la pantalla y el alta: los campos, mas la regla cruzada.
 *
 * Una oferta sin precio promocional es una oferta sin oferta: la tienda
 * enseñaria el precio de consumidor con el cartel de rebaja puesto.
 */
export const esquemaProducto = camposProducto.extend({
  // Los valores por defecto viven SOLO aqui: al crear, lo que no venga se
  // asume; al editar (el parcial), lo que no venga no se toca.
  status: z.preprocess(aTexto, z.enum(['active', 'inactive'], {
    error: 'El estado solo puede ser activo o inactivo.',
  }).default('active')),
  isOnSale: z.boolean({ error: 'La oferta solo puede estar activada o desactivada.' }).default(false),
  tracksInventory: z.boolean({ error: 'El control de existencia solo puede estar activado o desactivado.' }).default(true),
}).refine(
  (d) => !d.isOnSale || (typeof d.promotionalPrice === 'number' && d.promotionalPrice > 0),
  { message: 'Escribe el precio promocional o desactiva la oferta.', path: ['promotionalPrice'] }
);

/**
 * La edicion: los mismos campos, todos opcionales.
 *
 * Es lo que ya hacia `updateProductSchema` y hay que conservarlo, porque un
 * PUT puede traer solo lo que cambia. Ausente significa "no lo toques"; lo que
 * SI venga se valida igual que al crear.
 *
 * OJO: la pantalla NO usa este. Manda siempre el formulario entero, asi que
 * valida contra `esquemaProducto` tanto al crear como al editar -- si usara el
 * parcial, un campo que el usuario borrase pasaria como "no lo toques" en vez
 * de como un hueco.
 *
 * NO lleva la regla de la oferta, y es a proposito: en un cuerpo parcial
 * `{ isOnSale: true }` el precio promocional puede estar ya guardado en la
 * base, y este esquema no la ve. Rechazarlo seria inventarse un fallo. Por el
 * camino de la pantalla la regla si se aplica, porque la pantalla manda el
 * formulario completo y valida con `esquemaProducto`.
 */
export const esquemaProductoParcial = camposProducto.partial();

/**
 * El precio base y el de consumidor se cubren el uno al otro.
 *
 * Estaba escrito DOS veces, una en cada ruta, con las dos ramas en orden
 * invertido -- equivalentes, porque las condiciones se excluyen, pero dos
 * copias de la misma regla esperando a separarse.
 */
type Precios = { price?: number; priceConsumidor?: number };

// El tipo de vuelta es `T & Precios` y no `T`: la funcion ANADE campos, asi que
// decir que devuelve lo mismo que recibio era mentir. Lo cazo `tsc --strict`
// desde el banco, al leer `.priceConsumidor` de algo que solo tenia `price`.
export function completarPrecios<T extends Precios>(datos: T): T & Precios {
  const salida = { ...datos };
  if (salida.price === undefined && salida.priceConsumidor !== undefined) {
    salida.price = salida.priceConsumidor;
  } else if (salida.priceConsumidor === undefined && salida.price !== undefined) {
    salida.priceConsumidor = salida.price;
  }
  return salida;
}
