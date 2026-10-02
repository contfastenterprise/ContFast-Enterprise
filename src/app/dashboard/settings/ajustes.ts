/**
 * Lo que comparten las piezas de Configuracion y no es ni estado ni pintura
 * (lote 239). Puro: sin React y sin red, para que el banco lo ejecute.
 */

export type PestanaDeAjustes = 'perfil' | 'empresa' | 'tienda' | 'puente' | 'suscripcion' | 'gastos';

/**
 * Las pestanas, en su orden. "Mi Perfil" la ve cualquiera; las demas, solo
 * administracion y sistemas (la regla la aplica quien las pinta).
 */
export const PESTANAS: ReadonlyArray<{ id: PestanaDeAjustes; nombre: string; deConfiguracion: boolean }> = [
  { id: 'perfil', nombre: 'Mi Perfil', deConfiguracion: false },
  { id: 'empresa', nombre: 'Configuración Empresa', deConfiguracion: true },
  { id: 'tienda', nombre: 'Tienda', deConfiguracion: true },
  { id: 'puente', nombre: 'Cuentas Puente', deConfiguracion: true },
  { id: 'suscripcion', nombre: 'Plan & Suscripción', deConfiguracion: true },
  { id: 'gastos', nombre: 'Tipos de Gastos', deConfiguracion: true },
];

export type TipoDeGasto = { id: string; code: string; name: string; status: 'active' | 'inactive' };

/** Los diez tipos de gasto de la DGII (01 a 10). */
const ESTANDAR = new Set(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);

/**
 * Un tipo de gasto ESTANDAR no se elimina, se desactiva: son los de la DGII y
 * el 606 los necesita. Estaba escrito tres veces (la lista en movil, la de
 * escritorio y la confirmacion al borrar), cada una con su copia de los diez
 * codigos.
 */
export const esTipoEstandar = (codigo: string): boolean => ESTANDAR.has(codigo);

/**
 * El importe que hay en un campo numerico, como numero que se puede guardar.
 *
 * Antes era `Number(e.target.value)` a secas: un campo que el navegador deja a
 * medias ("-", "1e") da `NaN`, y `NaN` viaja en el JSON como `null` -- el limite
 * se guardaba vacio sin que nadie lo hubiera pedido. Y un limite de aprobacion
 * NEGATIVO no significa nada. Lo que no es un importe valido es 0.
 */
export function importeDelCampo(valor: string): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Que se le dice a quien guarda las cuentas puente, a partir de lo que contesto
 * el servidor a CADA una. Antes no se miraba ninguna respuesta y el aviso era
 * siempre "guardadas exitosamente", tambien con un 403 o un 500 en todas.
 */
export function avisoDeCuentasPuente(resultados: ReadonlyArray<{ bien: boolean; mensaje?: string }>): { bien: boolean; texto: string } {
  const fallidas = resultados.filter((r) => !r.bien);
  if (fallidas.length === 0) return { bien: true, texto: 'Cuentas puente guardadas exitosamente.' };
  const motivo = fallidas[0].mensaje ? `: ${fallidas[0].mensaje}` : '.';
  return { bien: false, texto: `No se guardaron ${fallidas.length} de ${resultados.length} cuentas puente${motivo}` };
}
