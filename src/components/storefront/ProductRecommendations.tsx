import Link from 'next/link';
import { Package, Eye, ArrowRight } from 'lucide-react';
import { Button } from '@/components/storefront/ui/client-button';
import { StorefrontProduct } from '@/services/storefront/productService';
import CatalogAddButton from '@/components/storefront/CatalogAddButton';

interface ProductRecommendationsProps {
  products: StorefrontProduct[];
  title?: string;
  empresaSlug: string;
}

export default function ProductRecommendations({ products, title = "También podría interesarte", empresaSlug }: ProductRecommendationsProps) {
  if (!products || products.length === 0) return null;

  return (
    <section className="mt-16 pt-12 border-t border-slate-200">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-[#001e40]">{title}</h2>
        <Link href={`/${empresaSlug}/productos`} className="hidden sm:flex items-center text-[#c5a059] font-bold hover:text-[#b08c4a]">
          Ver más <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {products.map((product) => (
          <div key={product.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-[#c5a059]/40 relative z-10 hover:z-20">
            <div className="relative aspect-[4/3] bg-slate-100 flex items-center justify-center overflow-hidden">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <Package className="h-12 w-12 text-slate-300" />
              )}
              {/* Hover Actions */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <Link href={`/${empresaSlug}/productos/${product.slug}`}>
                  <Button size="icon" variant="secondary" className="bg-white text-[#001e40] hover:bg-slate-100 rounded-full h-10 w-10 hover:scale-110 transition-transform">
                    <Eye className="h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>
            
            <div className="p-4 flex flex-col flex-grow">
              <div className="mb-1 text-[10px] font-semibold text-[#c5a059] uppercase tracking-wider">
                {product.categoryName || 'Sin categoría'}
              </div>
              <h3 className="font-bold text-sm text-[#001e40] mb-2 line-clamp-2 flex-grow group-hover:text-[#c5a059] transition-colors" title={product.name}>
                {product.name}
              </h3>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50 group-hover:border-slate-100 transition-colors">
                <div className="flex flex-col">
                  <span className="font-bold text-[#001e40] leading-none">
                    RD$ {product.price.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[9px] text-slate-400 mt-1 uppercase tracking-wider">+ ITBIS</span>
                </div>
                <CatalogAddButton 
                  productId={product.id}
                  name={product.name}
                  price={Number(product.price)}
                  imageUrl={product.imageUrl}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-6 text-center sm:hidden">
        <Link href={`/${empresaSlug}/productos`} className="inline-flex items-center text-[#c5a059] font-bold hover:text-[#b08c4a]">
          Ver más productos <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
