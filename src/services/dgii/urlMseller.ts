/**
 * De donde sale la direccion del servidor de mSeller. UN solo sitio.
 *
 * EL FALLO
 * --------
 * El ajuste `mseller_url` de la empresa se interpretaba en SEIS sitios con TRES
 * reglas distintas, y las tres solo coinciden si la URL acaba en `/v1`:
 *
 *   emision, reenvio y XML ......  `endsWith('/v1') ? quitarlo : dejarla`
 *                                  -- respeta una URL propia
 *   consulta de estado, y la de
 *   por lotes ..................  `endsWith('/v1') ? quitarlo : DEFECTO`
 *                                  -- TIRA una URL propia y pone la de siempre
 *   barrido automatico .........  `'https://ecf.api.mseller.app'` a pelo
 *                                  -- ni mira el ajuste
 *
 * Consecuencia: una empresa con servidor propio podia EMITIR contra el suyo y
 * CONSULTAR contra el de por defecto. Dos servidores distintos para el mismo
 * comprobante -- el de enviar no sabe de la consulta y el de consultar no sabe
 * del envio.
 *
 * Y encima el constructor de `MSellerClient` hacia una CUARTA limpieza por
 * debajo (quitar `/TesteCF`, `/CerteCF`, `/eCF` y la barra final), invisible
 * desde fuera salvo por un `console.log` que imprimia en cada emision. Ese
 * ruido era, en realidad, la unica pista de que esto pasaba.
 *
 * LA REGLA, AHORA UNA
 * -------------------
 * Se respeta lo que la empresa haya configurado -- que era la conducta de la
 * mayoria, y la unica que tiene sentido: si alguien pone su servidor, es para
 * usarlo -- y se le quita todo lo que no es la base:
 *
 *   - la barra final, las que sean
 *   - el sufijo `/v1`, que es de la API vieja
 *   - el ambiente pegado al final (`/TesteCF`, `/CerteCF`, `/eCF`), que
 *     `MSellerClient` ya anade por su cuenta en cada llamada; dejarlo aqui lo
 *     duplicaria
 *
 * Se quitan EN BUCLE y sin importar el orden, porque `https://x/eCF/v1/` lleva
 * tres cosas pegadas y quitar una sola dejaria las otras.
 *
 * LO QUE ESTO CAMBIA DE VERDAD
 * ----------------------------
 * Para quien tenga la URL de por defecto -- lo normal -- no cambia nada: las
 * tres reglas ya coincidian ahi. Para quien tenga una propia, las consultas y
 * el barrido empiezan a usarla, que es el arreglo. Conviene mirar antes que
 * URLs hay configuradas: `scratch/_to_delete/urls_de_mseller.sql`.
 */

/** Donde vive la API de e-CF de mSeller cuando la empresa no dice otra cosa. */
export const URL_MSELLER_POR_DEFECTO = 'https://ecf.api.mseller.app';

/** Sufijos que no son parte de la base y se quitan si vienen pegados al final. */
const SOBRAN = [/\/+$/, /\/v1$/i, /\/TesteCF$/i, /\/CerteCF$/i, /\/eCF$/i];

/**
 * La direccion base de mSeller a partir de lo que tenga configurado la empresa.
 *
 * Nunca devuelve cadena vacia: sin configuracion, o con una que se queda en
 * nada al limpiarla, devuelve la de por defecto.
 */
export function baseUrlMseller(configurada?: string | null): string {
  let url = (configurada ?? '').trim();
  if (!url) return URL_MSELLER_POR_DEFECTO;

  //  En bucle: `https://x/eCF/v1/` lleva barra, `/v1` y ambiente. Quitar uno
  //  solo dejaria los otros dos, y cual sobra primero depende de como lo haya
  //  escrito quien configuro.
  let antes: string;
  do {
    antes = url;
    for (const sobra of SOBRAN) url = url.replace(sobra, '');
  } while (url !== antes);

  if (!url) return URL_MSELLER_POR_DEFECTO;

  //  El dominio viejo. `api.mseller.app` era la API general; la de e-CF vive en
  //  `ecf.api.mseller.app`. Habia empresas configuradas con el viejo, y esta
  //  correccion ya estaba en el constructor del cliente: se conserva aqui, que
  //  es donde ahora pasa todo el mundo.
  if (url.includes('api.mseller.app') && !url.includes('ecf.api.mseller.app')) {
    url = url.replace('api.mseller.app', 'ecf.api.mseller.app');
  }

  return url;
}
