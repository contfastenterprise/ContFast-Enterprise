/**
 * "También te puede interesar", bajo la ficha de producto.
 *
 * Lote 231: usa la tarjeta comun (`TarjetaProducto`) en vez de su propia copia,
 * que ya no se parecia a la del catalogo.
 */
import { EnlaceTienda } from './BotonTienda';
import TituloDeSeccion from './TituloDeSeccion';
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
      <TituloDeSeccion nivel={2} titulo={title} className="mb-10"
        accion={<EnlaceTienda href={`/${empresaSlug}/productos`} variante="enlace">Ver más</EnlaceTienda>} />
      <RejillaDeProductos productos={products} empresaSlug={empresaSlug} />
    </section>
  );
}
