'use client';

/** El corazon de Spree en la esquina de cada producto (lote 231). */
import { Heart } from 'lucide-react';
import clsx from 'clsx';
import { esFavorito } from '@/services/storefront/favoritos';
import { useFavoritos } from './useFavoritos';
import { FOCO_TIENDA } from './botonTiendaVariantes';

export default function BotonFavorito({ empresaSlug, productId, nombre, grande = false }: {
  empresaSlug: string; productId: string; nombre: string; grande?: boolean;
}) {
  const { lista, alternar } = useFavoritos(empresaSlug);
  const activo = esFavorito(lista, productId);
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); alternar(productId); }}
      aria-pressed={activo}
      aria-label={activo ? `Quitar ${nombre} de favoritos` : `Guardar ${nombre} en favoritos`}
      className={clsx(
        'relative z-30 flex items-center justify-center rounded-full transition-colors',
        FOCO_TIENDA,
        grande ? 'h-12 w-12 border border-slate-300 bg-white hover:border-slate-900' : 'h-9 w-9 bg-white/80 hover:bg-white',
      )}
    >
      <Heart className={clsx(grande ? 'h-5 w-5' : 'h-[18px] w-[18px]', activo ? 'fill-red-600 text-red-600' : 'text-slate-900')} strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}
