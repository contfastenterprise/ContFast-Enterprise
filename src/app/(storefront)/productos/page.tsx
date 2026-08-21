import { StorefrontProductService } from '@/services/storefront/productService';
import Link from 'next/link';
import { Package, Search, Filter, ShoppingCart, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function StorefrontProductsPage({
  searchParams,
}: {
  searchParams: { categoria?: string; q?: string };
}) {
  const categoryFilter = searchParams.categoria;
  const searchQuery = searchParams.q;

  // Ejecutamos consultas en paralelo
  const [categories, products] = await Promise.all([
    StorefrontProductService.getActiveCategories(),
    StorefrontProductService.getActiveProducts(categoryFilter, searchQuery),
  ]);

  return (
    <div className="bg-slate-50 min-h-screen py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header y Buscador */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#001e40]">Catálogo de Productos</h1>
            <p className="text-slate-500 mt-1">Encuentra las mejores soluciones para tu espacio.</p>
          </div>
          <div className="flex w-full md:w-auto gap-2">
            <div className="relative flex-grow md:w-80">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar productos..."
                defaultValue={searchQuery}
                className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#001e40] focus:border-[#001e40] sm:text-sm"
              />
            </div>
            <Button variant="outline" className="shrink-0 bg-white border-slate-300 text-slate-700">
              <Filter className="h-4 w-4 mr-2" />
              Filtros
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar de Categorías */}
          <aside className="w-full md:w-64 shrink-0">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm sticky top-24">
              <h2 className="font-bold text-[#001e40] mb-4 uppercase text-sm tracking-wider">Categorías</h2>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/productos"
                    className={`block py-2 px-3 rounded-md transition-colors ${
                      !categoryFilter ? 'bg-[#001e40]/5 text-[#001e40] font-medium' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Todas
                  </Link>
                </li>
                {categories.map((cat) => (
                  <li key={cat.id}>
                    <Link
                      href={`/productos?categoria=${cat.id}`}
                      className={`block py-2 px-3 rounded-md transition-colors ${
                        categoryFilter === cat.id ? 'bg-[#001e40]/5 text-[#001e40] font-medium' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {cat.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Grid de Productos */}
          <div className="flex-grow">
            {products.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <Package className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-[#001e40] mb-1">No se encontraron productos</h3>
                <p className="text-slate-500">Intenta ajustando los filtros o tu búsqueda.</p>
                <Link href="/productos">
                  <Button className="mt-4 bg-[#001e40] hover:bg-[#00142a] text-white">Ver todo el catálogo</Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {products.map((product) => (
                  <div key={product.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group flex flex-col transition-all hover:shadow-md hover:border-slate-300">
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
                        <Link href={`/productos/${product.slug}`}>
                          <Button size="icon" variant="secondary" className="bg-white text-[#001e40] hover:bg-slate-100 rounded-full h-10 w-10">
                            <Eye className="h-5 w-5" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                    <div className="p-5 flex flex-col flex-grow">
                      <div className="mb-1 text-xs font-semibold text-[#c5a059] uppercase tracking-wider">
                        {product.categoryName || 'Sin categoría'}
                      </div>
                      <h3 className="font-bold text-lg text-[#001e40] mb-2 line-clamp-1" title={product.name}>
                        {product.name}
                      </h3>
                      <p className="text-sm text-slate-500 line-clamp-2 mb-4 flex-grow">
                        {product.description || 'Producto sin descripción.'}
                      </p>
                      <div className="flex items-center justify-between mt-auto">
                        <span className="font-bold text-xl text-[#001e40]">
                          RD$ {product.price.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </span>
                        <Button size="sm" className="bg-[#c5a059] hover:bg-[#b08c4a] text-slate-950 font-semibold px-4 rounded-full">
                          Cotizar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
