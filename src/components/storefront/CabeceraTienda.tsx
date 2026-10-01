'use client';

/**
 * La cabecera de la tienda, al estilo de Spree (lote 231): logo centrado,
 * "Buscar" a la izquierda, cuenta / favoritos / cotizacion a la derecha y el
 * menu en mayusculas espaciadas debajo. En movil el menu va en un cajon.
 *
 * El menu NO se escribe aqui: llega del layout, que solo ofrece categorias con
 * productos y "Promociones" si hay ofertas (`getResumenDelCatalogo`). Antes la
 * portada enlazaba a cuatro categorias escritas a mano (Puertas, Ventanas,
 * Closets, Gabinetes) con identificadores que no eran de ninguna categoria.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Search, Menu, X, Heart, ShoppingBag } from 'lucide-react';
import clsx from 'clsx';
import CartBadgeClient from './CartBadgeClient';
import HeaderAuthClient from './HeaderAuthClient';
import { useFavoritos } from './useFavoritos';

export type EnlaceDelMenu = { href: string; etiqueta: string };

const icono = 'relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full text-slate-900 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001e40]';

/**
 * Los enlaces del menu, con el de la pagina actual subrayado: misma ruta y
 * misma categoria (sin mirar la categoria, en "Ventanas" seguia subrayado
 * "Todos los productos"; visto al dibujarlo).
 *
 * Es lo UNICO de la cabecera que lee la direccion (`useSearchParams`), y va en
 * su propio `<Suspense>`: sin el, Next pinta TODA la tienda en el navegador en
 * vez de en el servidor (React Doctor lo marco en el lote 231). Mientras se
 * resuelve, los mismos enlaces sin subrayar.
 */
type PropsDeEnlaces = { enlaces: EnlaceDelMenu[]; claseLista: string; claseEnlace: (activo: boolean) => string; alPulsar?: () => void };

