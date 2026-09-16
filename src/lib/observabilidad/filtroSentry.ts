/**
 * Lo que NO sale hacia Sentry. La regla, en un solo sitio y sin importar el SDK.
 *
 * POR QUE ESTE FICHERO (lote 153)
 * -------------------------------
 * ContFast maneja datos fiscales y de clientes: RNC y cedulas, correos, tokens
 * de sesion, certificados. Un error de servidor lleva todo eso en su mensaje, en
 * la peticion (cabeceras, cookies, cuerpo) o en las migas de consola, y Sentry es
 * un tercero. Decidido por el dueño el 2026-09-16: solo errores, sin trazas ni
 * grabacion de sesiones.
 *
 * Este modulo no importa `@sentry/*` a proposito: se prueba ejecutandolo, y lo
 * usan por igual el servidor y el navegador.
 */

/** Lo que se pone en lugar de cada dato retirado. */
export const MARCAS = {
  cedula: '[CEDULA]',
  rnc: '[RNC]',
  correo: '[CORREO]',
  token: '[TOKEN]',
} as const;

/**
 * Retira de un texto lo que identifica a una persona o abre una sesion.
 *
 *  - Cedula: 11 digitos, con o sin guiones (001-1234567-8). Antes que el RNC,
 *    porque sus primeros 9 digitos tambien parecen un RNC.
 *  - RNC: 9 digitos, con o sin guiones (1-01-12345-6).
 *  - Correos.
 *  - Tokens: JWT (tres trozos base64url empezando por `eyJ`), `Bearer ...`, y
 *    los tokens de Sentry (`sntrys_`/`sntryu_`), por si alguno acaba en un log.
 *
 * Los limites (ni letra ni digito a los lados) evitan morder numeros mas largos
 * o trozos de un UUID: un e-NCF `E310000000020` no casa (la `E` delante y sus
 * 12 digitos). Un importe como 30302.40 tampoco: tiene punto.
 */
export function redactar(texto: string): string {
  if (!texto) return texto;
  return texto
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, `Bearer ${MARCAS.token}`)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, MARCAS.token)
    .replace(/\bsntry[su]_[A-Za-z0-9_=-]+/g, MARCAS.token)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, MARCAS.correo)
    .replace(/(?<![\dA-Za-z])\d{3}-?\d{7}-?\d(?![\dA-Za-z])/g, MARCAS.cedula)
    .replace(/(?<![\dA-Za-z])\d-?\d{2}-?\d{5}-?\d(?![\dA-Za-z])/g, MARCAS.rnc);
}

/** Un error "esperado": el propio codigo lo lanzo con un estado 4xx (409 de negocio, 403, 400). */
export function esErrorEsperado(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

//  Forma minima del evento de Sentry que se toca aqui. Estructural: asi este
//  fichero no depende de la version del SDK.
interface Marco { vars?: unknown }
interface EventoSentry {
  message?: string;
  exception?: { values?: { value?: string; stacktrace?: { frames?: Marco[] } }[] };
  request?: { url?: string; query_string?: unknown; cookies?: unknown; headers?: unknown; data?: unknown; env?: unknown };
  user?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  breadcrumbs?: { category?: string; message?: string; data?: unknown }[];
}

/**
 * Deja el evento sin datos de personas ni de sesion antes de enviarlo.
 * Devuelve null para no enviarlo (errores esperados).
 */
export function limpiarEvento<T extends EventoSentry>(evento: T, original?: unknown): T | null {
  if (esErrorEsperado(original)) return null;

  if (evento.message) evento.message = redactar(evento.message);
  for (const v of evento.exception?.values ?? []) {
    if (v.value) v.value = redactar(v.value);
    //  Las variables locales de cada marco pueden llevar el cuerpo entero de
    //  una factura o un cliente.
    for (const marco of v.stacktrace?.frames ?? []) delete marco.vars;
  }

  if (evento.request) {
    //  La URL se queda (sirve para saber que ruta fallo), sin la consulta.
    if (evento.request.url) evento.request.url = redactar(evento.request.url.split('?')[0]);
    delete evento.request.query_string;
    delete evento.request.cookies;
    delete evento.request.headers;
    delete evento.request.data;
    delete evento.request.env;
  }

  //  Del usuario solo se deja el id (nunca correo, nombre ni IP).
  if (evento.user) {
    const id = evento.user.id;
    evento.user = id ? { id } : {};
  }

  //  `extra` lo rellenan las capturas manuales con lo que se tuviera a mano.
  delete evento.extra;

  //  Las migas de consola repiten lo que se imprimio antes del error: ahi van
  //  datos de negocio. Fuera; el resto, con el mensaje redactado.
  if (evento.breadcrumbs) {
    evento.breadcrumbs = evento.breadcrumbs
      .filter((b) => b.category !== 'console')
      .map((b) => ({ category: b.category, message: b.message ? redactar(b.message) : b.message }));
  }

  return evento;
}

/** El error que acompaña a una llamada de consola, si hay alguno. Sin Error no se envia nada. */
export function errorDeLaLlamada(args: readonly unknown[]): Error | null {
  for (const a of args) if (a instanceof Error) return a;
  return null;
}
