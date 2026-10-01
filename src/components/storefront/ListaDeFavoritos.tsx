'use client';

/**
 * La pagina de favoritos (lote 231). Los favoritos viven en el navegador, asi
 * que el servidor manda el catalogo activo y aqui se ensenan los guardados.
 *
 * Hasta haber leido el navegador NO se dice "no tienes favoritos": se lo
 * diria un instante a quien si los tiene. Y lo guardado cuyo producto ya no
 * esta activo simplemente no sale (no se borra: si vuelve, vuelve con el).
 */
import Link from 'next/link';
import type { StorefrontProduct } from '@/services/storefront/productService';
import { esFavorito } from '@/services/storefront/favoritos';
import { useFavoritos } from './useFavoritos';
import TarjetaProducto from './TarjetaProducto';

export default function ListaDeFavoritos({ empresaSlug, productos }: { empresaSlug: string; productos: StorefrontProduct[] }) {
  const { lista, listo } = useFavoritos(empresaSlug);
  if (!listo) return <div className="py-20" aria-busy="true" />;

  //  En el orden en que se guardaron, el mas reciente primero.
  const guardados = [...lista].reverse()
    .map((id) => productos.find((p) => esFavorito([id], p.id)))
    .filter((p): p is StorefrontProduct => !!p);

  if (guardados.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg text-slate-900">Aún no tienes favoritos</p>
        <p className="mt-2 text-sm text-slate-500">Pulsa el corazón de un producto para guardarlo aquí.</p>
        <Link href={`/${empresaSlug}/productos`}
          className="mt-8 inline-block rounded-full bg-[#001e40] px-8 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-white hover:bg-[#00142a]">
          Ver productos
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:gap-x-6 lg:grid-cols-4">
      {guardados.map((p) => <TarjetaProducto key={p.id} producto={p} empresaSlug={empresaSlug} />)}
    </div>
  );
}
