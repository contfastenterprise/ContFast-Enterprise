/**
 * La cabecera de una pantalla del panel (lote 270, auditoria de UI). La auditoria conto doce formas
 * distintas de escribir el titulo — azul marino, dorado (que sobre blanco no pasa ni 3:1), gris
 * pizarra, con y sin icono, de 2xl a 4xl — y las acciones a veces a la derecha, a veces debajo.
 *
 * El patron es el que ya usaban la mayoria (clientes, suplidores, conduces):
 *
 *     [icono] Titulo                                  [secundarias] [principal]
 *     descripcion
 *
 * En el movil el bloque de acciones baja debajo del titulo y ocupa el ancho, sin cortarse
 * (`flex-wrap`). Con las pestañas de registro (lotes 240-243) las pestañas SON las acciones: van
 * solas, y los demas botones viven en la barra de la lista.
 *
 * Solo pinta: que acciones hay, y su orden, lo decide cada pantalla siguiendo
 * `docs/estandar_ui.md` (la principal la ultima, a la derecha).
 */
import type { ReactNode } from 'react';

export function CabeceraDePagina({ titulo, descripcion, icono, acciones, children }: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  /** Un icono de lucide; se pinta a 28 px y en el dorado de la casa (decorativo: `aria-hidden`). */
  icono?: ReactNode;
  /** Botones, o las pestañas de registro. A la derecha en escritorio. */
  acciones?: ReactNode;
  /** Lo que va debajo del titulo y no es una accion (un aviso, un selector de periodo). */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-primary flex items-center gap-2">
          {icono && <span aria-hidden="true" className="shrink-0 text-[#C5A059] [&_svg]:size-7">{icono}</span>}
          <span className="min-w-0">{titulo}</span>
        </h1>
        {descripcion && <p className="text-slate-500 text-sm mt-1">{descripcion}</p>}
        {children}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:justify-end shrink-0">{acciones}</div>}
    </header>
  );
}
