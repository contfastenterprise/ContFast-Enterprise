/**
 * Lote 267: la lista de clientes de Cuentas por Cobrar, desplegable como la del reporte.
 *
 * Pedido del dueño (2026-10-03): *"en la pagina dashboard/receivables los clientes deben verse en
 * una lista que se pueda expandir y contraer, parecida a la de /dashboard/receivables-report"*.
 * Como alli, se despliega UN cliente a la vez: abrir otro cierra el anterior.
 *
 * Puro, para que el banco lo ejecute.
 */

/** El cliente desplegado tras pulsar `id`: lo abre, o lo cierra si ya estaba abierto. */
export function alternarCliente(abierto: string | null, id: string): string | null {
  return abierto === id ? null : id;
}

/**
 * Si una factura esta vencida: le queda saldo y su vencimiento es ANTERIOR a hoy, comparando DIAS de
 * RD (AAAA-MM-DD). Antes se comparaba `new Date(vencimiento) < new Date()`: un vencimiento sin hora
 * es medianoche UTC, asi que en RD (UTC-4) una factura que vence hoy salia vencida desde las 20:00
 * del dia anterior. `hoy` lo pasa quien llama (el dia de RD), para que la regla sea pura.
 */
export function estaVencida(vencimiento: string | null | undefined, saldo: number, hoy: string): boolean {
  const dia = String(vencimiento ?? '').slice(0, 10);
  return saldo > 0 && dia !== '' && dia < hoy;
}

/** Las iniciales del avatar: las dos primeras letras del nombre, sin espacios delante. */
export function inicialesDelCliente(nombre: string | null | undefined): string {
  const limpio = (nombre ?? '').trim();
  return limpio ? limpio.substring(0, 2).toUpperCase() : '?';
}
