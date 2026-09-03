/**
 * De donde sale el MODO de una peticion. Un solo lector.
 *
 * ─── POR QUE EXISTE ────────────────────────────────────────────────────────
 *
 * `entorno.ts` ya no adivina: si le das un modo que no conoce, lanza. Pero eso
 * solo cubre el CONSUMIDOR del dato. Los OCHO sitios que lo PRODUCIAN seguian
 * decidiendolo por descarte, y no se ponian de acuerdo entre ellos:
 *
 *     // middleware/auth.ts
 *     const modo = environmentHeader === 'PRUEBA' ? 'PRUEBA' : 'PRODUCCION';
 *
 *     // dashboard/ClientLayout.tsx
 *     initialSettings.dgiiEnv === 'PRODUCCION' ? 'PRODUCCION' : 'PRUEBA';
 *
 * El MISMO valor desconocido caia a PRODUCCION en uno y a PRUEBA en el otro.
 * Dos reglas contrarias para la misma pregunta.
 *
 * Y la de arriba es la que importa, porque ese `modo` es lo que entra en
 * `entornoDgii()`, y `entornoDgii()` es el segmento de la URL con la que se
 * habla con mSeller. Un valor no reconocido -- 'CERTIFICACION', una cookie
 * vieja, basura -- se convertia en `eCF`: la DGII REAL. El patron de toda esta
 * auditoria en su version mas cara: un hueco tapado con el peor defecto
 * disponible.
 *
 * ─── DOS FUENTES, DOS NIVELES DE CONFIANZA ─────────────────────────────────
 *
 * `modoDePeticion` es estricto: no hay valor por defecto, lo que no se
 * reconoce lanza. Es correcto para la cabecera `x-environment` cuando la pone
 * EL PROXY -- ese valor no lo escribe el usuario, lo construye nuestro propio
 * codigo, y si llega mal es un bug nuestro que hay que ver, no esconder.
 *
 * `modoDeCookie` NO lanza nunca. Es para la cookie `cf_environment`, y la
 * cookie la escribe el NAVEGADOR: puede faltar (uno recien estrenado), puede
 * quedar vieja (de una prueba de hace meses, con la sesion de 1 año que
 * lleva), puede venir editada a mano. Nada de eso es un ataque ni una
 * corrupcion que haya que frenar -- es el estado normal de un dato que no
 * controlamos.
 *
 * ─── EL ERROR QUE SE CORRIGE AQUI ──────────────────────────────────────────
 *
 * La primera version de este fichero trataba una cookie no reconocida IGUAL
 * que una cabecera no reconocida: lanzaba. Y en `middleware/auth.ts` esa
 * llamada quedo dentro del `try` que verifica el JWT, cuyo `catch` solo
 * esperaba un token vencido:
 *
 *     try {
 *       const decoded = jwt.verify(accessToken, JWT_SECRET);
 *       const reqModo = modoOperativo(modoEnLaPuerta(cookie, ...), ...); // lanzaba
 *       return { ...decoded, modo: reqModo };
 *     } catch (err) {
 *       if (err.name !== 'TokenExpiredError') return null;  // sesion invalida
 *     }
 *
 * Una cookie con cualquier valor que no fuera exactamente 'PRUEBA' o
 * 'PRODUCCION' tumbaba TODA la sesion: el usuario quedaba "no autorizado" en
 * cada llamada, con la pantalla de configuracion vacia y sin ningun error que
 * lo explicara. Le paso a una empresa en produccion, real, el mismo dia del
 * despliegue.
 *
 * Es el mismo patron que el resto de esta auditoria corrige, pero aplicado al
 * reves: "pararse" no es gratis. Frenar tiene sentido cuando lo que se evita
 * es peor que la interrupcion -- un comprobante fiscal al ambiente
 * equivocado, por ejemplo. Una cookie vieja no arriesgaba eso: el peor caso ya
 * era PRUEBA. Cerrarle la sesion al usuario por ese motivo no protegia nada y
 * rompia el sistema. La cautela mal dirigida es su propio tipo de fallo.
 *
 * Ahora una cookie que no se reconoce se trata IGUAL que una ausente: cae a
 * PRUEBA, se avisa por log, y la sesion sigue viva.
 *
 * A partir de la puerta el modo viaja SIEMPRE en la cabecera `x-environment` y
 * SIEMPRE vale PRUEBA o PRODUCCION (nunca CERTIFICACION: no esta soportado).
 * Lo que entra por ahi usa `modoDePeticion` + `modoOperativo`, estrictos. Lo
 * que se lee de una cookie usa `modoDeCookie`, que jamas lanza.
 */
