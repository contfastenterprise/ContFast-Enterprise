/**
 * La barra lateral de filtros del catalogo (lote 231). Pedido del dueno:
 * "el sidebar solo para los filtros" — el orden va arriba a la derecha, como
 * en Spree, y lo demas de la pagina no vive en la barra.
 *
 * Son ENLACES, no un formulario con JavaScript: funcionan sin cargar nada,
 * se pueden abrir en otra pestana y cada filtro tiene su direccion. Cambiar de
 * categoria conserva la busqueda y el orden (`enlaceDelCatalogo`).
 */
import Link from 'next/link';
import { ChevronDown, X } from 'lucide-react';
import clsx from 'clsx';
import { enlaceDelCatalogo, ORDENES, type ClaveDeOrden } from '@/services/storefront/catalogo';
import type { StorefrontCategory } from '@/services/storefront/productService';
import { FOCO_TIENDA } from './botonTiendaVariantes';

type Actual = { categoria?: string; q?: string; orden: ClaveDeOrden };

const item = (activo: boolean) => clsx(
  'flex items-center justify-between gap-3 rounded-sm py-1.5 text-sm transition-colors',
  FOCO_TIENDA,
  activo ? 'font-semibold text-slate-900' : 'text-slate-600 hover:text-slate-900',
);

export function ListaDeFiltros({ empresaSlug, categorias, total, actual }: {
  empresaSlug: string; categorias: (StorefrontCategory & { cantidad: number })[]; total: number; actual: Actual;
}) {
  return (
    <div className="space-y-8">
      {actual.q && (
        <div>
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-900">Búsqueda</p>
          <Link href={enlaceDelCatalogo(empresaSlug, { ...actual, q: undefined }, {})}
            className={clsx('inline-flex max-w-full items-center gap-2 rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-900 hover:border-slate-900', FOCO_TIENDA)}
            aria-label={`Quitar la búsqueda "${actual.q}"`}>
            <span className="truncate">“{actual.q}”</span> <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </Link>
        </div>
      )}
      <div>
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-900">Categoría</p>
        <ul>
          <li>
            <Link href={enlaceDelCatalogo(empresaSlug, actual, { categoria: null })} aria-current={!actual.categoria ? 'page' : undefined}
              className={item(!actual.categoria)}>
              <span>Todas</span><span className="text-xs text-slate-500">{total}</span>
            </Link>
          </li>
          {categorias.map((c) => (
            <li key={c.id}>
              <Link href={enlaceDelCatalogo(empresaSlug, actual, { categoria: c.id })} aria-current={actual.categoria === c.id ? 'page' : undefined}
                className={item(actual.categoria === c.id)}>
                <span>{c.name}</span><span className="text-xs text-slate-500">{c.cantidad}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** "Ordenar por", arriba a la derecha. Un <details> con enlaces: sin JavaScript. */
export function MenuDeOrden({ empresaSlug, actual }: { empresaSlug: string; actual: Actual }) {
  const elegido = ORDENES.find((o) => o.clave === actual.orden) ?? ORDENES[0];
  return (
    <details className="group relative">
      <summary className={clsx('flex cursor-pointer list-none items-center gap-2 rounded-sm text-sm text-slate-900 [&::-webkit-details-marker]:hidden', FOCO_TIENDA)}>
        <span className="text-slate-500">Ordenar por:</span>
        <span className="font-semibold">{elegido.etiqueta}</span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul className="absolute right-0 z-40 mt-2 w-56 max-w-[calc(100vw-2rem)] border border-slate-200 bg-white py-2 shadow-lg">
        {ORDENES.map((o) => (
          <li key={o.clave}>
            <Link href={enlaceDelCatalogo(empresaSlug, actual, { orden: o.clave })} aria-current={o.clave === actual.orden ? 'true' : undefined}
              className={clsx('block px-4 py-2 text-sm hover:bg-slate-50 focus-visible:ring-inset', FOCO_TIENDA, o.clave === actual.orden ? 'font-semibold text-slate-900' : 'text-slate-600')}>
              {o.etiqueta}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
