/**
 * Que quiere decir el codigo HTTP con el que mSeller rechaza un envio.
 *
 * POR QUE ESTE FICHERO (lote 220)
 * -------------------------------
 * `sendDocument` devolvia el motivo y TIRABA el codigo. Sin marca de rechazo de
 * la DGII, todo fallo acababa igual -- "Enviado, pero la respuesta no llego
 * completa" -- fuera un 401 (credenciales), un 400 (peticion mal formada) o un
 * corte de red. Y el primero se SABE en el acto: el cajero veia "Enviado" y la
 * causa aparecia, como mucho, 30 minutos despues, cuando la sincronizacion
 * escribia "mSeller no reconoce este e-NCF".
 *
 * Medido el 2026-09-28 (solo lectura): de los 85 envios de toda la historia,
 * NINGUNO fallo por HTTP; todos fueron aceptados o rechazados por la DGII. Este
 * lote no corrige algo que pase, sino que el dia que pase -- credenciales
 * vencidas es lo tipico -- se diga que es.
 *
 * La tabla es la de la documentacion de mSeller ("Manejo de errores"):
 *   400 JSON mal formado · 401 autenticacion · 403 API Key invalida ·
 *   429 limite de solicitudes · 500 error del servidor.
 *
 * LO QUE NO CAMBIA, a proposito: el DESENLACE. La factura sigue en `submitted`
 * y no se reenvia sola -- eso lo decide `leerDesenlace`, no el codigo --, porque
 * afirmar que algo no llego a la DGII y reenviarlo es como se duplica un e-CF.
 * El codigo solo cambia lo que se DICE, y un 4xx lo dice con la prudencia de
 * "segun mSeller".
 *
 * Sin base de datos y sin red: aqui solo se decide.
 */

/** Un 4xx: mSeller rechazo la peticion antes de procesarla. */
export function esRechazoDeLaPeticion(codigo: number | null | undefined): boolean {
  return typeof codigo === 'number' && codigo >= 400 && codigo < 500;
}

/** Un 5xx: fallo mSeller, y no consta si el documento llego a salir. */
export function esFalloDelServidor(codigo: number | null | undefined): boolean {
  return typeof codigo === 'number' && codigo >= 500 && codigo < 600;
}

/**
 * La causa en palabras, o `null` si el codigo no dice nada (no vino, o no es un
 * error). Lleva siempre el numero: es lo que se busca en la documentacion.
 */
export function causaDelCodigoHttp(codigo: number | null | undefined): string | null {
  if (typeof codigo !== 'number') return null;
  switch (codigo) {
    case 400: return 'mSeller rechazó la petición por su formato (HTTP 400)';
    case 401: return 'mSeller no aceptó las credenciales (HTTP 401): revisar el usuario y la contraseña de mSeller en Configuración';
    case 403: return 'mSeller no aceptó la clave de API (HTTP 403): revisar la clave de mSeller en Configuración';
    case 429: return 'se superó el límite de peticiones de mSeller (HTTP 429)';
  }
  if (esFalloDelServidor(codigo)) return `error del servidor de mSeller (HTTP ${codigo})`;
  if (esRechazoDeLaPeticion(codigo)) return `mSeller rechazó la petición (HTTP ${codigo})`;
  return null;
}