import type { ModoSistema } from './entorno';

/** Los tres modos, en un sitio del que se pueda preguntar. */
export const MODOS_VALIDOS: readonly ModoSistema[] = ['PRUEBA', 'CERTIFICACION', 'PRODUCCION'];

/** ¿Es esto un modo del sistema? */
export function esModoValido(valor: unknown): valor is ModoSistema {
  return typeof valor === 'string' && (MODOS_VALIDOS as readonly string[]).includes(valor);
}

/**
 * El modo de una peticion que YA paso por la puerta -- para datos que NO
 * escribe el usuario (la cabecera `x-environment` que pone el proxy).
 *
 * No hay valor por defecto y no hay descarte. Si esto lanza, el fallo esta en
 * nuestro propio codigo, no en un dato ajeno -- y es mucho mejor verlo que
 * operar en un ambiente que nadie eligio.
 *
 * @param valor Lo que venga en `x-environment`.
 * @param origen De donde se leyo, para que el mensaje diga donde mirar.
 */
export function modoDePeticion(valor: unknown, origen: string): ModoSistema {
  if (esModoValido(valor)) return valor;

  throw new Error(
    `Modo de operacion no valido en ${origen}: ${JSON.stringify(valor)}. ` +
    `Los validos son ${MODOS_VALIDOS.join(', ')}. ` +
    'No se elige uno por defecto: el modo decide a que DGII se envia, y ' +
    'suponerlo mal manda comprobantes al ambiente equivocado.'
  );
}

/**
 * Los modos que el sistema sabe OPERAR hoy, no solo nombrar.
 *
 * `CERTIFICACION` existe en la base desde la 0046 y `entornoDgii()` sabe que le
 * corresponde `CerteCF`, pero el resto del sistema no lo soporta: 132
 * declaraciones de tipo siguen fijando `'PRODUCCION' | 'PRUEBA'`.
 *
 * Mientras eso sea asi, dejarlo pasar es peor que rechazarlo. Se rechaza en la
 * ENTRADA (ajustes y alta de empresa), asi que una cabecera con CERTIFICACION
 * no deberia poder verse nunca -- esta aqui por si acaso.
 */
export type ModoOperativo = 'PRODUCCION' | 'PRUEBA';

export const MOTIVO_CERTIFICACION_NO_SOPORTADA =
  'El modo CERTIFICACION todavia no esta soportado. Esta reconocido como modo ' +
  'valido y le corresponde el ambiente CerteCF de la DGII, pero el resto del ' +
  'sistema aun fija PRODUCCION o PRUEBA en 132 sitios. Hasta completarlo no se ' +
  'admite: operar en pruebas mientras la pantalla dice "Certificacion" seria peor.';

/**
 * Acota un modo YA VALIDADO (de `modoDePeticion`) a los que se pueden operar.
 *
 * Solo para la cabecera. La cookie nunca llega hasta aqui: `modoDeCookie` ya
 * descarta CERTIFICACION por su cuenta, sin lanzar.
 */
export function modoOperativo(modo: ModoSistema, origen: string): ModoOperativo {
  if (modo === 'CERTIFICACION') {
    throw new Error(`${MOTIVO_CERTIFICACION_NO_SOPORTADA} (origen: ${origen})`);
  }
  return modo;
}

/**
 * El modo leido de una COOKIE. NUNCA LANZA.
 *
 * La cookie la escribe el navegador, no nuestro codigo: puede faltar, puede
 * quedar vieja, puede traer un valor que ya no se usa (como 'CERTIFICACION',
 * que ni siquiera se puede guardar hoy). Nada de eso es una corrupcion que
 * haya que frenar -- es el estado normal de un dato de fuera. Lo que no se
 * reconoce cae a PRUEBA, igual que si faltara, y se deja un aviso en el log
 * para poder notar si hace falta limpiar algo -- pero la sesion sigue viva.
 *
 * @param valor El valor crudo de la cookie `cf_environment`.
 * @param origen De donde se leyo, para el aviso de log.
 */
export function modoDeCookie(valor: unknown, origen: string): ModoOperativo {
  if (valor === 'PRODUCCION') return 'PRODUCCION';
  if (valor === 'PRUEBA') return 'PRUEBA';

  if (valor !== undefined && valor !== null && valor !== '') {
    console.warn(
      `[modoDeCookie] Valor no reconocido en ${origen}: ${JSON.stringify(valor)}. ` +
      'Se trata como ausente y se usa PRUEBA. No se cierra la sesion por esto.'
    );
  }
  return 'PRUEBA';
}
