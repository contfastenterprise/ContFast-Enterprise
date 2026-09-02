/**
 * En que estado queda un envio segun lo que respondio la DGII.
 *
 * POR QUE ESTO EXISTE
 * -------------------
 * La respuesta se interpretaba en tres sitios distintos, y los tres daban por
 * ACEPTADA una respuesta que no decia nada. En capas, ademas:
 *
 *   1. `(raw?.status || raw?.estado || 'Aceptado')`
 *         -> sin campo de estado, se inventaba "Aceptado".
 *   2. `else { finalStatus = 'accepted' }`
 *         -> y si el estado venia pero no se reconocia, tambien aceptada.
 *   3. `dgiiMessage = msellerRes.message || 'Aceptado por DGII'`
 *         -> y el mensaje guardado lo afirmaba por escrito.
 *
 * Es el mismo patron que `modo` con `DEFAULT 'PRODUCCION'`: el silencio se lee
 * como el caso bueno. Solo que aqui el caso bueno es un comprobante fiscal
 * marcado como aceptado por la DGII sin que la DGII lo haya dicho. Eso no se
 * corrige solo: queda en la base, sale en el PDF y se reporta.
 *
 * LA REGLA
 * --------
 * Aceptado se AFIRMA, no se supone. Si no hay estado, o no se entiende, el
 * envio queda en `submitted`: mandado, a la espera de confirmacion. Es un
 * estado NO final -- `dgiiSubmissionRepository.FINALES` son accepted, rejected
 * y failed -- asi que el reintento y la consulta posterior lo siguen tratando
 * como pendiente, que es exactamente lo que es.
 *
 * Quedarse corto aqui es barato: un envio bueno marcado como pendiente se
 * resuelve consultando otra vez. Pasarse es caro: una factura marcada como
 * aceptada que la DGII nunca acepto no la descubre nadie hasta que la DGII
 * reclama.
 */

/** Estados en los que puede quedar un envio recien mandado. */
export type EstadoEnvio = 'accepted' | 'rejected' | 'submitted';

export interface LecturaEstado {
  /** El estado en el que queda el envio. */
  estado: EstadoEnvio;
  /** El texto que dijo la DGII, tal cual. `null` si no dijo nada. */
  textoCrudo: string | null;
  /**
   * `false` cuando no habia estado, o cuando lo habia pero no se reconocio.
   * Sirve para no escribir mensajes que afirmen mas de lo que se sabe.
   */
  reconocido: boolean;
}

/**
 * Saca el texto de estado de una respuesta de mSeller/DGII.
 *
 * Los campos se miran de mas especifico a menos: el estado que viene DENTRO de
 * `dgiiResponse` es el que dio la DGII de verdad; `status` y `estado` en la
 * raiz los pone mSeller y pueden hablar de su propia gestion, no de la DGII.
 */
export function textoEstado(raw: any): string | null {
  if (!raw || typeof raw !== 'object') return null;

  // Lo que dijo la DGII, si viene anidado.
  //
  // `dgiiResponse` es un HISTORIAL, no un dato suelto: la DGII va anadiendo
  // entradas segun avanza el comprobante ("Recibido" y despues "Aceptado").
  // Vale la ULTIMA, que es el estado actual.
  //
  // Esto devolvia la PRIMERA -- un `return` dentro del bucle -- y por eso
  // E440000000001 de PRODUCCION se quedaba en "Enviado" despues de que la DGII
  // ya lo hubiera aceptado: la consulta traia el historial completo, se leia
  // "Recibido" y se ignoraba el "Aceptado" que venia detras.
  //
  // El codigo que habia antes en las rutas de sincronizacion recorria TODAS y
  // se quedaba con la ultima. Al unificar la lectura aqui se perdio ese
  // detalle: la unificacion era correcta, la implementacion no.
  if (Array.isArray(raw.dgiiResponse)) {
    let ultimo: string | null = null;
    for (const item of raw.dgiiResponse) {
      try {
        const p = typeof item === 'string' ? JSON.parse(item) : item;
        if (p?.estado != null && String(p.estado).trim() !== '') ultimo = String(p.estado);
      } catch {
        // Un elemento ilegible no invalida los demas.
      }
    }
    if (ultimo !== null) return ultimo;
  }

  for (const campo of [raw.dgiiStatus, raw.estadoDGII, raw.status, raw.estado]) {
    if (campo != null && String(campo).trim() !== '') return String(campo);
  }
  return null;
}

