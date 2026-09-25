'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { puedeCambiarDeEmpresa, inicialDeEmpresa } from '@/utils/cambioDeEmpresa';

/**
 * La empresa activa, en la cabecera. Y para sistemas, el sitio donde se cambia.
 *
 * POR QUE AQUI (lote 193)
 * -----------------------
 * Pedido del dueño: *"el selector de empresa que esta en el sidebar ponlo en el
 * header y quita el nombre de la empresa del header para solo usar el selector"*.
 *
 * Y tenia sentido de sobra: **eran dos cosas que decian lo mismo**. La cabecera
 * llevaba el nombre de la empresa en texto plano y el menu lateral llevaba el
 * selector con ese mismo nombre — asi que el nombre estaba dos veces, y el sitio
 * donde se cambia era el que menos se ve: el pie del menu, que ademas
 * **desaparecia con el menu plegado** (ahi quedaba un cuadrito con la inicial y
 * nada mas).
 *
 * Medido (PRODUCCION, 2026-09-25): de 9 usuarios, **6 son de `administracion`** y
 * solo 1 de `sistemas`. Para esos 6 el selector nunca fue un selector: es el
 * nombre de la empresa. O sea que traerlo a la cabecera no les cambia nada — ven
 * lo mismo que ya habia ahi — y al unico que puede cambiar le pone el mando
 * delante en vez de escondido.
 *
 * SE CONSERVA TODO LO QUE HACIA, y no es adorno: el **RNC** de cada empresa (hay
 * seis y dos empiezan por la misma letra), el **punto verde** en la activa y la
 * **hilandera** mientras se cambia, que es la unica señal de que la peticion esta
 * en marcha antes de que la pagina se recargue.
 */
export default function SelectorDeEmpresa({
  companyName, companies, rol, companyId, onSwitchCompany, switching,
}: {
  companyName: string;
  companies: any[];
  rol: string | null | undefined;
  companyId: string | null | undefined;
  onSwitchCompany: (id: string) => void;
  switching?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const sePuede = puedeCambiarDeEmpresa(rol);

  //  Escape cierra, y solo se escucha mientras esta abierto: un oyente permanente
  //  se tragaria el Escape de los dialogos de toda la aplicacion. Mismo criterio
  //  que el menu del usuario (lote 192).
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [abierto]);

  //  Si dejara de poderse cambiar con el menu abierto -- se cierra la sesion, se
  //  recarga el usuario -- el menu se quedaria flotando sobre la pantalla.
  useEffect(() => { if (!sePuede) setAbierto(false); }, [sePuede]);

  const distintivo = (
    <span className="w-7 h-7 rounded-lg bg-gradient-to-tr from-primary to-blue-600 text-on-primary flex items-center justify-center font-bold text-[12px] shadow-[0_2px_6px_rgba(0,0,0,0.12)] shrink-0">
      {switching
        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-on-primary" />
        : inicialDeEmpresa(companyName)}
    </span>
  );

  //  El nombre: `suppressHydrationWarning` se conserva del span que habia en la
  //  cabecera. Los ajustes llegan del cliente, asi que el servidor pinta vacio y el
  //  navegador lo rellena; sin esto React avisa de una diferencia que es esperada.
  //  EL NOMBRE COMPLETO, sin recortar (pedido del dueño, 2026-09-25). La primera
  //  version lo cortaba con puntos suspensivos a 110 px en el movil y 200 en el
  //  escritorio, y ahi "LATIN DOORS S.R.L." se quedaba en "LATIN DOO..." -- que es
  //  justo lo que no puede pasar: con seis empresas, el nombre a medias no dice en
  //  cual estas, y es el dato que evita emitir una factura en la empresa
  //  equivocada.
  //
  //  Consecuencia asumida: en una pantalla estrecha un nombre largo empuja. Por eso
  //  `shrink-0` aqui y `min-w-0` en el grupo del logo -- lo que cede es el logo, no
  //  el nombre. `whitespace-nowrap` para que no se parta en dos lineas dentro de una
  //  barra de 56 px de alto.
  const nombre = (
    <span
      suppressHydrationWarning
      className="font-semibold tracking-tight text-[15px] whitespace-nowrap shrink-0 text-inherit"
    >
      {switching ? '' : companyName}
    </span>
  );

  //  QUIEN NO PUEDE CAMBIAR NO VE UN BOTON. Un boton que no hace nada al pulsarlo
  //  es lo que este lote arregla en el avatar (192): no se repite aqui.
  if (!sePuede) {
    return (
      <div className="flex items-center gap-2.5 min-w-0 border-l border-slate-300/60 pl-3 ml-1" title={companyName}>
        {distintivo}
        {nombre}
      </div>
    );
  }

  return (
    <div className="relative border-l border-slate-300/60 pl-3 ml-1">
      <button
        type="button"
        onClick={() => setAbierto(o => !o)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Empresa activa: ${companyName}. Cambiar de empresa`}
        className={clsx(
          'flex items-center gap-2.5 min-w-0 rounded-xl px-2 py-1 -ml-2 transition duration-200 cursor-pointer select-none group',
          'hover:bg-black/5',
          abierto && 'bg-black/5',
        )}
      >
        {distintivo}
        {nombre}
        <ChevronDown
          className={clsx(
            'w-4 h-4 shrink-0 opacity-40 group-hover:opacity-80 transition duration-200',
            abierto && 'rotate-180',
          )}
          strokeWidth={1.5}
        />
      </button>

      {abierto && (
        <>
          {/*  Cierra al pulsar fuera. Va antes en el arbol y con menos `z` que la
               lista, o se comeria el clic de la empresa que se quiere elegir.  */}
          <div className="fixed inset-0 z-[85]" onClick={() => setAbierto(false)} />
          <div
            role="menu"
            className="absolute top-full left-0 mt-2 w-72 z-[90] bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-2xl py-2 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div className="px-3 py-1.5 mb-1.5 border-b border-outline-variant/10">
              <span className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">
                Seleccionar Empresa
              </span>
            </div>
            <div className="max-h-72 overflow-y-auto custom-scrollbar">
              {companies.map(c => (
                <button
                  key={c.id}
                  type="button"
                  role="menuitem"
                  onClick={() => { setAbierto(false); onSwitchCompany(c.id); }}
                  className={clsx(
                    'w-full text-left px-3 py-2.5 text-[12px] cursor-pointer transition-colors flex flex-col gap-0.5 hover:bg-surface-container-low text-on-surface-variant hover:text-on-surface',
                    companyId === c.id && 'bg-primary/10 text-primary font-bold border-l-2 border-primary',
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    {c.name}
                    {companyId === c.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                    )}
                  </span>
                  {/*  El RNC no es adorno: hay seis empresas y dos empiezan por la
                       misma letra.  */}
                  <span className="text-[10px] text-on-surface-variant/60 font-mono">RNC: {c.rnc}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