function Enlaces({ enlaces, claseLista, claseEnlace, alPulsar, activo }: PropsDeEnlaces & { activo: (href: string) => boolean }) {
  return (
    <ul className={claseLista}>
      {enlaces.map((e) => (
        <li key={e.href}>
          <Link href={e.href} onClick={alPulsar} aria-current={activo(e.href) ? 'page' : undefined} className={claseEnlace(activo(e.href))}>
            {e.etiqueta}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EnlacesConActivo(props: PropsDeEnlaces) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activo = (href: string) => {
    const [ruta, consulta] = href.split('?');
    if (pathname !== ruta) return false;
    return (new URLSearchParams(consulta).get('categoria') ?? null) === (searchParams.get('categoria') ?? null);
  };
  return <Enlaces {...props} activo={activo} />;
}

function MenuDeEnlaces(props: PropsDeEnlaces) {
  return (
    <Suspense fallback={<Enlaces {...props} activo={() => false} />}>
      <EnlacesConActivo {...props} />
    </Suspense>
  );
}

function Favoritos({ empresaSlug }: { empresaSlug: string }) {
  const { lista, listo } = useFavoritos(empresaSlug);
  const n = listo ? lista.length : 0;
  return (
    <Link href={`/${empresaSlug}/favoritos`} className={icono} aria-label={n > 0 ? `Favoritos (${n})` : 'Favoritos'}>
      <Heart className="h-5 w-5" strokeWidth={1.5} />
      {n > 0 && (
        <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#001e40] px-1 text-[10px] font-bold text-white" aria-hidden="true">
          {n > 99 ? '99+' : n}
        </span>
      )}
    </Link>
  );
}

export default function CabeceraTienda({ empresaSlug, nombre, logoUrl, enlaces }: {
  empresaSlug: string; nombre: string; logoUrl: string | null; enlaces: EnlaceDelMenu[];
}) {
  const pathname = usePathname();
  const [buscando, setBuscando] = useState(false);
  const [cajon, setCajon] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  //  Al navegar se cierran el buscador y el cajon: si no, el cajon del movil se
  //  quedaria abierto tapando la pagina a la que se acaba de ir. Cambiar de
  //  categoria no cambia la ruta (solo `?categoria=`), asi que los enlaces del
  //  cajon ademas lo cierran al pulsarlos.
  const [rutaVista, setRutaVista] = useState(pathname);
  if (rutaVista !== pathname) { setRutaVista(pathname); setBuscando(false); setCajon(false); }

  useEffect(() => { if (buscando) campo.current?.focus(); }, [buscando]);

  //  Escape cierra lo que este abierto. Solo se escucha mientras hay algo abierto.
  useEffect(() => {
    if (!buscando && !cajon) return;
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') { setBuscando(false); setCajon(false); } };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [buscando, cajon]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10">
        <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center md:h-20">
          <div className="flex items-center">
            <button type="button" onClick={() => setCajon((v) => !v)} className={clsx(icono, 'md:hidden')}
              aria-expanded={cajon} aria-controls="menu-tienda-movil" aria-label={cajon ? 'Cerrar menú' : 'Abrir menú'}>
              {cajon ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <button type="button" onClick={() => setBuscando((v) => !v)} aria-expanded={buscando} aria-controls="buscador-tienda"
              className="hidden items-center gap-2 text-sm uppercase tracking-[0.15em] text-slate-900 hover:opacity-70 md:flex">
              <Search className="h-5 w-5" strokeWidth={1.5} />
              Buscar
            </button>
          </div>

          <Link href={`/${empresaSlug}`} className="flex items-center justify-center px-2 hover:opacity-80">
            {logoUrl ? (
              <img src={logoUrl} alt={nombre} className="h-10 w-auto max-w-[220px] object-contain md:h-12" />
            ) : (
              <span className="max-w-[60vw] truncate text-center text-lg font-semibold uppercase tracking-[0.2em] text-slate-900 md:text-xl">{nombre}</span>
            )}
          </Link>

          <div className="flex items-center justify-end gap-0.5">
            <button type="button" onClick={() => setBuscando((v) => !v)} className={clsx(icono, 'md:hidden')} aria-label="Buscar productos">
              <Search className="h-5 w-5" strokeWidth={1.5} />
            </button>
            <HeaderAuthClient empresaSlug={empresaSlug} />
            <Favoritos empresaSlug={empresaSlug} />
            <Link href={`/${empresaSlug}/mi-cotizacion`} className={icono} aria-label="Mi cotización">
              <ShoppingBag className="h-5 w-5" strokeWidth={1.5} />
              <CartBadgeClient />
            </Link>
          </div>
        </div>

        <nav aria-label="Catálogo" className="hidden justify-center pb-4 md:flex">
          <MenuDeEnlaces enlaces={enlaces} claseLista="flex flex-wrap items-center justify-center gap-x-10 gap-y-2"
            claseEnlace={(a) => clsx('text-[13px] uppercase tracking-[0.18em] text-slate-900 underline-offset-8 hover:underline', a && 'underline')} />
        </nav>
      </div>

      {buscando && (
        <div id="buscador-tienda" className="border-t border-slate-200 bg-white">
          <form action={`/${empresaSlug}/productos`} method="GET" role="search" className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
            <label htmlFor="buscar-en-tienda" className="sr-only">Buscar productos</label>
            <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
            <input ref={campo} id="buscar-en-tienda" name="q" type="search" placeholder="¿Qué estás buscando?"
              className="w-full border-0 border-b border-slate-300 bg-transparent py-2 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-900" />
            <button type="submit" className="rounded-full bg-[#001e40] px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-[#00142a]">
              Buscar
            </button>
          </form>
        </div>
      )}

      {cajon && (
        <nav id="menu-tienda-movil" aria-label="Catálogo" className="border-t border-slate-200 bg-white md:hidden">
          <MenuDeEnlaces enlaces={enlaces} claseLista="flex flex-col px-4 py-2" alPulsar={() => setCajon(false)}
            claseEnlace={(a) => clsx('block border-b border-slate-100 py-3 text-sm uppercase tracking-[0.15em] text-slate-900', a && 'font-semibold')} />
        </nav>
      )}
    </header>
  );
}
