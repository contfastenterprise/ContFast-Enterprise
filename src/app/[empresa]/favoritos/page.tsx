import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StorefrontCompanyService } from '@/services/storefront/companyService';
import { StorefrontProductService } from '@/services/storefront/productService';
import ListaDeFavoritos from '@/components/storefront/ListaDeFavoritos';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ empresa: string }> }): Promise<Metadata> {
  const { empresa } = await params;
  const company = await StorefrontCompanyService.resolveCompanyBySlug(empresa);
  //  Lo que guarda cada visitante no se indexa.
  return { title: `Favoritos | ${company?.name || 'Tienda en Línea'}`, robots: { index: false } };
}

/** Los favoritos del visitante (lote 231): se guardan en su navegador. */
export default async function FavoritosPage({ params }: { params: Promise<{ empresa: string }> }) {
  const { empresa: empresaSlug } = await params;
  const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
  if (!company) notFound();

  const productos = await StorefrontProductService.getActiveProducts(company.id);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 pt-12 sm:px-6 lg:px-10">
      <h1 className="text-3xl font-medium uppercase tracking-[0.12em] text-slate-900">Favoritos</h1>
      <p className="mt-2 text-sm text-slate-500">Se guardan en este navegador; en otro dispositivo empiezas sin favoritos.</p>
      <div className="mt-8 border-t border-slate-200 pt-10">
        <ListaDeFavoritos empresaSlug={empresaSlug} productos={productos} />
      </div>
    </div>
  );
}
