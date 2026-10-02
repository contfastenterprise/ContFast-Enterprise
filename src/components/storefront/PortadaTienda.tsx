/**
 * La portada de la tienda y su barra de anuncio (lote 235), configurables por
 * empresa en Configuracion. Solo PINTAN: lo que se ensena lo decide
 * `portadaParaMostrar` (lo configurado, y lo de siempre donde falte), asi que
 * el banco los dibuja sin base ni red.
 *
 * La portada partida es la del lote 231 (texto a la izquierda, imagen a la
 * derecha). Con imagen propia, se ve ENTERA en su mitad (lote 237: sin
 * recortar, sobre el gris); sin ella, el logo sobre gris (o las iniciales si
 * tampoco hay logo).
 */
import Link from 'next/link';
import { inicialesDe } from '@/services/storefront/catalogo';
import { FOTO_ENTERA } from '@/utils/fotoEntera';
import { portadaParaMostrar, type PortadaGuardada } from '@/services/storefront/portada';

/** La barra fina de arriba. Sin anuncio configurado, no hay barra. */
export function BarraDeAnuncio({ portada, nombre }: { portada: PortadaGuardada | null; nombre: string }) {
  const { anuncio } = portadaParaMostrar(portada, nombre);
  if (!anuncio) return null;
  return (
    <p role="note" className="bg-[#f4f4f3] px-4 py-2 text-center text-[13px] tracking-[0.08em] text-slate-900 print:hidden">
      {anuncio}
    </p>
  );
}

export function PortadaTienda({ empresaSlug, nombre, logoUrl, portada }: {
  empresaSlug: string; nombre: string; logoUrl: string | null; portada: PortadaGuardada | null;
}) {
  const p = portadaParaMostrar(portada, nombre);
  return (
    <section className="grid min-h-[70vh] grid-cols-1 lg:grid-cols-2">
      <div className="flex items-center px-6 py-16 sm:px-10 lg:px-16 xl:px-24">
        <div className="max-w-xl">
          <h1 className="text-4xl font-medium leading-tight tracking-tight text-slate-900 md:text-5xl">{p.titulo}</h1>
          {/* `whitespace-pre-line`: el texto admite parrafos, y se respetan. */}
          <p className="mt-6 whitespace-pre-line text-lg leading-relaxed text-slate-600">{p.texto}</p>
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
      {p.imagenUrl ? (
        //  El MARCO de la imagen (pedido del dueño, lote 237): "si es muy grande no puede
        //  sobrepasar los bordes". La imagen vive dentro de un espacio fijo, con margen a los
        //  cuatro lados, y `overflow-hidden` corta lo que por lo que sea se saliera. Mida lo
        //  que mida, se ajusta ENTERA a ese espacio: ni toca la cabecera ni el borde de la pagina.
        <div className="relative min-h-[320px] overflow-hidden bg-[#f4f4f3]">
          <div className="absolute inset-6 sm:inset-10 lg:inset-14">
            {/* Decorativa: lo que dice la portada ya lo dicen el titulo y el texto. */}
            <img src={p.imagenUrl} alt="" className={FOTO_ENTERA} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-[320px] items-center justify-center bg-[#f4f4f3] p-12">
          {logoUrl ? (
            //  `mix-blend-multiply`: los logos suelen traer fondo blanco, y sobre el
            //  gris quedaba un rectangulo blanco (visto al dibujarlo, lote 231).
            <img src={logoUrl} alt="" className="max-h-64 w-auto max-w-[70%] object-contain mix-blend-multiply" />
          ) : (
            <span className="text-8xl font-light tracking-[0.2em] text-slate-300" aria-hidden="true">{inicialesDe(nombre)}</span>
          )}
        </div>
      )}
    </section>
  );
}
