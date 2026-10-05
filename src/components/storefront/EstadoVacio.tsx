/**
 * Lo que la tienda enseña cuando una lista no tiene nada (lote 282): el catalogo sin resultados,
 * las promociones sin ofertas, los favoritos y la cotizacion vacios. Eran cuatro copias a mano, con
 * dos rellenos distintos (`py-16` y `py-20`); ahora una, y la accion (siempre un `EnlaceTienda`)
 * llega como hijo, con su texto.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export default function EstadoVacio({ titulo, texto, children, className }: {
  titulo: string; texto: string; children?: ReactNode; className?: string;
}) {
  return (
    <div className={cn('py-16 text-center', className)}>
      <p className="text-lg text-slate-900">{titulo}</p>
      <p className="mt-2 text-sm text-slate-500">{texto}</p>
      {children && <div className="mt-8">{children}</div>}
    </div>
  );
}
