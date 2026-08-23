import { StorefrontProductService } from '@/services/storefront/productService';
import { StorefrontCompanyService } from '@/services/storefront/companyService';
import Link from 'next/link';
import { Package, Search, Filter, ShoppingCart, Eye } from 'lucide-react';
import { Button } from '@/components/storefront/ui/client-button';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import CatalogAddButton from '@/components/storefront/CatalogAddButton';
import AnimateOnScroll from '@/components/storefront/AnimateOnScroll';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ empresa: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const company = await StorefrontCompanyService.resolveCompanyBySlug(resolvedParams.empresa);
  return {
    title: `Productos | ${company?.name || 'Tienda en Línea'}`,
  };
}

export default async function StorefrontProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<{ categoria?: string; q?: string }>;
}) {
  const resolvedParams = await params;
  const empresaSlug = resolvedParams.empresa;
  
  const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
  if (!company) notFound();

  const resolvedSearchParams = await searchParams;
  const categoryFilter = resolvedSearchParams.categoria;
  const searchQuery = resolvedSearchParams.q;

  // Ejecutamos consultas en paralelo
  const [categories, products] = await Promise.all([
    StorefrontProductService.getActiveCategories(company.id),
    StorefrontProductService.getActiveProducts(company.id, categoryFilter, searchQuery),
  ]);

  return (
    <main className="bg-slate-50 dark:bg-slate-900 min-h-screen py-10 transition-colors">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header y Buscador */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#001e40] dark:text-white">Catálogo de Productos</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Encuentra las mejores soluciones para tu espacio.</p>
          </div>
          <div className="flex w-full md:w-auto gap-2">
            <form action={`/${empresaSlug}/productos`} method="GET" className="relative flex-grow md:w-80">
              {categoryFilter && <input type="hidden" name="categoria" value={categoryFilter} />}
              <label htmlFor="search-products" className="sr-only">Buscar productos</label>
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              </div>
              <input
                id="search-products"
                name="q"
                type="search"
                placeholder="Buscar productos..."
                defaultValue={searchQuery}
                className="block w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md leading-5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#001e40] dark:focus:ring-[#c5a059] focus:border-transparent sm:text-sm transition-colors"
              />
            </form>
            <Button variant="outline" className="shrink-0 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#001e40] dark:focus-visible:ring-[#c5a059]" aria-haspopup="dialog" aria-expanded="false">
              <Filter className="h-4 w-4 mr-2" aria-hidden="true" />
              Filtros
            </Button>
          </div>
        </header>

        <section className="flex flex-col gap-8" aria-label="Catálogo">
          {/* Categorías Horizontal */}
          <nav aria-label="Categorías de productos" className="w-full overflow-x-auto pb-2 scrollbar-hide">
            <ul className="flex flex-nowrap md:flex-wrap items-center gap-2">
              <li>
                <Link
                  href={`/${empresaSlug}/productos`}
                  aria-current={!categoryFilter ? 'page' : undefined}
                  className={`inline-block py-2 px-4 rounded-full transition-colors whitespace-nowrap text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001e40] dark:focus-visible:ring-[#c5a059] ${
                    !categoryFilter 
                      ? 'bg-[#001e40] dark:bg-[#c5a059] text-white dark:text-slate-900 font-medium shadow-sm' 
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  Todas las Categorías
                </Link>
              </li>
              {categories.map((cat) => (
                <li key={cat.id}>
                  <Link
                    href={`/${empresaSlug}/productos?categoria=${cat.id}`}
                    aria-current={categoryFilter === cat.id ? 'page' : undefined}
                    className={`inline-block py-2 px-4 rounded-full transition-colors whitespace-nowrap text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001e40] dark:focus-visible:ring-[#c5a059] ${
                      categoryFilter === cat.id 
                        ? 'bg-[#001e40] dark:bg-[#c5a059] text-white dark:text-slate-900 font-medium shadow-sm' 
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Grid de Productos */}
          <div className="flex-grow">
            {products.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center transition-colors">
                <Package className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" aria-hidden="true" />
                <h3 className="text-lg font-medium text-[#001e40] dark:text-white mb-1">No se encontraron productos</h3>
                <p className="text-slate-500 dark:text-slate-400">Intenta ajustando los filtros o tu búsqueda.</p>
                <Link href={`/${empresaSlug}/productos`}>
                  <Button className="mt-4 bg-[#001e40] dark:bg-[#c5a059] hover:bg-[#00142a] dark:hover:bg-[#b08c4a] text-white dark:text-slate-900 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#001e40] dark:focus-visible:ring-[#c5a059]">Ver todo el catálogo</Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {products.map((product, index) => (
                  <AnimateOnScroll key={product.id} index={index}>
                    <article className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden group flex flex-col h-full transition duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-[#c5a059]/40 dark:hover:border-[#c5a059]/60 relative z-10 hover:z-20 focus-within:ring-2 focus-within:ring-[#001e40] dark:focus-within:ring-[#c5a059]">
                      <div className="relative aspect-[4/3] bg-slate-100 dark:bg-slate-900 flex items-center justify-center overflow-hidden shrink-0">
                        {product.isOnSale && (
                          <div className="absolute top-2 left-2 z-20 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-sm shadow-md" aria-label="Producto en oferta">
                            OFERTA
                          </div>
                        )}
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={`Imagen de ${product.name}`}
                            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <Package className="h-12 w-12 text-slate-300 dark:text-slate-700" aria-hidden="true" />
                        )}
                        {/* Hover Actions */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                          <Link href={`/${empresaSlug}/productos/${product.slug}`} aria-label={`Ver detalles de ${product.name}`} className="focus:outline-none">
                            <Button size="icon" variant="secondary" className="bg-white text-[#001e40] hover:bg-slate-100 rounded-full h-10 w-10 hover:scale-110 transition-transform" tabIndex={-1} aria-hidden="true">
                              <Eye className="h-5 w-5" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                      <div className="p-5 flex flex-col flex-grow">
                        <div className="mb-1 text-xs font-semibold text-[#c5a059] uppercase tracking-wider shrink-0">
                          {product.categoryName || 'Sin categoría'}
                        </div>
                        <h3 className="font-bold text-lg text-[#001e40] dark:text-white mb-2 line-clamp-1 group-hover:text-[#c5a059] transition-colors shrink-0" title={product.name}>
                          {/* Agregando Link en el titulo para accesibilidad */}
                          <Link href={`/${empresaSlug}/productos/${product.slug}`} className="focus:outline-none before:absolute before:inset-0">
                            {product.name}
                          </Link>
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-4 flex-grow">
                          {product.description || 'Producto sin descripción.'}
                        </p>
                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-50 dark:border-slate-700/50 group-hover:border-slate-100 dark:group-hover:border-slate-600 transition-colors shrink-0 relative z-30">
                          <div className="flex flex-col">
                            {product.isOnSale ? (
                              <>
                                <span className="text-xs text-slate-400 dark:text-slate-500 line-through mb-0.5" aria-label="Precio original">
                                  RD$ {product.price.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                                </span>
                                <span className="font-extrabold text-xl text-red-600 dark:text-red-500 leading-none" aria-label="Precio de oferta">
                                  RD$ {product.promotionalPrice.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                                </span>
                              </>
                            ) : (
                              <span className="font-bold text-xl text-[#001e40] dark:text-white leading-none">
                                RD$ {product.price.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">+ ITBIS</span>
                          </div>
                          <CatalogAddButton 
                            productId={product.id}
                            name={product.name}
                            price={product.isOnSale ? Number(product.promotionalPrice) : Number(product.price)}
                            imageUrl={product.imageUrl}
                          />
                        </div>
                      </div>
                    </article>
                  </AnimateOnScroll>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
