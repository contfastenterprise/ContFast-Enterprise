import { Logger } from '@/utils/logger';

/**
 * Las imagenes remotas de una plantilla, metidas DENTRO del HTML.
 *
 * EL PROBLEMA
 * -----------
 * El PDF lo dibuja un Chromium de verdad: se le da el HTML y se le pide la
 * pagina. Y `generatePdfFromHtml` espera, a proposito, a que carguen todas las
 * imagenes -- si no, el PDF sale sin logo la mitad de las veces.
 *
 * El QR ya va en base64, asi que es instantaneo. El LOGO no: es una URL de
 * Supabase, y Chromium tiene que salir a la red a buscarla EN CADA IMPRESION.
 * Un viaje de ida y vuelta con una venta esperando, por un fichero que no
 * cambia de un mes para otro.
 *
 * POR QUE AQUI Y NO EN LOS 35 SITIOS QUE PONEN EL LOGO
 * ---------------------------------------------------
 * Hay 35 lugares que meten `logoUrl` en los datos de una plantilla. Convertir
 * en cada uno serian 35 cambios, 35 ocasiones de olvidarse, y el siguiente que
 * anada una plantilla empezaria otra vez desde cero.
 *
 * Aqui se hace UNA vez, en el ultimo paso antes de dibujar, y vale para todas
 * las plantillas -- las de ahora y las que vengan. Es ademas donde se paga el
 * coste, que es donde tiene sentido evitarlo.
 *
 * LO QUE NO HACE
 * --------------
 * No rompe una impresion por una imagen. Si la descarga falla, tarda, pesa
 * demasiado o la direccion no es de fiar, se deja la URL tal cual y Chromium
 * hara lo de siempre. Peor un logo tardon que una factura que no sale.
 */

interface Guardada {
  dataUri: string;
  expiraEn: number;
}

/**
 * Las imagenes ya traidas, por URL. A nivel de MODULO, no de instancia: dura lo
 * que dure el proceso, asi que la segunda factura aprovecha el logo de la
 * primera. Es la misma leccion que el token de mSeller, que vivia en un campo
 * de instancia y no acertaba nunca.
 */
const CACHE = new Map<string, Guardada>();
const EN_VUELO = new Map<string, Promise<string | null>>();

/** Una hora. Un logo no cambia entre dos facturas; si cambia, se ve a la hora. */
const DURACION_MS = 60 * 60 * 1000;

/** Nada de meter un cartel de 20 MB dentro de un PDF de una factura. */
const MAXIMO_BYTES = 2 * 1024 * 1024;

/** Si la imagen no llega en este rato, se imprime sin esperarla mas. */
const MS_DESCARGA = 4_000;

/** Cuantas distintas se traen por render. Una plantilla normal tiene una o dos. */
const MAXIMO_POR_RENDER = 6;

