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
 * Aqui hay UNA regla. Lo que no es un modo valido no se interpreta: se para.
 *
 * ─── LA UNICA AUSENCIA LEGITIMA ────────────────────────────────────────────
 *
 * Hay exactamente un sitio donde no traer el dato es normal y no un fallo: la
 * PUERTA (el proxy). La cookie `cf_environment` la escribe el navegador la
 * primera vez que se carga el panel; hasta ese momento no existe. Si la puerta
 * lanzara, un navegador recien estrenado no podria entrar.
 *
 * Por eso la puerta tiene su propia funcion, `modoEnLaPuerta`, y resuelve la
 * ausencia hacia PRUEBA -- NO hacia PRODUCCION. La diferencia no es de estilo:
 *
 *   - Equivocarse hacia PRUEBA: se ve una lista vacia hasta que la cookie se
 *     escribe y la pagina se recarga sola. Molesto y reversible.
 *   - Equivocarse hacia PRODUCCION: un comprobante fiscal sale a la DGII de
 *     verdad con un e-NCF quemado. No se deshace.
 *
 * Un valor PRESENTE pero no reconocido no es una ausencia, y lanza tambien en
 * la puerta: eso no es un navegador nuevo, es un dato corrupto.
 *
 * A partir de la puerta el modo viaja SIEMPRE en la cabecera `x-environment` y
 * SIEMPRE vale uno de los tres. Todo lo que hay detras usa `modoDePeticion`,
 * que no perdona nada.
 */
import type { ModoSistema } from './entorno';

/** Los tres modos, en un sitio del que se pueda preguntar. */
export const MODOS_VALIDOS: readonly ModoSistema[] = ['PRUEBA', 'CERTIFICACION', 'PRODUCCION'];

/** ¿Es esto un modo del sistema? */
export function esModoValido(valor: unknown): valor is ModoSistema {
  return typeof valor === 'string' && (MODOS_VALIDOS as readonly string[]).includes(valor);
}

/**
 * El modo de una peticion que YA paso por la puerta.
 *
 * No hay valor por defecto y no hay descarte. Si esto lanza, el fallo esta en
 * quien construyo la peticion, no aqui -- y es mucho mejor verlo que operar en
 * un ambiente que nadie eligio.
 *
 * @param valor Lo que venga en `x-environment` (o en la cookie).
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
 * El modo en LA PUERTA, donde la cookie puede no existir todavia.
 *
 * Ausente -> PRUEBA, y queda dicho aqui en vez de escondido en un `||`.
 * Presente pero desconocido -> lanza, igual que en todas partes.
 */
export function modoEnLaPuerta(valor: unknown, origen: string): ModoSistema {
  if (valor === undefined || valor === null || valor === '') return 'PRUEBA';
  return modoDePeticion(valor, origen);
}

/**
 * Los modos que el sistema sabe OPERAR hoy, no solo nombrar.
 *
 * `CERTIFICACION` existe en la base desde la 0046 y `entornoDgii()` sabe que le
 * corresponde `CerteCF`, pero el resto del sistema no lo soporta: 135
 * declaraciones de tipo en 45 ficheros siguen fijando `'PRODUCCION' | 'PRUEBA'`.
 *
 * Mientras eso sea asi, dejarlo pasar es peor que rechazarlo. Lo que hacia el
 * panel era justo eso: una empresa en CERTIFICACION acababa operando contra
 * TesteCF -- porque todo lo que no era 'PRODUCCION' caia a 'PRUEBA' -- pero la
 * insignia de la pantalla decia CERT. El usuario leia "Certificacion" y estaba
 * en pruebas. Un cartel que afirma lo que el sistema no esta haciendo.
 *
 * Se rechaza en la ENTRADA (ajustes y alta de empresa), asi que este error no
 * deberia poder verse nunca. Esta aqui por si alguna fila vieja lo trae.
 */
export type ModoOperativo = 'PRODUCCION' | 'PRUEBA';

export const MOTIVO_CERTIFICACION_NO_SOPORTADA =
  'El modo CERTIFICACION todavia no esta soportado. Esta reconocido como modo ' +
  'valido y le corresponde el ambiente CerteCF de la DGII, pero el resto del ' +
  'sistema aun fija PRODUCCION o PRUEBA en 135 sitios. Hasta completarlo no se ' +
  'admite: operar en pruebas mientras la pantalla dice "Certificacion" seria peor.';

export function modoOperativo(modo: ModoSistema, origen: string): ModoOperativo {
  if (modo === 'CERTIFICACION') {
    throw new Error(`${MOTIVO_CERTIFICACION_NO_SOPORTADA} (origen: ${origen})`);
  }
  return modo;
}
