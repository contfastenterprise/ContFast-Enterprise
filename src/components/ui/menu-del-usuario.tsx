'use client';

import React, { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import clsx from 'clsx';
import Avatar from '@/components/ui/Avatar';

/**
 * El avatar, que ahora abre algo.
 *
 * POR QUE (lote 192)
 * ------------------
 * Pedido del dueño: *"el boton de cerrar seccion ponlo dentro de la imajen del
 * usuario"*. Estaba en el pie del menu lateral, debajo de cincuenta elementos.
 *
 * Y al ir a hacerlo salio que **el avatar ya prometia un clic que no existia**:
 * en `ClientLayout` llevaba `cursor-pointer` y `hover:scale-105` sin un solo
 * `onClick`. Quien lo pulsaba no obtenia nada, que es peor que un avatar quieto.
 *
 * DECISIONES, para que no haya que adivinarlas despues:
 *
 *  · **Cerrar sesion sigue sin pedir confirmacion.** Es como estaba en el menu;
 *    este lote mueve el boton, no cambia lo que hace. Si algun dia se pide
 *    confirmar, se decide aparte.
 *
 *  · **Se cierra con Escape y pulsando fuera.** Un menu que solo se cierra
 *    volviendo a pulsar el avatar atrapa el dedo en el movil, donde no hay
 *    "fuera" evidente.
 *
 *  · **El nombre y el rol van DENTRO** ademas de al lado. Al lado estan ocultos
 *    por debajo de `sm:` (`hidden sm:flex`), asi que en el movil el menu es el
 *    unico sitio donde se puede comprobar con que cuenta se esta trabajando —
 *    y con seis empresas y varios roles eso no es un adorno.
 */
export default function MenuDelUsuario({
  nombre, rol, avatarUrl, onCerrarSesion,
}: {
  nombre: string;
  rol: string;
  avatarUrl?: string | null;
  onCerrarSesion: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement | null>(null);

  //  Escape cierra. Se escucha solo mientras esta abierto: un oyente permanente
  //  en cada pantalla por un menu que casi siempre esta cerrado es gasto inutil,
  //  y ademas se tragaria el Escape de otros dialogos.
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [abierto]);

  return (
    <div className="relative select-none" ref={caja}>
      <button
        type="button"
        onClick={() => setAbierto(o => !o)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Cuenta de ${nombre}`}
        className="flex items-center gap-2.5 rounded-full cursor-pointer"
      >
        <div className="hidden sm:flex flex-col text-right">
          <span className="text-[13px] font-semibold tracking-wide leading-tight text-inherit">
            {nombre}
          </span>
          <span className="text-[10px] font-medium leading-none mt-0.5 text-inherit opacity-60">
            {rol}
          </span>
        </div>
        <Avatar
          src={avatarUrl}
          name={nombre}
          size={36}
          className={clsx(
            'border-2 shadow-inner transition-transform border-slate-200',
            abierto ? 'scale-105 ring-2 ring-primary/40' : 'hover:scale-105',
          )}
        />
      </button>

      {abierto && (
        <>
          {/*  La capa que cierra al pulsar fuera. Va ANTES del menu en el arbol y
               con menos `z` que el, o se comeria el clic del propio boton de
               cerrar sesion.  */}
          <div className="fixed inset-0 z-[85]" onClick={() => setAbierto(false)} />
          <div
            role="menu"
            className="absolute top-full right-0 mt-2 w-60 z-[90] bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-2xl py-2 animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div className="px-3 py-2 border-b border-outline-variant/15 mb-1.5">
              <div className="text-[13px] font-bold text-on-surface truncate">{nombre}</div>
              <div className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider mt-0.5">
                {rol || 'Sin rol'}
              </div>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setAbierto(false); onCerrarSesion(); }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-bold text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 transition-colors cursor-pointer"
            >
              <LogOut className="w-[17px] h-[17px] shrink-0" strokeWidth={1.5} />
              Cerrar Sesión
            </button>
          </div>
        </>
      )}
    </div>
  );
}
