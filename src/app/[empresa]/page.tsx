import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StorefrontCompanyService } from '@/services/storefront/companyService';
import { StorefrontProductService } from '@/services/storefront/productService';
import { categoriasConProductos, contarPorCategoria, inicialesDe, ordenarProductos } from '@/services/storefront/catalogo';
import { RejillaDeProductos } from '@/components/storefront/TarjetaProducto';

export const dynamic = 'force-dynamic';

/** Cuantos productos ensena la portada; el resto, en el catalogo. */
const PRODUCTOS_EN_PORTADA = 8;

/**
 * La portada de la tienda, al estilo de Spree (lote 231): el bloque partido
 * (texto a la izquierda, imagen a la derecha), las categorias y una muestra
 * del catalogo.
 *
 * Antes la portada decia "Fabricamos soluciones para tu espacio" y ofrecia
 * Puertas, Ventanas, Closets y Gabinetes en las SEIS empresas, escrito a mano
 * y con enlaces a identificadores que no eran de ninguna categoria. Ahora todo
 * sale de lo que la empresa tiene. El titulo, el texto y la imagen propios de
 * cada empresa llegan en el lote siguiente; mientras, el bloque lleva el logo.
 */
export default async function StorefrontHomePage({ params }: { params: Promise<{ empresa: string }> }) {
  const { empresa: empresaSlug } = await params;
  const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
  if (!company) notFound();

  const [categorias, productos] = await Promise.all([
    StorefrontProductService.getActiveCategories(company.id),
    StorefrontProductService.getActiveProducts(company.id),
  ]);
  const conProductos = categoriasConProductos(categorias, contarPorCategoria(productos));
  const muestra = ordenarProductos(productos, 'relevancia').slice(0, PRODUCTOS_EN_PORTADA);

  return (
    <div>
      {/* Portada partida, como la de Spree */}
      <section className="grid min-h-[70vh] grid-cols-1 lg:grid-cols-2">
        <div className="flex items-center px-6 py-16 sm:px-10 lg:px-16 xl:px-24">
          <div className="max-w-xl">
            <h1 className="text-4xl font-medium leading-tight tracking-tight text-slate-900 md:text-5xl">
              Bienvenido a {company.name}
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-slate-600">
              Explora nuestro catálogo, arma tu selección y solicita tu cotización en línea. Te respondemos con precios y tiempos de entrega.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href={`/${empresaSlug}/productos`}
                className="rounded-full bg-[#001e40] px-8 py-3.5 text-sm font-semibold uppercase tracking-[0.15em] text-white transition-colors hover:bg-[#00142a]">
                Ver productos
              </Link>
              <Link href={`/${empresaSlug}/mi-cotizacion`}
                className="rounded-full border border-slate-900 px-8 py-3.5 text-sm font-semibold uppercase tracking-[0.15em] text-slate-900 transition-colors hover:bg-slate-900 hover:text-white">
                Mi cotización
              </Link>
            </div>
          </div>
        </div>
        <div className="flex min-h-[320px] items-center justify-center bg-[#f4f4f3] p-12">
          {company.logoUrl ? (
            //  `mix-blend-multiply`: los logos suelen traer fondo blanco, y sobre el
            //  gris quedaba un rectangulo blanco (visto al dibujarlo, lote 231).
            <img src={company.logoUrl} alt="" className="max-h-64 w-auto max-w-[70%] object-contain mix-blend-multiply" />
          ) : (
            <span className="text-8xl font-light tracking-[0.2em] text-slate-300" aria-hidden="true">{inicialesDe(company.name)}</span>
          )}
        </div>
      </section>

      {conProductos.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6 lg:px-10">
          <h2 className="mb-10 text-center text-2xl font-medium uppercase tracking-[0.15em] text-slate-900">Compra por categoría</h2>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
            {conProductos.slice(0, 8).map((c) => (
              <li key={c.id}>
                {/* Sin fotos de categoria, el nombre va DENTRO de la tarjeta: una
                    inicial suelta en un cuadrado grande no decia nada (visto al
                    dibujarlo). */}
                <Link href={`/${empresaSlug}/productos?categoria=${c.id}`}
                  className="group flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-[#f4f4f3] px-4 text-center transition-colors hover:bg-[#ebebea]">
                  <span className="text-lg uppercase tracking-[0.15em] text-slate-900 underline-offset-8 group-hover:underline">{c.name}</span>
                  <span className="text-sm text-slate-500">{c.cantidad} {c.cantidad === 1 ? 'producto' : 'productos'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {muestra.length > 0 && (
        <section className="border-t border-slate-200">
          <div className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6 lg:px-10">
            <div className="mb-10 flex items-end justify-between gap-4">
              <h2 className="text-2xl font-medium uppercase tracking-[0.15em] text-slate-900">Nuestros productos</h2>
              <Link href={`/${empresaSlug}/productos`} className="text-sm uppercase tracking-[0.15em] text-slate-900 underline underline-offset-8 hover:opacity-70">
                Ver todos
              </Link>
            </div>
            <RejillaDeProductos productos={muestra} empresaSlug={empresaSlug} />
          </div>
        </section>
      )}
    </div>
  );
}
