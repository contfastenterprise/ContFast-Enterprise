import { StorefrontProductService } from '@/services/storefront/productService';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Package, Check, ShieldCheck, Clock } from 'lucide-react';
import AddToCartClient from '@/components/storefront/AddToCartClient';
import ProductRecommendations from '@/components/storefront/ProductRecommendations';
import { StorefrontCompanyService } from '@/services/storefront/companyService';
import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ empresa: string; slug: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const company = await StorefrontCompanyService.resolveCompanyBySlug(resolvedParams.empresa);
  const product = await StorefrontProductService.getProductBySlug(resolvedParams.slug);
  
  if (!product) return { title: 'Producto no encontrado' };
  
  return {
    title: `${product.name} | ${company?.name || 'Tienda en Línea'}`,
    description: product.description || `Comprar ${product.name}`,
  };
}

export default async function StorefrontProductDetailPage({
  params
}: {
  params: Promise<{ empresa: string; slug: string }>
}) {
  const resolvedParams = await params;
  const empresaSlug = resolvedParams.empresa;
  
  const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
  if (!company) {
    notFound();
  }

  const product = await StorefrontProductService.getProductBySlug(resolvedParams.slug);

  if (!product) {
    notFound();
  }

  // Desestructuramos para la vista
  const { id, name, description, price, imageUrl, categoryName, categoryId } = product;
  
  // Obtenemos recomendaciones (Fase 5)
  const recommended = await StorefrontProductService.getRecommendations(company.id, 4, id, categoryId || undefined);

  return (
    <div className="bg-slate-50 min-h-screen py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        {/* Breadcrumb / Back button */}
        <div className="mb-8">
          <Link href={`/${empresaSlug}/productos`} className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-[#001e40] transition-colors">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver al catálogo
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {/* Image Gallery Area */}
            <div className="relative aspect-square md:aspect-auto md:h-full bg-slate-100 flex items-center justify-center p-8 border-b md:border-b-0 md:border-r border-slate-200">
              {imageUrl ? (
                <img 
                  src={imageUrl} 
                  alt={name} 
                  className="max-w-full max-h-full object-contain mix-blend-multiply drop-shadow-md"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-300">
                  <Package className="h-32 w-32 mb-4" />
                  <span className="text-sm font-medium">Sin imagen disponible</span>
                </div>
              )}
              {/* Badge de Promoción estático por ahora */}
              {/* <div className="absolute top-4 left-4 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                OFERTA
              </div> */}
            </div>

            {/* Product Details */}
            <div className="p-8 md:p-12 flex flex-col">
              <div className="mb-2">
                <span className="inline-block py-1 px-3 rounded-full bg-[#001e40]/5 text-[#001e40] text-xs font-bold uppercase tracking-wider">
                  {categoryName || 'Sin categoría'}
                </span>
              </div>
              
              <h1 className="text-3xl md:text-4xl font-bold text-[#001e40] mb-4">
                {name}
              </h1>

              <div className="mb-6">
                <span className="text-3xl font-extrabold text-slate-900">
                  RD$ {price.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
                <p className="text-sm text-slate-500 mt-1">Precio sugerido detallista (ITBIS incluido según aplique)</p>
              </div>

              <div className="prose prose-sm text-slate-600 mb-8 max-w-none">
                <p>{description || 'Este producto no tiene una descripción detallada en este momento.'}</p>
                
                {/* Nota: Material, Color, etc. no están en DB actualmente, se deja documentado para la regla 4 */}
                <div className="mt-6 space-y-2">
                  <div className="flex items-center text-sm">
                    <Check className="h-4 w-4 text-green-500 mr-2 shrink-0" />
                    <span>Disponibilidad sujeta a verificación de inventario</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <ShieldCheck className="h-4 w-4 text-[#c5a059] mr-2 shrink-0" />
                    <span>Garantía de fabricación estándar</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Clock className="h-4 w-4 text-[#001e40] mr-2 shrink-0" />
                    <span>Tiempo de entrega a confirmar en cotización final</span>
                  </div>
                </div>
              </div>

              <div className="mt-auto border-t border-slate-100 pt-6">
                <AddToCartClient 
                  productId={id} 
                  name={name} 
                  price={price} 
                  imageUrl={imageUrl} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Recomendaciones (Fase 5) */}
        <ProductRecommendations products={recommended} empresaSlug={empresaSlug} />
      </div>
    </div>
  );
}
