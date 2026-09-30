import { StorefrontProductService } from '@/services/storefront/productService';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Check, ShieldCheck, Clock } from 'lucide-react';
import AddToCartClient from '@/components/storefront/AddToCartClient';
import ProductRecommendations from '@/components/storefront/ProductRecommendations';
import BotonFavorito from '@/components/storefront/BotonFavorito';
import { MarcadorDeProducto, PrecioDeTienda } from '@/components/storefront/TarjetaProducto';
import { precioVigente, tieneOferta } from '@/services/storefront/catalogo';
import { StorefrontCompanyService } from '@/services/storefront/companyService';
import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ empresa: string; slug: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const company = await StorefrontCompanyService.resolveCompanyBySlug(resolvedParams.empresa);
  if (!company) return { title: 'Producto no encontrado' };
  const product = await StorefrontProductService.getProductBySlug(resolvedParams.slug, company.id);

  if (!product) return { title: 'Producto no encontrado' };

  return {
    title: `${product.name} | ${company?.name || 'Tienda en Línea'}`,
    description: product.description || `Comprar ${product.name}`,
  };
}

/**
 * La ficha de producto, al estilo de Spree (lote 231): la foto grande sobre
 * gris a la izquierda; a la derecha el nombre en mayusculas, el precio, la
 * cantidad, el boton redondeado con el corazon al lado y la descripcion.
 */
export default async function StorefrontProductDetailPage({
  params
}: {
  params: Promise<{ empresa: string; slug: string }>
}) {
  const resolvedParams = await params;
  const empresaSlug = resolvedParams.empresa;

  const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
  if (!company) {
    notFound();
  }

  const product = await StorefrontProductService.getProductBySlug(resolvedParams.slug, company.id);

  if (!product) {
    notFound();
  }

  const { id, name, description, imageUrl, categoryName, categoryId } = product;

  const recommended = await StorefrontProductService.getRecommendations(company.id, 4, id, categoryId || undefined);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 pt-8 sm:px-6 lg:px-10">
      <nav aria-label="Ruta" className="mb-8 text-xs uppercase tracking-[0.15em] text-slate-500">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href={`/${empresaSlug}/productos`} className="hover:text-slate-900">Productos</Link></li>
          {categoryName && categoryId && (
            <>
              <li aria-hidden="true">/</li>
              <li><Link href={`/${empresaSlug}/productos?categoria=${categoryId}`} className="hover:text-slate-900">{categoryName}</Link></li>
            </>
          )}
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-slate-900">{name}</li>
        </ol>
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <div className="relative aspect-square overflow-hidden bg-[#f4f4f3]">
          {tieneOferta(product) && (
            <span className="absolute left-4 top-4 z-10 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
              Oferta
            </span>
          )}
          {imageUrl ? (
            <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <MarcadorDeProducto nombre={name} categoria={categoryName} grande />
          )}
        </div>

        <div className="flex flex-col">
          {categoryName && <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{categoryName}</p>}
          <h1 className="mt-2 text-2xl font-medium uppercase tracking-[0.08em] text-slate-900 md:text-3xl">{name}</h1>

          <div className="mt-5">
            <PrecioDeTienda producto={product} grande />
            <p className="mt-1 text-sm text-slate-500">Precio sugerido al detalle. No incluye impuestos.</p>
          </div>

          <div className="mt-8">
            <AddToCartClient productId={id} name={name} price={precioVigente(product)} imageUrl={imageUrl}>
              <BotonFavorito empresaSlug={empresaSlug} productId={id} nombre={name} grande />
            </AddToCartClient>
          </div>

          <div className="mt-10 border-t border-slate-200 pt-8">
            <p className="text-[15px] leading-relaxed text-slate-700">
              {description || 'Este producto no tiene una descripción detallada en este momento.'}
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-slate-600">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-slate-900" aria-hidden="true" />Disponibilidad sujeta a verificación de inventario</li>
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-slate-900" aria-hidden="true" />Garantía de fabricación estándar</li>
              <li className="flex items-center gap-2"><Clock className="h-4 w-4 shrink-0 text-slate-900" aria-hidden="true" />Tiempo de entrega a confirmar en la cotización</li>
            </ul>
          </div>
        </div>
      </div>

      <ProductRecommendations products={recommended} empresaSlug={empresaSlug} />
    </div>
  );
}
