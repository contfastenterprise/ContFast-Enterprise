/**
 * El codigo de seguridad de un e-CF: se lee, no se fabrica.
 *
 * QUE ES
 * ------
 * Lo emite la DGII al aceptar el comprobante y es lo que permite validarlo en
 * su portal. Va impreso en la representacion impresa y dentro del QR:
 *
 *     https://ecf.dgii.gov.do/e-cf/Consulta?...&codigoSeguridad=XXXXXXXX
 *
 * O sea que no es un adorno: es la unica parte del papel que un tercero puede
 * contrastar contra la DGII.
 *
 * EL FALLO QUE ORIGINA ESTE FICHERO
 * ---------------------------------
 * Cuatro rutas (GET factura, imprimir, PDF, correo) hacian lo mismo:
 *
 *     if (!securityCode) {
 *       securityCode = sha256(invoice.id + invoice.ncf).slice(0,16).toUpperCase();
 *     }
 *
 * Cuando el codigo no constaba, se INVENTABA uno. No es aleatorio -- para la
 * misma factura sale siempre igual -- y eso lo empeora: parece estable y
 * legitimo, se imprime en un comprobante fiscal, y el QR lleva ese codigo a la
 * consulta de la DGII, donde no puede validar jamas.
 *
 * Es el mismo patron de toda la auditoria: inventar un valor antes que admitir
 * una ausencia. Igual que `|| 'Aceptado'` y `|| 'Latin Doors SRL'`.
 *
 * Y habia un segundo agujero, mas callado: `raw?.securityCode` solo miraba el
 * PRIMER NIVEL de la respuesta. Cuando mSeller reenvia el veredicto de la DGII
 * anidado en `dgiiResponse`, el codigo venia dentro y no se leia. La factura
 * salia sin codigo aunque mSeller lo hubiera mandado, y de ahi al sha256.
 *
 * LA REGLA
 * --------
 * Se busca el codigo donde puede estar, en todas sus formas conocidas. Si no
 * consta, se devuelve cadena vacia y quien imprime dice que no consta. Un
 * comprobante sin codigo de seguridad es un comprobante pendiente de la DGII;
 * un comprobante con un codigo inventado es un comprobante falso.
 */

/** Nombres con los que se ha visto llegar el codigo. */
const CLAVES_CODIGO = [
  'securityCode',
  'codigoSeguridad',
  'CodigoSeguridad',
  'codigo_seguridad',
  'security_code',
];

/** Nombres con los que se ha visto llegar el QR (url o base64). */
const CLAVES_QR = ['qr_url', 'qrCode', 'qrUrl', 'qr', 'QRCode'];

/** Nombres con los que se ha visto llegar la fecha de firma. */
const CLAVES_FIRMA = ['signedDate', 'fechaFirma', 'FechaFirma', 'FechaHoraFirma', 'fecha_firma'];

export interface DatosFirma {
  /** El codigo de la DGII, o cadena vacia si no consta. Nunca fabricado. */
  codigo: string;
  /** El QR tal cual vino: url o base64. Vacio si no consta. */
  qr: string;
  /** La fecha de firma tal cual vino. Vacia si no consta. */
  fechaFirma: string;
}

/** Los objetos donde puede estar el dato: la respuesta y lo que trae anidado. */
function candidatos(raw: unknown): unknown[] {
  if (!raw || typeof raw !== 'object') return [];
  const r = raw as Record<string, unknown>;
  const lista: unknown[] = [raw];

  // mSeller reenvia el veredicto de la DGII en `dgiiResponse`, que puede venir
  // como array de cadenas JSON, array de objetos, o un unico objeto/cadena.
  const anidado = r.dgiiResponse ?? r.dgiiResponses ?? r.respuestaDGII;
  const partes = Array.isArray(anidado) ? anidado : anidado != null ? [anidado] : [];
  for (const parte of partes) {
    try {
      const obj = typeof parte === 'string' ? JSON.parse(parte) : parte;
      if (obj && typeof obj === 'object') lista.push(obj);
    } catch {
      // Una parte ilegible no invalida el resto.
    }
  }

  // Algunas respuestas envuelven el cuerpo util.
  for (const envoltorio of ['data', 'result', 'documento', 'ecf']) {
    const dentro = r[envoltorio];
    if (dentro && typeof dentro === 'object') lista.push(dentro);
  }

  return lista;
}

/**
 * Busca una clave entre los candidatos. Se exige `String` no vacio despues de
 * recortar: un `''`, un `null` o un `0` significan "no consta", no un valor.
 */
function buscar(objetos: unknown[], claves: string[]): string {
  for (const obj of objetos) {
    if (!obj || typeof obj !== 'object') continue;
    const o = obj as Record<string, unknown>;
    for (const clave of claves) {
      const v = o[clave];
      if (v == null) continue;
      const s = String(v).trim();
      if (s !== '') return s;
    }
  }
  return '';
}

/**
 * Lee codigo de seguridad, QR y fecha de firma de una respuesta de mSeller.
 * Nunca inventa: lo que no consta vuelve vacio.
 */
export function leerDatosFirma(raw: unknown): DatosFirma {
  const objetos = candidatos(raw);
  return {
    codigo: buscar(objetos, CLAVES_CODIGO),
    qr: buscar(objetos, CLAVES_QR),
    fechaFirma: buscar(objetos, CLAVES_FIRMA),
  };
}

/** Atajo para quien solo quiere el codigo. */
export function leerCodigoSeguridad(raw: unknown): string {
  return leerDatosFirma(raw).codigo;
}

/**
 * La URL de consulta de la DGII para un comprobante.
 *
 * Devuelve `null` si no hay codigo de seguridad. Antes se construia igual y se
 * metia dentro el codigo inventado, asi que el QR impreso llevaba al portal de
 * la DGII a preguntar por un codigo que no existe. Sin codigo no hay consulta
 * posible, y decirlo es mas util que un QR que falla.
 */
export function urlConsultaDgii(datos: {
  rncEmisor?: string | null;
  rncComprador?: string | null;
  ncf: string;
  fecha: Date | string;
  total: number;
  codigoSeguridad: string;
}): string | null {
  if (!datos.codigoSeguridad) return null;
  // La fecha va en dd-mm-aaaa CON relleno de ceros. Las cuatro rutas la
  // formateaban con `toLocaleDateString('es-DO')` y cambiando `/` por `-`, que
  // para el 2 de septiembre da "2-9-2026" en vez de "02-09-2026".
  const d = new Date(datos.fecha);
  const fecha = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  const p = new URLSearchParams({
    rncEmisor: datos.rncEmisor || '',
    rncComprador: datos.rncComprador || '',
    eNCF: datos.ncf,
    fechaFirma: fecha,
    montoTotal: Number(datos.total).toFixed(2),
    codigoSeguridad: datos.codigoSeguridad,
  });
  return `https://ecf.dgii.gov.do/e-cf/Consulta?${p.toString()}`;
}
