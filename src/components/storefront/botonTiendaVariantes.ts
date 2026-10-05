import { cva, type VariantProps } from 'class-variance-authority';

/**
 * Los botones de la TIENDA PUBLICA (lote 282). La tienda conserva su estetica (la del lote 231,
 * al estilo de Spree: redondeados, en mayusculas espaciadas, azul #001e40) y NO usa el `Button` del
 * panel, que es `h-9 rounded-lg` azul marino: lo ve el cliente final y el dueño la quiso asi.
 *
 * Lo que se trae del panel es el SISTEMA: hasta este lote el primario estaba copiado a mano letra
 * por letra en seis sitios (los cuatro estados vacios, la portada, la cotizacion), el de contorno en
 * tres y el enlace subrayado en tres. Las variantes son ESAS clases, para que pasar un sitio al
 * componente no cambie lo que se ve:
 *
 *  · `primario`  — `rounded-full bg-[#001e40] … uppercase tracking-[0.15em] text-white`.
 *  · `contorno`  — borde `slate-900` que se rellena al pasar (portada, cotizacion, "Cotizar").
 *  · `enlace`    — texto subrayado en mayusculas ("Ver todos", "Ver más", "Quitar"). Sin color
 *                  propio: hereda el del sitio donde va (la tienda es `slate-900`; el aviso de "ya
 *                  no disponible", ambar), que es lo que hacian las copias.
 *
 * Tamaños, medidos en las copias: `xs` ("Cotizar" de la tarjeta), `sm` (el "Buscar" del buscador),
 * `md` (los estados vacios, `py-3`) y `lg` (`h-12`: la portada —su `py-3.5` con `text-sm` son los
 * mismos 48 px—, la ficha y la cotizacion).
 *
 * Lo unico que se va: la escala al pulsar (`active:scale-95`) que llevaban dos de las copias. Las
 * otras siete no la llevaban, y en el panel tampoco se crece (lote 270): dos comportamientos para la
 * misma accion es lo que se vino a quitar.
 *
 * Este fichero no exporta componentes (React Doctor: un fichero de componentes solo exporta
 * componentes, o se pierde la recarga en caliente); los componentes viven en `BotonTienda.tsx`.
 */

/** El foco de la tienda: anillo de 2 px del azul de la tienda, separado del elemento. */
export const FOCO_TIENDA = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001e40] focus-visible:ring-offset-2';

export const botonTienda = cva(
  `inline-flex items-center justify-center gap-2 uppercase transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${FOCO_TIENDA}`,
  {
    variants: {
      variante: {
        primario: 'rounded-full bg-[#001e40] font-semibold text-white hover:bg-[#00142a]',
        contorno: 'rounded-full border border-slate-900 font-semibold text-slate-900 hover:bg-slate-900 hover:text-white',
        enlace: 'rounded-sm underline hover:opacity-70',
      },
      tamano: {
        xs: 'gap-1.5 px-4 py-1.5 text-[11px] tracking-wider',
        sm: 'px-5 py-2 text-xs tracking-wider',
        md: 'px-8 py-3 text-sm tracking-[0.15em]',
        lg: 'h-12 px-8 text-sm tracking-[0.15em]',
      },
    },
    compoundVariants: [
      //  Un enlace de texto no lleva relleno ni alto: solo el tamaño de la letra y su subrayado.
      { variante: 'enlace', class: 'h-auto p-0' },
      { variante: 'enlace', tamano: ['md', 'lg'], class: 'underline-offset-8' },
      { variante: 'enlace', tamano: ['xs', 'sm'], class: 'font-semibold underline-offset-4' },
    ],
    defaultVariants: { variante: 'primario', tamano: 'md' },
  },
);

export type VariantesDeBotonTienda = VariantProps<typeof botonTienda>;
