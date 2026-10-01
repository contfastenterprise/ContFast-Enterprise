/**
 * La foto de un producto (lote 234). Reportado por el dueno (2026-10-01): "la
 * pagina de productos no hay opcion para agregar imagen, para que se pueda
 * ver en el catalogo". Medido en el lote 231: 0 de 87 productos con foto, y el
 * formulario no tenia el campo aunque la API y la base ya lo aceptaban.
 *
 * Reglas puras (sin red ni base), para que la ruta, la pantalla y el banco
 * usen las mismas:
 *
 *  · QUE ES UNA FOTO lo dicen sus PRIMEROS BYTES, no el nombre ni el tipo que
 *    declara el navegador: los dos los escribe quien sube. Solo JPEG, PNG y
 *    WebP. SVG NO: es un documento que puede llevar codigo, y esto se ensena en
 *    una pagina publica.
 *  · La extension y el tipo con que se guarda salen de esa deteccion.
 *  · La ruta lleva la EMPRESA delante: una foto solo se guarda bajo la empresa
 *    de la sesion.
 *  · `imageUrl` solo admite fotos NUESTRAS (del deposito publico, bajo la
 *    empresa) o nada. La API aceptaba cualquier texto; con la tienda publica,
 *    una direccion ajena serviria para rastrear a los visitantes o para colgar
 *    cualquier imagen con el nombre de la empresa.
 */
export const DEPOSITO_DE_FOTOS = 'product_images';

/**
 * EL PESO. Pedido del dueno al ver el lote ("que el servidor no se llene
 * rapido"): la foto se REDUCE en el navegador antes de subir -- lado mayor de
 * 1.200 px y WebP -- y el servidor no guarda nada de mas de 1 MB. Una foto de
 * movil pesa 3-8 MB; para la tienda (una tarjeta y una ficha) sobran 100-200 KB.
 * El tope del servidor es lo que LIMITA de verdad el almacenamiento: reducir en
 * el navegador es una cortesia que cualquiera puede saltarse llamando a la ruta.
 */
export const PESO_MAXIMO_DE_FOTO = 1024 * 1024;
export const LADO_MAXIMO_DE_FOTO = 1200;
/** Calidades que se prueban, de mejor a peor, hasta caber en el tope. */
export const CALIDADES_DE_FOTO = [0.82, 0.7, 0.55] as const;
/** Lo que se deja ELEGIR en el formulario antes de reducir (una foto de camara). */
export const PESO_MAXIMO_DEL_ORIGINAL = 25 * 1024 * 1024;

/** Las medidas con que se guarda: cabe en `lado` x `lado`, sin deformar y sin AGRANDAR. */
export function medidasReducidas(ancho: number, alto: number, lado = LADO_MAXIMO_DE_FOTO): { ancho: number; alto: number } {
  if (!(ancho > 0) || !(alto > 0)) throw new Error('La imagen no tiene medidas.');
  const factor = Math.min(1, lado / Math.max(ancho, alto));
  return { ancho: Math.max(1, Math.round(ancho * factor)), alto: Math.max(1, Math.round(alto * factor)) };
}
export const TIPOS_DE_FOTO = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type TipoDeFoto = { mime: (typeof TIPOS_DE_FOTO)[number]; ext: 'jpg' | 'png' | 'webp' };

const empieza = (b: Uint8Array, firma: number[], desde = 0) => firma.every((x, i) => b[desde + i] === x);

/** JPEG, PNG o WebP segun sus bytes; cualquier otra cosa, `null`. */
export function tipoDeFoto(bytes: Uint8Array): TipoDeFoto | null {
  if (bytes.length < 12) return null;
  if (empieza(bytes, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' };
  if (empieza(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: 'png' };
  // "RIFF" .... "WEBP"
  if (empieza(bytes, [0x52, 0x49, 0x46, 0x46]) && empieza(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/** Por que NO se acepta el fichero, o `null` si vale. */
export function motivoParaNoAceptarFoto(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return 'El archivo está vacío.';
  if (bytes.length > PESO_MAXIMO_DE_FOTO) return 'La imagen pesa más de 1 MB. Súbela desde el formulario, que la reduce sola.';
  if (!tipoDeFoto(bytes)) return 'El archivo no es una imagen JPG, PNG o WebP.';
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `<empresa>/<id>.<ext>`: el nombre lo pone el servidor, nunca el del fichero subido. */
export function rutaDeFoto(companyId: string, id: string, ext: TipoDeFoto['ext']): string {
  if (!UUID.test(companyId) || !UUID.test(id)) throw new Error('Identificador invalido para la foto.');
  return `${companyId}/${id}.${ext}`;
}

/** La direccion publica de una foto guardada. */
export function direccionDeFoto(supabaseUrl: string, ruta: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${DEPOSITO_DE_FOTOS}/${ruta}`;
}

/**
 * ¿Se puede guardar esta `imageUrl` en un producto de esta empresa? Vacia si
 * (quitar la foto); si no, tiene que ser una foto nuestra, de esta empresa, con
 * el nombre que pone el servidor.
 */
export function esFotoAdmisible(url: string | null | undefined, supabaseUrl: string, companyId: string): boolean {
  if (url === null || url === undefined || url === '') return true;
  const base = `${direccionDeFoto(supabaseUrl, '')}${companyId}/`;
  if (!url.startsWith(base)) return false;
  return /^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(url.slice(base.length));
}
