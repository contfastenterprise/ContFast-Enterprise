/**
 * La cabecera de una pagina o de una seccion de la tienda (lote 282). Antes el mismo titulo
 * —`text-3xl font-medium uppercase tracking-[0.12em]` con su linea gris debajo— estaba escrito a
 * mano en el catalogo, las promociones, los favoritos y la cotizacion, y el de seccion ("Nuestros
 * productos", "También te puede interesar") en dos tamaños distintos.
 *
 *  · `nivel = 1`: el `<h1>` de la pagina, con su descripcion.
 *  · `nivel = 2`: el `<h2>` de una seccion, con su enlace a la derecha ("Ver todos").
 *
 * Solo pinta: lo usan componentes de servidor.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export default function TituloDeSeccion({ titulo, descripcion, accion, nivel = 1, className }: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  accion?: ReactNode;
  nivel?: 1 | 2;
  className?: string;
}) {
  const Etiqueta = nivel === 1 ? 'h1' : 'h2';
  const titular = (
    <div>
      <Etiqueta className={nivel === 1
        ? 'text-3xl font-medium uppercase tracking-[0.12em] text-slate-900'
        : 'text-xl font-medium uppercase tracking-[0.15em] text-slate-900 md:text-2xl'}>
        {titulo}
      </Etiqueta>
      {descripcion && <p className="mt-2 text-sm text-slate-500">{descripcion}</p>}
    </div>
  );
  if (!accion) return <div className={className}>{titular}</div>;
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      {titular}
      {accion}
    </div>
  );
}