/**
 * Traduce la respuesta a un estado. Nunca devuelve `accepted` por defecto.
 */
export function leerEstado(raw: any): LecturaEstado {
  const textoCrudo = textoEstado(raw);

  // Sin estado no hay aceptacion. Se queda a la espera.
  if (textoCrudo === null) {
    return { estado: 'submitted', textoCrudo: null, reconocido: false };
  }

  const t = textoCrudo.toLowerCase();

  // El rechazo se mira ANTES que la aceptacion: "no aceptado" contiene "acept".
  if (t.includes('rechaz') || t.includes('rejected') || t.includes('no acept')) {
    return { estado: 'rejected', textoCrudo, reconocido: true };
  }
  if (t.includes('acept') || t.includes('accepted') || t.includes('aprob')) {
    return { estado: 'accepted', textoCrudo, reconocido: true };
  }
  if (t.includes('envi') || t.includes('submitted') || t.includes('recib') ||
      t.includes('proces') || t.includes('pendien') || t.includes('cola')) {
    return { estado: 'submitted', textoCrudo, reconocido: true };
  }

  // Vino algo, pero no se sabe que es. A la espera, y se guarda el texto para
  // que quien lo mire sepa que hay que mirarlo.
  return { estado: 'submitted', textoCrudo, reconocido: false };
}

/**
 * El mensaje que se guarda con el envio. No afirma nada que no se sepa.
 *
 * `mensajeApi` es lo que dijo el proveedor; si no dijo nada, se explica el
 * estado en vez de inventar un "Aceptado por la DGII".
 */
export function mensajeEstado(lectura: LecturaEstado, mensajeApi?: string | null): string {
  const propio = mensajeApi?.trim();
  if (propio) return propio;

  if (lectura.estado === 'accepted') return `Aceptado por la DGII (${lectura.textoCrudo}).`;
  if (lectura.estado === 'rejected') return `Rechazado por la DGII (${lectura.textoCrudo}).`;

  if (lectura.textoCrudo === null) {
    return 'Enviado. La respuesta no trae estado de la DGII: queda pendiente de confirmar.';
  }
  if (!lectura.reconocido) {
    return `Enviado. Estado no reconocido ("${lectura.textoCrudo}"): queda pendiente de confirmar.`;
  }
  return `Enviado (${lectura.textoCrudo}). Pendiente de confirmacion de la DGII.`;
}


/* ──────────────────────────────────────────────────────────────────────────
 * FIRMA DEL COMPROBANTE — codigo de seguridad y fecha de firma
 *
 * POR QUE ESTO EXISTE (hallazgos DB-22 y DB-23)
 * ---------------------------------------------
 * Los dos datos venian de mSeller y no se guardaban en ninguna columna: vivian
 * dentro del JSON del envio. Cada consulta de estado sobrescribia ese JSON con
 * la respuesta de la consulta -- que no los trae -- y los borraba. Despues, al
 * imprimir, el codigo de seguridad se FABRICABA con un sha256 de `id + ncf`, y
 * ese invento acababa dentro del QR y de la URL de consulta de la DGII.
 *
 * mSeller devuelve estos campos con nombres distintos segun el endpoint y a
 * profundidades distintas: en la raiz del envio, dentro de `data`, o dentro de
 * las cadenas JSON de `dgiiResponse`. Por eso se busca recorriendo, en vez de
 * mirar tres sitios concretos y dar el dato por perdido en cuanto cambie uno.
 *
 * REGLA: esto SOLO extrae lo que mSeller dijo. Si no lo dijo, devuelve null.
 * Nunca calcula, nunca deduce, nunca rellena. Un comprobante fiscal sin codigo
 * de seguridad real es un comprobante pendiente, no uno al que le falta un
 * adorno.
 * ────────────────────────────────────────────────────────────────────────── */

