import CartPageClient from './CartPageClient';
import { StorefrontProductService } from '@/services/storefront/productService';
import { StorefrontCompanyService } from '@/services/storefront/companyService';
import { precioVigente } from '@/services/storefront/catalogo';
import ProductRecommendations from '@/components/storefront/ProductRecommendations';
import TituloDeSeccion from '@/components/storefront/TituloDeSeccion';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ empresa: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const company = await StorefrontCompanyService.resolveCompanyBySlug(resolvedParams.empresa);
  //  Lo que cada visitante arma en su navegador no se indexa.
  return { title: `Mi cotización | ${company?.name || 'Tienda en Línea'}`, robots: { index: false } };
}

export const dynamic = 'force-dynamic';

/**
 * La cotizacion del visitante (lote 233: sin cuentas, decision del dueno). El
 * carrito vive en el navegador; los PRECIOS los pone el servidor en cada
 * visita (`armarCotizacion`), asi que siempre son los de hoy.
 */
export default async function MiCotizacionPage({ params }: { params: Promise<{ empresa: string }> }) {
  const { empresa: empresaSlug } = await params;

  const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
  if (!company) {
    notFound();
  }

  const [productos, recommended] = await Promise.all([
    StorefrontProductService.getActiveProducts(company.id),
    StorefrontProductService.getRecommendations(company.id, 4),
  ]);
  const catalogo = productos.map((p) => ({ id: p.id, name: p.name, precio: precioVigente(p), imageUrl: p.imageUrl, slug: p.slug }));

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 pt-12 sm:px-6 lg:px-10 print:p-0">
      <TituloDeSeccion titulo="Mi cotización" descripcion="Los precios son los de hoy y no incluyen el ITBIS hasta el total." className="print:hidden" />

      <CartPageClient
        empresaSlug={empresaSlug}
        catalogo={catalogo}
        empresa={{ name: company.name, rnc: company.rnc, phone: company.phone ?? null, email: company.email ?? null, address: company.address ?? null }}
      />

      <div className="print:hidden">
        <ProductRecommendations products={recommended} title="Completa tu proyecto" empresaSlug={empresaSlug} />
      </div>
    </div>
  );
}
