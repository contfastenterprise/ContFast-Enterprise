import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EnlaceTienda } from '@/components/storefront/BotonTienda';
import EstadoVacio from '@/components/storefront/EstadoVacio';
import TituloDeSeccion from '@/components/storefront/TituloDeSeccion';
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
      <TituloDeSeccion titulo="Promociones" descripcion="Productos con precio especial por tiempo limitado." />
      <div className="mt-8 border-t border-slate-200 pt-10">
        {ofertas.length === 0 ? (
          <EstadoVacio titulo="Ahora mismo no hay ofertas" texto="Vuelve pronto: las promociones aparecerán aquí.">
            <EnlaceTienda href={`/${empresaSlug}/productos`}>Ver todo el catálogo</EnlaceTienda>
          </EstadoVacio>
        ) : (
          <RejillaDeProductos productos={ofertas} empresaSlug={empresaSlug} />
        )}
      </div>
    </div>
  );
}
