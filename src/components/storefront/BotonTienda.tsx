/**
 * El boton de la tienda publica (lote 282), en sus dos formas: `BotonTienda` (un `<button>`) y
 * `EnlaceTienda` (un `Link` de Next con el mismo aspecto). Las variantes y su porque, en
 * `botonTiendaVariantes.ts`.
 *
 * Dos componentes y no un `asChild`: casi todos los botones de la tienda viven en componentes de
 * SERVIDOR (la portada, los estados vacios, el catalogo), y la tienda se pinta en el servidor con
 * sus productos (lote 231). Un `Link` envuelto aqui no necesita nada del navegador.
 *
 * `type` es obligatorio por tipo: un `<button>` sin el dentro de un `<form>` envia el formulario.
 * `isLoading` hace lo mismo que en el `Button` del panel: el giro, desactivado y `aria-busy`.
 */
import type { ComponentProps } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { botonTienda, type VariantesDeBotonTienda } from './botonTiendaVariantes';

type PropsDelBoton = Omit<ComponentProps<'button'>, 'type'> & VariantesDeBotonTienda & {
  type: 'button' | 'submit';
  isLoading?: boolean;
};

export function BotonTienda({ variante, tamano, className, isLoading, disabled, children, ...props }: PropsDelBoton) {
  return (
    <button
      className={cn(botonTienda({ variante, tamano }), className)}
      disabled={isLoading || disabled}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

type PropsDelEnlace = ComponentProps<typeof Link> & VariantesDeBotonTienda;

export function EnlaceTienda({ variante, tamano, className, ...props }: PropsDelEnlace) {
  return <Link className={cn(botonTienda({ variante, tamano }), className)} {...props} />;
}
