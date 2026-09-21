/**
 * Que es un aviso del panel y como de grave es. SIN base de datos.
 *
 * POR QUE ESTE FICHERO (lote 178)
 * -------------------------------
 * Esto vivia en `sincronizarAvisos.ts`, que abre la conexion a la base en
 * cuanto se importa. Mientras solo lo usaba quien ya estaba hablando con la
 * base daba igual; al aparecer `avisoPorWhatsApp.ts` -- que decide a quien y
 * que se manda, y cuyo valor esta justamente en poder probarse sin red ni
 * base -- ese import arrastraba `@/db` detras y el banco no podia cargarlo sin
 * `DATABASE_URL`. Se vio corriendo la verificacion completa, no al escribirlo.
 *
 * La regla, para no repetirlo: lo que es una DECISION va en un fichero que no
 * importa `@/db`. Quien guarda, importa a quien decide, nunca al reves.
 *
 * `sincronizarAvisos` lo reexporta, asi que quien ya lo usaba no cambia.
 */

/** Lo que trae cada aviso del panel (ver repositories/dashboardRepository.ts). */
export interface AvisoDelPanel {
  id: string;
  type: string;
  title: string;
  description: string;
  actionText: string;
  actionLink: string;
}

/**
 * Como de grave es cada aviso. Ordena y colorea la campana, y desde el lote 178
 * decide ademas que llega al telefono: un comprobante rechazado no es lo mismo
 * que un periodo que se acaba dentro de un mes.
 */
export function severidadDeAviso(tipo: string): 'error' | 'warning' | 'info' {
  // Lote 176: una diferencia de arqueo es dinero que falta o que sobra y que
  // el mayor no refleja. No es un recordatorio: es un descuadre.
  if (tipo === 'invoice_rejected' || tipo === 'caja_con_diferencia') return 'error';
  if (tipo === 'check_due' || tipo === 'caja_sin_cerrar' || tipo === 'declaracion_pendiente') return 'warning';
  return 'info';
}
