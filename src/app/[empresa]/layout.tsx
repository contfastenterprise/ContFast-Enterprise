import { StorefrontCompanyService } from '@/services/storefront/companyService';
import { StorefrontProductService } from '@/services/storefront/productService';
import { categoriasConProductos } from '@/services/storefront/catalogo';
import CabeceraTienda, { type EnlaceDelMenu } from '@/components/storefront/CabeceraTienda';
import PieTienda from '@/components/storefront/PieTienda';
import { BarraDeAnuncio } from '@/components/storefront/PortadaTienda';
import { leerPortadaDeLaTienda } from '@/services/storefront/portadaRepositorio';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ empresa: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const company = await StorefrontCompanyService.resolveCompanyBySlug(resolvedParams.empresa);
  return {
    title: company ? `${company.name} | Tienda en Línea` : 'Tienda en Línea',
    description: company ? `Catálogo de productos de ${company.name}` : 'Catálogo de productos',
  };
}

/** Cuantas categorias caben en el menu de arriba; el resto se ve en el catalogo. */
const CATEGORIAS_EN_EL_MENU = 4;

/**
 * La tienda publica de cada empresa (lote 231: al estilo de Spree, pedido del
 * dueno el 2026-09-30). El menu se DERIVA de lo que hay: las categorias con
 * productos (las que mas tienen) y "Promociones" solo si hay alguna oferta.
 */
export default async function StorefrontLayout({
  children,
  params
}: {
  children: React.ReactNode,
  params: Promise<{ empresa: string }>
}) {
  const resolvedParams = await params;
  const empresaSlug = resolvedParams.empresa;

  const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
  if (!company) {
    notFound();
  }

  const [categories, resumen, portada] = await Promise.all([
    StorefrontProductService.getActiveCategories(company.id),
    StorefrontProductService.getResumenDelCatalogo(company.id),
    leerPortadaDeLaTienda(company.id),
  ]);
  const conProductos = categoriasConProductos(categories, resumen.porCategoria);

  const enlaces: EnlaceDelMenu[] = [
    { href: `/${empresaSlug}/productos`, etiqueta: 'Todos los productos' },
    ...conProductos.slice(0, CATEGORIAS_EN_EL_MENU).map((c) => ({
      href: `/${empresaSlug}/productos?categoria=${c.id}`,
      etiqueta: c.name,
    })),
    ...(resumen.ofertas > 0 ? [{ href: `/${empresaSlug}/promociones`, etiqueta: 'Promociones' }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900">
      {/* Lote 235: el anuncio de la empresa, si lo configuro. Va ENCIMA de la
          cabecera y no se queda pegado al bajar (la cabecera si). */}
      <BarraDeAnuncio portada={portada} nombre={company.name} />
      <CabeceraTienda empresaSlug={empresaSlug} nombre={company.name} logoUrl={company.logoUrl ?? null} enlaces={enlaces} />
      <main className="flex-grow">
        {children}
      </main>
      <PieTienda empresaSlug={empresaSlug} empresa={company} enlaces={enlaces} />
    </div>
  );
}
