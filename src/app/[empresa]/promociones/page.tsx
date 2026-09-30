import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { StorefrontCompanyService } from '@/services/storefront/companyService';
import { StorefrontProductService } from '@/services/storefront/productService';
import { ordenarProductos, tieneOferta } from '@/services/storefront/catalogo';
import { RejillaDeProductos } from '@/components/storefront/TarjetaProducto';

export async function generateMetadata({ params }: { params: Promise<{ empresa: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const company = await StorefrontCompanyService.resolveCompanyBySlug(resolvedParams.empresa);
  return {
    title: `Promociones | ${company?.name || 'Tienda en Línea'}`,
    description: `Descubre las mejores ofertas y promociones en ${company?.name || 'nuestra tienda'}.`
  };
}

export const dynamic = 'force-dynamic';

/**
 * Las promociones, al estilo de Spree (lote 231). Solo cuentan las ofertas DE
 * VERDAD (`tieneOferta`: con precio de oferta y por debajo del de lista), la
 * misma regla con la que la cabecera decide si ofrecer este enlace. Antes
 * bastaba la marca, y una oferta marcada sin precio salia como tal.
 */
export default async function PromocionesPage({ params }: { params: Promise<{ empresa: string }> }) {
  const { empresa: empresaSlug } = await params;

  const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
  if (!company) notFound();

  const ofertas = ordenarProductos((await StorefrontProductService.getPromotionalProducts(company.id)).filter(tieneOferta), 'nombre');

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 pt-12 sm:px-6 lg:px-10">
      <h1 className="text-3xl font-medium uppercase tracking-[0.12em] text-slate-900">Promociones</h1>
      <p className="mt-2 text-sm text-slate-500">Productos con precio especial por tiempo limitado.</p>
      <div className="mt-8 border-t border-slate-200 pt-10">
        {ofertas.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-lg text-slate-900">Ahora mismo no hay ofertas</p>
            <p className="mt-2 text-sm text-slate-500">Vuelve pronto: las promociones aparecerán aquí.</p>
            <Link href={`/${empresaSlug}/productos`}
              className="mt-8 inline-block rounded-full bg-[#001e40] px-8 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-white hover:bg-[#00142a]">
              Ver todo el catálogo
            </Link>
          </div>
        ) : (
          <RejillaDeProductos productos={ofertas} empresaSlug={empresaSlug} />
        )}
      </div>
    </div>
  );
}
