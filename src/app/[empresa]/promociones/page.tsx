import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Tag, Sparkles } from 'lucide-react';
import { StorefrontCompanyService } from '@/services/storefront/companyService';
import { StorefrontProductService } from '@/services/storefront/productService';
import ProductRecommendations from '@/components/storefront/ProductRecommendations';
import { Button } from '@/components/storefront/ui/client-button';

export async function generateMetadata({ params }: { params: Promise<{ empresa: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const company = await StorefrontCompanyService.resolveCompanyBySlug(resolvedParams.empresa);
  return {
    title: `Promociones | ${company?.name || 'Tienda en Línea'}`,
    description: `Descubre las mejores ofertas y promociones en ${company?.name || 'nuestra tienda'}.`
  };
}

export const dynamic = 'force-dynamic';

export default async function PromocionesPage({ params }: { params: Promise<{ empresa: string }> }) {
  const resolvedParams = await params;
  const empresaSlug = resolvedParams.empresa;
  
  const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
  if (!company) notFound();

  // Obtenemos los productos que están marcados en oferta real en la base de datos
  const promoProducts = await StorefrontProductService.getPromotionalProducts(company.id);

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Hero de Promociones */}
      <section className="relative bg-[#001e40] py-20 overflow-hidden">
        {/* Background Decorations */}
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-[#c5a059] opacity-20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-80 h-80 bg-blue-500 opacity-10 rounded-full blur-3xl"></div>
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-2xl text-white">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-semibold mb-6 backdrop-blur-sm">
              <Sparkles className="h-4 w-4 text-[#c5a059]" />
              <span className="text-[#c5a059]">Ofertas Exclusivas</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">
              Promociones de Temporada
            </h1>
            <p className="text-lg text-slate-300 mb-8 leading-relaxed">
              Renueva tus espacios con nuestros descuentos especiales. Calidad premium al mejor precio del mercado. 
              Estas ofertas están disponibles por tiempo limitado.
            </p>
            <Link href={`/${empresaSlug}/productos`}>
              <Button size="lg" className="bg-[#c5a059] hover:bg-[#b08c4a] text-slate-950 font-bold border-none rounded-xl">
                Ver Todo el Catálogo
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Contenido Principal */}
      <section className="py-16 container mx-auto px-4 sm:px-6 lg:px-8">
        
        {promoProducts.length === 0 ? (
          /* Placeholder Promocional cuando no hay ofertas */
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 md:p-12 mb-16 relative overflow-hidden flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center shrink-0 border border-slate-100 shadow-inner">
              <Tag className="h-10 w-10 text-[#c5a059]" />
            </div>
            <div className="flex-grow">
              <h2 className="text-2xl font-bold text-[#001e40] mb-2">¡Próximamente más ofertas!</h2>
              <p className="text-slate-500 max-w-2xl">
                Actualmente estamos preparando una nueva colección de descuentos. Vuelve pronto para descubrir promociones exclusivas en nuestros productos.
              </p>
            </div>
          </div>
        ) : (
          /* Productos en Promoción Reales */
          <div className="mt-8">
            <ProductRecommendations 
              products={promoProducts} 
              empresaSlug={empresaSlug}
              title="Aprovecha estas ofertas"
            />
          </div>
        )}

      </section>
    </div>
  );
}
