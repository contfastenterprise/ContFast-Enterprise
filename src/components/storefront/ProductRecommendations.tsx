/**
 * "También te puede interesar", bajo la ficha de producto.
 *
 * Lote 231: usa la tarjeta comun (`TarjetaProducto`) en vez de su propia copia,
 * que ya no se parecia a la del catalogo.
 */
import Link from 'next/link';
import { StorefrontProduct } from '@/services/storefront/productService';
import { RejillaDeProductos } from './TarjetaProducto';

interface ProductRecommendationsProps {
  products: StorefrontProduct[];
  title?: string;
  empresaSlug: string;
}

export default function ProductRecommendations({ products, title = "También te puede interesar", empresaSlug }: ProductRecommendationsProps) {
  if (!products || products.length === 0) return null;

  return (
    <section className="mt-20 border-t border-slate-200 pt-14">
      <div className="mb-10 flex items-end justify-between gap-4">
        <h2 className="text-xl font-medium uppercase tracking-[0.15em] text-slate-900">{title}</h2>
        <Link href={`/${empresaSlug}/productos`} className="text-sm uppercase tracking-[0.15em] text-slate-900 underline underline-offset-8 hover:opacity-70">
          Ver más
        </Link>
      </div>
      <RejillaDeProductos productos={products} empresaSlug={empresaSlug} />
    </section>
  );
}
