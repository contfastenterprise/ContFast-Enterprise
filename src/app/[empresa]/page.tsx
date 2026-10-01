import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StorefrontCompanyService } from '@/services/storefront/companyService';
import { StorefrontProductService } from '@/services/storefront/productService';
import { categoriasConProductos, contarPorCategoria, ordenarProductos } from '@/services/storefront/catalogo';
import { leerPortadaDeLaTienda } from '@/services/storefront/portadaRepositorio';
import { PortadaTienda } from '@/components/storefront/PortadaTienda';
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
 * sale de lo que la empresa tiene. Desde el lote 235 el titulo, el texto y la
 * imagen son de cada empresa (Configuracion > Tienda); sin configurar, lo de
 * siempre: "Bienvenido a <empresa>", el texto neutro y el logo.
 */
export default async function StorefrontHomePage({ params }: { params: Promise<{ empresa: string }> }) {
  const { empresa: empresaSlug } = await params;
  const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
  if (!company) notFound();

  const [categorias, productos, portada] = await Promise.all([
    StorefrontProductService.getActiveCategories(company.id),
    StorefrontProductService.getActiveProducts(company.id),
    leerPortadaDeLaTienda(company.id),
  ]);
  const conProductos = categoriasConProductos(categorias, contarPorCategoria(productos));
  const muestra = ordenarProductos(productos, 'relevancia').slice(0, PRODUCTOS_EN_PORTADA);

  return (
    <div>
      <PortadaTienda empresaSlug={empresaSlug} nombre={company.name} logoUrl={company.logoUrl ?? null} portada={portada} />

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
