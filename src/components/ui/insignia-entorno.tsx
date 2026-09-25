'use client';

import React from 'react';
import clsx from 'clsx';
import { rotuloDelEntorno, type Entorno } from '@/utils/entornoVisible';

/**
 * El entorno en el que se opera, al lado de la campana.
 *
 * POR QUE ASI (lote 192)
 * ----------------------
 * Pedido del dueño: *"la leyenda de produccion o prueba ponlo al lado de la
 * campana de notificacion pero sin el label pero si con hover"*.
 *
 * Antes vivia en el pie del menu con su texto ("Producción", "Pruebas"). Ahi
 * ocupaba una fila entera de un menu de cincuenta elementos para decir algo que
 * no cambia nunca dentro de una sesion — y encima, plegado el menu, desaparecia.
 *
 * SIN TEXTO PERO CON HOVER, y el globo dice la CONSECUENCIA, no el nombre otra
 * vez: "Pruebas" no le dice a nadie que lo que emita no vale ante la DGII. El
 * texto sale de `utils/entornoVisible`, que es donde se puede probar.
 *
 * ACCESIBLE DE VERDAD: el punto de color no es informacion para quien no
 * distingue colores ni para un lector de pantalla, asi que el rotulo va tambien
 * en `aria-label` y en `role="status"`. Sin eso, quitar la etiqueta le quitaria
 * el dato a quien ya no lo tenia facil.
 *
 * No lleva `title`: el globo del navegador saldria ADEMAS del nuestro, tarde y
 * con otro aspecto.
 */
export default function InsigniaEntorno({ entorno }: { entorno: Entorno }) {
  const rotulo = rotuloDelEntorno(entorno);

  return (
    <div className="relative flex items-center group/entorno">
      <span
        role="status"
        aria-label={`${rotulo.titulo}. ${rotulo.detalle}`}
        //  El area que se puede señalar es mayor que el punto: un punto de 8 px es
        //  muy poco blanco para el raton, y el globo no se abriria casi nunca.
        className="flex items-center justify-center w-7 h-7 rounded-full cursor-default hover:bg-black/5"
      >
        <span className={clsx('h-2 w-2 rounded-full shrink-0 animate-pulse', rotulo.clasePunto)} />
      </span>

      {/*  El globo. `pointer-events-none` para que no se coma el clic de lo que
           tenga debajo, y `whitespace-nowrap` porque en una barra estrecha se
           partiria en cuatro lineas.  */}
      <div
        className="pointer-events-none absolute top-full right-0 mt-1.5 z-[80] opacity-0 translate-y-1 transition duration-150
                   group-hover/entorno:opacity-100 group-hover/entorno:translate-y-0"
      >
        <div className="rounded-xl bg-zinc-900/95 text-white shadow-2xl border border-white/10 px-3 py-2 whitespace-nowrap">
          <div className="text-[11px] font-bold tracking-wide">{rotulo.titulo}</div>
          <div className="text-[10px] text-white/70">{rotulo.detalle}</div>
        </div>
      </div>
    </div>
  );
}