/** `<img ... src="http(s)://...">`, con comillas simples o dobles. */
const IMG_REMOTA = /<img\b[^>]*?\bsrc\s*=\s*(["'])(https?:\/\/[^"']+)\1/gi;

/**
 * ¿Es una direccion a la que este servidor deberia salir?
 *
 * El `logoUrl` lo escribe alguien de la empresa en Ajustes, asi que es una URL
 * que un usuario controla y que el SERVIDOR va a pedir. Sin este filtro, apuntar
 * el logo a una direccion interna -- el servicio de metadatos de la nube, algo
 * en la red privada -- haria que el servidor la trajera y la incrustara en un
 * PDF que luego se descarga. Se admite solo http y https hacia nombres publicos.
 */
function direccionDeFiar(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  //  Segunda barrera, a proposito. Hoy es irrelevante -- `IMG_REMOTA` solo
  //  encuentra `http` y `https`, asi que aqui no llega otra cosa -- y por
  //  eso quitarla no cambia nada que se pueda observar desde fuera. Se
  //  queda porque el dia que alguien afloje ese patron, esta linea es lo
  //  unico que impide que el servidor abra un `file://`.
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return false;

  //  Direcciones IP literales: se descartan las que no salen a internet.
  //  Un nombre de dominio que RESUELVA a una privada se escapa de esto; para
  //  cerrarlo del todo haria falta resolver el nombre aqui y volver a
  //  comprobarlo, y eso es otra cosa. Esto corta el caso directo.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;           // metadatos de la nube
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  if (h === '::1' || h.startsWith('[')) return false;    // IPv6 literal

  return true;
}

/** El tipo de imagen, a partir de la cabecera o de la extension. */
function tipoDeImagen(cabecera: string | null, url: string): string | null {
  const c = (cabecera ?? '').split(';')[0].trim().toLowerCase();
  if (c.startsWith('image/')) return c;
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return null;
}

/** Trae una imagen y la devuelve como `data:` URI, o `null` si no se pudo. */
async function traer(url: string): Promise<string | null> {
  const guardada = CACHE.get(url);
  if (guardada && Date.now() < guardada.expiraEn) return guardada.dataUri;

  const enCurso = EN_VUELO.get(url);
  if (enCurso) return enCurso;

  const promesa = (async (): Promise<string | null> => {
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), MS_DESCARGA);
    try {
      const res = await fetch(url, { signal: corte.signal });
      if (!res.ok) return null;

      const tipo = tipoDeImagen(res.headers.get('content-type'), url);
      if (!tipo) return null;

      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAXIMO_BYTES) return null;

      const dataUri = `data:${tipo};base64,${bytes.toString('base64')}`;
      CACHE.set(url, { dataUri, expiraEn: Date.now() + DURACION_MS });
      return dataUri;
    } catch {
      return null;
    } finally {
      clearTimeout(reloj);
      EN_VUELO.delete(url);
    }
  })();

  EN_VUELO.set(url, promesa);
  return promesa;
}

export interface ResultadoIncrustacion {
  html: string;
  /** Cuantas URLs distintas se encontraron. */
  encontradas: number;
  /** Cuantas se metieron dentro del HTML. */
  incrustadas: number;
  /** Cuantas salieron del cache sin pedir nada a la red. */
  deCache: number;
}

/**
 * Cambia las imagenes remotas del HTML por su contenido en base64.
 *
 * Lo que no se pueda traer se queda como estaba: esto acelera una impresion,
 * no decide si sale.
 */
export async function incrustarImagenes(html: string): Promise<ResultadoIncrustacion> {
  const urls: string[] = [];
  for (const m of html.matchAll(IMG_REMOTA)) {
    if (!urls.includes(m[2])) urls.push(m[2]);
  }

  const candidatas = urls.filter(direccionDeFiar).slice(0, MAXIMO_POR_RENDER);
  if (candidatas.length === 0) {
    return { html, encontradas: urls.length, incrustadas: 0, deCache: 0 };
  }

  //  Cuales estaban ya, ANTES de pedir nada: despues de `traer` ya estarian
  //  todas en el cache y el numero no diria nada.
  const yaEstaban = candidatas.filter((u) => {
    const g = CACHE.get(u);
    return !!g && Date.now() < g.expiraEn;
  }).length;

  const traidas = await Promise.all(candidatas.map(async (u) => [u, await traer(u)] as const));

  let salida = html;
  let incrustadas = 0;
  for (const [url, dataUri] of traidas) {
    if (!dataUri) continue;
    //  Se sustituye la URL entre comillas, no la URL suelta: asi no se toca
    //  nada que la mencione en un texto o en un atributo que no sea `src`.
    for (const comilla of ['"', "'"]) {
      const antes = salida;
      salida = salida.split(`${comilla}${url}${comilla}`).join(`${comilla}${dataUri}${comilla}`);
      if (salida !== antes) incrustadas++;
    }
  }

  if (urls.length > candidatas.length) {
    Logger.warn('[imagenesIncrustadas] hay imagenes remotas que no se incrustan', {
      encontradas: urls.length, admitidas: candidatas.length,
    });
  }

  return { html: salida, encontradas: urls.length, incrustadas, deCache: yaEstaban };
}

/** Solo para pruebas y para el banco. */
export function _vaciarCacheDeImagenes(): void {
  CACHE.clear();
  EN_VUELO.clear();
}
export function _imagenesGuardadas(): number {
  return CACHE.size;
}
