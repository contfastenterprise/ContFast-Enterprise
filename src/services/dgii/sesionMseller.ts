import { createHmac, randomBytes } from 'crypto';

/**
 * Las sesiones abiertas contra mSeller, compartidas por todo el proceso.
 *
 * EL FALLO
 * --------
 * `MSellerClient` ya guardaba el token 50 minutos... en `this.tokenCache`, un
 * campo de INSTANCIA. Y cada emision hace `new MSellerClient(...)`:
 *
 *     src/services/invoice/invoiceSubmissionService.ts   una por factura
 *     src/infrastructure/jobRunners.ts                   una por trabajo
 *     src/services/dgii/sincronizarPendientes.ts         una por empresa y modo
 *     ...y tres rutas mas
 *
 * Instancia nueva, caché vacío. El caché estaba escrito, comentado y pensado, y
 * no acertaba NUNCA. O sea que cada factura pagaba una autenticación entera
 * contra mSeller -- conexión, TLS, su backend de login -- antes de mandar el
 * comprobante. Ese viaje sobraba entero.
 *
 * Duele justo donde importa: en caja, con clientes en fila, es un tramo muerto
 * en cada venta.
 *
 * POR QUE VIVE AQUI Y NO EN LA CLASE
 * ----------------------------------
 * Porque el problema no era la duración del caché sino DONDE vivía. Un módulo
 * dura lo que dura el proceso, así que la segunda factura aprovecha el token de
 * la primera aunque sea otra instancia del cliente. En Vercel cada arranque en
 * frío empieza vacío, y eso está bien: el caso malo es el primer envío tras un
 * rato quieto, que es exactamente cuando NO hay cola.
 *
 * LA CLAVE LLEVA LA CONTRASEÑA, PERO NO EN CLARO
 * ----------------------------------------------
 * Dos empresas no pueden compartir token, ni dos ambientes: un token de pruebas
 * contra producción es un envío al sitio equivocado. Por eso la clave lleva
 * servidor, ambiente y correo. Y lleva también la contraseña, porque si alguien
 * la cambia en Ajustes el token viejo tiene que dejar de valer en el acto en
 * vez de sobrevivir 50 minutos.
 *
 * Pero entra como HUELLA, no en claro: un HMAC con una sal aleatoria distinta
 * en cada proceso. Fuera de este proceso esa huella no significa nada, ni
 * siquiera se puede comparar con la de otro. Una función de hash a secas sí
 * sería comparable y atacable fuera de línea.
 *
 * UNA SOLA AUTENTICACION AUNQUE LLEGUEN VARIAS A LA VEZ
 * ----------------------------------------------------
 * Tres cajas cobrando al mismo tiempo tras un arranque en frío fallarían las
 * tres en el caché y autenticarían las tres. `enVuelo` guarda la promesa en
 * curso: la primera pide el token y las demás esperan a esa misma promesa. Sin
 * esto, el caché ayuda menos precisamente cuando más trabajo hay.
 */

interface Sesion {
  valor: string;
  expiraEn: number;
}

const SESIONES = new Map<string, Sesion>();
const EN_VUELO = new Map<string, Promise<string>>();

/**
 * Sal aleatoria por proceso. No se guarda ni se comparte: si el proceso muere,
 * las claves del caché mueren con él, que es justo lo que se quiere.
 */
const SAL = randomBytes(32);

/**
 * La clave de una sesión: qué servidor, qué ambiente, qué usuario y qué
 * contraseña. `tipo` separa el token de la API de la cookie del portal, que son
 * dos sesiones distintas contra dos sitios distintos.
 */
export function claveDeSesion(
  tipo: 'api' | 'portal',
  baseUrl: string,
  entorno: string,
  email: string,
  password: string
): string {
  const huella = createHmac('sha256', SAL).update(password).digest('hex').slice(0, 32);
  return `${tipo}|${baseUrl}|${entorno}|${email}|${huella}`;
}

export interface SesionVigente {
  valor: string;
  /** `true` si salió del caché, `false` si hubo que pedirla. Se registra en los tiempos. */
  deCache: boolean;
}

/**
 * Devuelve la sesión vigente para esa clave, pidiéndola solo si hace falta.
 *
 * `pedirla` tiene que devolver el valor y cuánto dura. No se le presupone
 * duración aquí: la del token de la API y la de la cookie del portal las decide
 * quien las pide.
 */
export async function sesionVigente(
  clave: string,
  pedirla: () => Promise<{ valor: string; duracionMs: number }>
): Promise<SesionVigente> {
  const guardada = SESIONES.get(clave);
  if (guardada && Date.now() < guardada.expiraEn) {
    return { valor: guardada.valor, deCache: true };
  }

  //  Ya hay una petición en curso para esta misma clave: esperar a esa.
  const enCurso = EN_VUELO.get(clave);
  if (enCurso) {
    return { valor: await enCurso, deCache: false };
  }

  const promesa = (async () => {
    const { valor, duracionMs } = await pedirla();
    SESIONES.set(clave, { valor, expiraEn: Date.now() + duracionMs });
    return valor;
  })();

  //  Se registra ANTES del primer `await` de quien llama, para que dos
  //  llamadas simultáneas vean la misma promesa.
  EN_VUELO.set(clave, promesa);

  try {
    const valor = await promesa;
    return { valor, deCache: false };
  } finally {
    //  Se quita pase lo que pase. Si la autenticación falló, la siguiente
    //  llamada tiene que volver a intentarlo, no heredar la promesa rota.
    EN_VUELO.delete(clave);
  }
}

/**
 * Tira la sesión guardada para esa clave.
 *
 * Se llama cuando mSeller contesta 401 o 403 a una llamada hecha con una sesión
 * que venía del caché: quiere decir que caducó antes de lo que dijo, o que la
 * revocaron. Antes de este módulo esto no podía pasar -- cada llamada
 * autenticaba de cero -- así que hacer que el caché funcione de verdad trae
 * este caso nuevo, y hay que atenderlo.
 */
export function olvidarSesion(clave: string): void {
  SESIONES.delete(clave);
}

/** Cuántas sesiones hay guardadas. Solo para pruebas y para el banco. */
export function _sesionesGuardadas(): number {
  return SESIONES.size;
}

/** Vacía el caché. Solo para pruebas. */
export function _vaciarSesiones(): void {
  SESIONES.clear();
  EN_VUELO.clear();
}
