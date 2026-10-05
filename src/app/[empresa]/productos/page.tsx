import { StorefrontProductService } from '@/services/storefront/productService';
import { StorefrontCompanyService } from '@/services/storefront/companyService';
import clsx from 'clsx';
import { SlidersHorizontal } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { categoriasConProductos, leerOrden, ordenarProductos } from '@/services/storefront/catalogo';
import { RejillaDeProductos } from '@/components/storefront/TarjetaProducto';
import { ListaDeFiltros, MenuDeOrden } from '@/components/storefront/FiltrosCatalogo';
import { EnlaceTienda } from '@/components/storefront/BotonTienda';
import { FOCO_TIENDA } from '@/components/storefront/botonTiendaVariantes';
import EstadoVacio from '@/components/storefront/EstadoVacio';
import TituloDeSeccion from '@/components/storefront/TituloDeSeccion';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ empresa: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const company = await StorefrontCompanyService.resolveCompanyBySlug(resolvedParams.empresa);
  return {
    title: `Productos | ${company?.name || 'Tienda en Línea'}`,
  };
}

/**
 * El catalogo, al estilo de Spree (lote 231): titulo arriba, "Ordenar por" a la
 * derecha, los filtros en una barra lateral (en movil, detras de "Filtrar") y la
 * rejilla de productos. Antes el boton "Filtros" no hacia nada y no se podia
 * ordenar.
 */
export default async function StorefrontProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<{ categoria?: string; q?: string; orden?: string }>;
}) {
  const { empresa: empresaSlug } = await params;

  const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
  if (!company) notFound();

  const sp = await searchParams;
  const actual = { categoria: sp.categoria || undefined, q: sp.q?.trim() || undefined, orden: leerOrden(sp.orden) };

  const [categories, products, resumen] = await Promise.all([
    StorefrontProductService.getActiveCategories(company.id),
    StorefrontProductService.getActiveProducts(company.id, actual.categoria, actual.q),
    StorefrontProductService.getResumenDelCatalogo(company.id),
  ]);
  const conProductos = categoriasConProductos(categories, resumen.porCategoria);
  const ordenados = ordenarProductos(products, actual.orden);
  const categoria = categories.find((c) => c.id === actual.categoria);
  const titulo = categoria?.name ?? 'Todos los productos';

  //  Los <details> (Filtrar y Ordenar) se quedaban ABIERTOS tras elegir: la
  //  navegacion conserva el elemento. Con esta clave se montan de nuevo, cerrados.
  const clave = `${actual.categoria ?? ''}|${actual.q ?? ''}|${actual.orden}`;
  const filtros = <ListaDeFiltros empresaSlug={empresaSlug} categorias={conProductos} total={resumen.total} actual={actual} />;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 pt-12 sm:px-6 lg:px-10">
      <TituloDeSeccion titulo={titulo} descripcion={actual.q && <>Resultados para “{actual.q}”</>} />

      <div className="relative mt-8 flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <details key={`filtrar-${clave}`} className="lg:hidden">
          <summary className={clsx('flex cursor-pointer list-none items-center gap-2 rounded-sm text-sm font-semibold uppercase tracking-[0.15em] text-slate-900 [&::-webkit-details-marker]:hidden', FOCO_TIENDA)}>
            <SlidersHorizontal className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            Filtrar
          </summary>
          {/* Panel de ancho completo bajo la barra: dentro del flujo, la lista
              quedaba estrecha y empujaba "Ordenar por" (visto al dibujarlo). */}
          <div className="absolute inset-x-0 top-full z-40 border-b border-slate-200 bg-white px-1 py-6 shadow-lg">{filtros}</div>
        </details>
        <p className="hidden text-sm text-slate-500 lg:block">
          {ordenados.length} {ordenados.length === 1 ? 'producto' : 'productos'}
        </p>
        <MenuDeOrden key={`orden-${clave}`} empresaSlug={empresaSlug} actual={actual} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
        <aside aria-label="Filtros" className="hidden lg:block">
          <div className="sticky top-40">{filtros}</div>
        </aside>

        <section aria-label="Productos">
          {ordenados.length === 0 ? (
            <EstadoVacio titulo="No se encontraron productos" texto="Prueba con otra categoría o con otra búsqueda.">
              <EnlaceTienda href={`/${empresaSlug}/productos`}>Ver todo el catálogo</EnlaceTienda>
            </EstadoVacio>
          ) : (
            <RejillaDeProductos productos={ordenados} empresaSlug={empresaSlug} columnas={3} />
          )}
        </section>
      </div>
    </div>
  );
}
