/**
 * La tarjeta de producto de la tienda, al estilo de Spree (lote 231): foto
 * cuadrada sobre gris, el corazon arriba a la derecha, OFERTA arriba a la
 * izquierda, y debajo nombre y precio. La usan el catalogo, la portada, las
 * promociones, los favoritos y las recomendaciones — antes cada una llevaba su
 * copia de la tarjeta, y ya no se parecian.
 *
 * El nombre es el enlace y su `before:` cubre la tarjeta entera; el corazon y
 * "Cotizar" van por ENCIMA (`z-30`), o pulsarlos navegaria a la ficha.
 */
import Link from 'next/link';
import BotonFavorito from './BotonFavorito';
import CatalogAddButton from './CatalogAddButton';
import { inicialesDe, precioDeTienda, precioVigente, tieneOferta } from '@/services/storefront/catalogo';
import type { StorefrontProduct } from '@/services/storefront/productService';

/** Donde falta la foto (hoy, en todos): la inicial del producto sobre gris. */
export function MarcadorDeProducto({ nombre, categoria, grande = false }: { nombre: string; categoria: string | null; grande?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 select-none" aria-hidden="true">
      <span className={grande ? 'text-7xl font-light tracking-[0.2em] text-slate-300' : 'text-5xl font-light tracking-[0.2em] text-slate-300'}>
        {inicialesDe(nombre)}
      </span>
      {categoria && <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-slate-400">{categoria}</span>}
    </div>
  );
}

export function PrecioDeTienda({ producto, grande = false }: { producto: StorefrontProduct; grande?: boolean }) {
  const oferta = tieneOferta(producto);
  return (
    <p className={grande ? 'flex flex-wrap items-baseline gap-x-3 text-2xl' : 'flex flex-wrap items-baseline gap-x-2 text-[15px]'}>
      {oferta && (
        <span className="text-slate-400 line-through">
          <span className="sr-only">Antes </span>{precioDeTienda(producto.price)}
        </span>
      )}
      <span className={oferta ? 'text-red-600' : 'text-slate-900'}>
        {oferta && <span className="sr-only">Ahora </span>}{precioDeTienda(precioVigente(producto))}
      </span>
      <span className="text-[11px] uppercase tracking-wider text-slate-400">+ ITBIS</span>
    </p>
  );
}

export default function TarjetaProducto({ producto, empresaSlug }: { producto: StorefrontProduct; empresaSlug: string }) {
  const oferta = tieneOferta(producto);
  return (
    <article className="group relative flex flex-col">
      <div className="relative aspect-square overflow-hidden bg-[#f4f4f3]">
        {oferta && (
          <span className="absolute left-3 top-3 z-20 rounded-full bg-red-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
            Oferta
          </span>
        )}
        <div className="absolute right-3 top-3 z-30">
          <BotonFavorito empresaSlug={empresaSlug} productId={producto.id} nombre={producto.name} />
        </div>
        {producto.imageUrl ? (
          <img
            src={producto.imageUrl}
            alt={producto.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <MarcadorDeProducto nombre={producto.name} categoria={producto.categoryName} />
        )}
      </div>
      <h3 className="mt-4 text-[15px] leading-snug text-slate-900">
        <Link
          href={`/${empresaSlug}/productos/${producto.slug}`}
          className="before:absolute before:inset-0 before:z-10 hover:underline underline-offset-4 focus-visible:outline-none focus-visible:underline"
        >
          {producto.name}
        </Link>
      </h3>
      <div className="mt-1.5"><PrecioDeTienda producto={producto} /></div>
      <div className="relative z-30 mt-3">
        <CatalogAddButton
          productId={producto.id}
          name={producto.name}
          price={precioVigente(producto)}
          imageUrl={producto.imageUrl}
        />
      </div>
    </article>
  );
}

/** La rejilla de 4 columnas de Spree (2 en movil). */
export function RejillaDeProductos({ productos, empresaSlug, columnas = 4 }: {
  productos: StorefrontProduct[]; empresaSlug: string; columnas?: 3 | 4;
}) {
  return (
    <div className={columnas === 3
      ? 'grid grid-cols-2 gap-x-4 gap-y-10 md:gap-x-6 lg:grid-cols-3'
      : 'grid grid-cols-2 gap-x-4 gap-y-10 md:gap-x-6 lg:grid-cols-4'}>
      {productos.map((p) => <TarjetaProducto key={p.id} producto={p} empresaSlug={empresaSlug} />)}
    </div>
  );
}
