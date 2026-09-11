import { toast } from 'sonner';
import type { TipoCartera } from './tipos';

/**
 * El estado de cuenta impreso de ESTE panel.
 *
 * POR QUE NO USA LA RUTA DE `financial/statements`
 * -----------------------------------------------
 * Esa ruta existe y funciona, pero produce otro documento, y el que se decidio
 * para este panel es este. Asi que hay dos caminos a "un estado de cuenta" y no
 * es un descuido: son dos papeles distintos a proposito. Lo que si hay que
 * saber es que son dos, y que tocar uno no arregla el otro.
 *
 * Su contrato es sencillo -- GET, y devuelve el PDF -- asi que desde una fila
 * basta un enlace y el navegador lo abre solo, sin ventana que puedan bloquear.
 * `abrirEstadoImpreso` existe para el boton del estado de cuenta, donde no hay
 * enlace que pulsar.
 */
export const urlEstadoImpreso = (tipo: TipoCartera, id: string): string =>
  `/api/v1/cartera/${id}/print?tipo=${tipo}`;

/**
 * Abre el PDF desde un boton.
 *
 * SIN `await` ANTES del `window.open`: mientras la llamada salga directamente
 * del clic, el navegador la deja pasar. En cuanto se mete una espera delante,
 * deja de contar como accion del usuario y la bloquea. Aun asi se comprueba, y
 * si la bloqueo se ofrece el enlace en el propio aviso.
 */
export function abrirEstadoImpreso(tipo: TipoCartera, id: string): void {
  const url = urlEstadoImpreso(tipo, id);
  const ventana = window.open(url, '_blank');
  if (!ventana) {
    toast.error('El navegador bloqueó la ventana.', {
      description: 'Permite las ventanas emergentes para este sitio, o abre el estado de cuenta desde aquí.',
      action: { label: 'Abrir', onClick: () => window.open(url, '_blank') },
      duration: 12000,
    });
  }
}