export interface Firma {
  codigoSeguridad: string | null;
  fechaFirma: string | null;
  /** Enlace de consulta de la DGII. Solo si mSeller lo devuelve como URL. */
  enlaceQr: string | null;
}

const CLAVES_CODIGO = new Set(['securitycode', 'codigoseguridad', 'codigodeseguridad']);
const CLAVES_FECHA = new Set([
  'fechahorafirma', 'fechafirma', 'fechahorafirmado', 'signeddate', 'signaturedate',
]);

/** Longitud de las columnas. Un valor mas largo es una coincidencia equivocada. */
const CLAVES_QR = new Set(['qrcode', 'qrurl', 'urlqr', 'codigoqr', 'qr']);

const MAX_CODIGO = 64;
const MAX_FECHA = 40;
const MAX_QR = 2048;

export function extraerFirma(raw: any): Firma {
  const hallado: Firma = { codigoSeguridad: null, fechaFirma: null, enlaceQr: null };
  const vistos = new Set<any>();

  const texto = (v: any): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t === '' ? null : t;
  };

  const visitar = (nodo: any, profundidad: number): void => {
    if (nodo == null || profundidad > 6) return;
    if (hallado.codigoSeguridad && hallado.fechaFirma && hallado.enlaceQr) return;

    // Una cadena puede ser JSON: `dgiiResponse` llega como array de cadenas.
    if (typeof nodo === 'string') {
      const t = nodo.trim();
      if (t.startsWith('{') || t.startsWith('[')) {
        try {
          visitar(JSON.parse(t), profundidad + 1);
        } catch {
          // Texto suelto, no JSON. No es un error: hay respuestas asi.
        }
      }
      return;
    }

    if (typeof nodo !== 'object' || vistos.has(nodo)) return;
    vistos.add(nodo);

    if (Array.isArray(nodo)) {
      for (const x of nodo) visitar(x, profundidad + 1);
      return;
    }

    for (const [clave, valor] of Object.entries(nodo)) {
      const k = clave.toLowerCase().replace(/[_\s-]/g, '');
      if (!hallado.codigoSeguridad && CLAVES_CODIGO.has(k)) {
        hallado.codigoSeguridad = texto(valor);
      } else if (!hallado.fechaFirma && CLAVES_FECHA.has(k)) {
        hallado.fechaFirma = texto(valor);
      } else if (!hallado.enlaceQr && CLAVES_QR.has(k)) {
        // mSeller devuelve aqui a veces una URL y a veces la imagen del QR ya
        // codificada en base64. Solo interesa la URL: la imagen no se guarda en
        // la base -- pesa y se regenera en cada impresion.
        const v = texto(valor);
        hallado.enlaceQr = v && /^https?:\/\//i.test(v) ? v : null;
      } else {
        visitar(valor, profundidad + 1);
      }
    }
  };

  visitar(raw, 0);
  return hallado;
}

/**
 * Los campos que hay que escribir en la factura, listos para el `.set(...)`.
 *
 * Devuelve SOLO lo que mSeller trajo. Un dato ausente no aparece en el objeto,
 * de modo que un `UPDATE` con esto NUNCA pisa un valor bueno con uno vacio: es
 * la regla que hacia falta para que sincronizar dejara de borrar la firma.
 */
export function camposDeFirma(raw: any): {
  securityCode?: string;
  signatureDate?: string;
  qrUrl?: string;
} {
  const { codigoSeguridad, fechaFirma, enlaceQr } = extraerFirma(raw);
  const campos: { securityCode?: string; signatureDate?: string; qrUrl?: string } = {};
  if (codigoSeguridad && codigoSeguridad.length <= MAX_CODIGO) campos.securityCode = codigoSeguridad;
  if (fechaFirma && fechaFirma.length <= MAX_FECHA) campos.signatureDate = fechaFirma;
  if (enlaceQr && enlaceQr.length <= MAX_QR) campos.qrUrl = enlaceQr;
  return campos;
}
