import CartPageClient from './CartPageClient';
import { StorefrontProductService } from '@/services/storefront/productService';
import { StorefrontCompanyService } from '@/services/storefront/companyService';
import ProductRecommendations from '@/components/storefront/ProductRecommendations';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ empresa: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const company = await StorefrontCompanyService.resolveCompanyBySlug(resolvedParams.empresa);
  return {
    title: `Mi Cotización | ${company?.name || 'Tienda en Línea'}`,
  };
}

export const dynamic = 'force-dynamic';

export default async function MiCotizacionPage({ params }: { params: Promise<{ empresa: string }> }) {
  const resolvedParams = await params;
  const empresaSlug = resolvedParams.empresa;
  
  const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
  if (!company) {
    notFound();
  }

  // Para el carrito sugerimos productos aleatorios de ESTA empresa ya que no sabemos qué hay exactamente sin leer el localstorage del cliente
  const recommended = await StorefrontProductService.getRecommendations(company.id, 4);

  return (
    <div className="bg-slate-50 min-h-screen py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#001e40]">Mi Cotización</h1>
          <p className="text-slate-500 mt-1">Revisa los productos seleccionados y envía tu solicitud.</p>
        </div>
        
        <CartPageClient empresaSlug={empresaSlug} companyPhone={company.phone} />

        <ProductRecommendations products={recommended} title="Completa tu proyecto con estos productos" empresaSlug={empresaSlug} />
      </div>
    </div>
  );
}
