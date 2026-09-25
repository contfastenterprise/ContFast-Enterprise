'use client';

import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Una preferencia que vive en el navegador de cada persona, sin romper la
 * hidratacion.
 *
 * EL DEFECTO QUE ESTE FICHERO ARREGLA (lote 195)
 * ----------------------------------------------
 * Reportado por el dueño el 2026-09-25, y es mio: de los lotes 189 y 191.
 *
 *     Hydration failed because the server rendered HTML didn't match the client.
 *
 * Los dos guardaban su preferencia leyendo `localStorage` en el INICIALIZADOR del
 * `useState`:
 *
 *     useState(() => (typeof window === 'undefined' ? {} : leerGruposGuardados()))
 *
 * En el servidor eso da `{}` -- todo plegado -- y en el navegador da los grupos que
 * la persona dejo abiertos. O sea que el HTML del servidor y el primer pintado del
 * cliente **son distintos**, que es exactamente el primer caso que enumera el aviso
 * de React ("a server/client branch `if (typeof window !== 'undefined')`"). React
 * lo detecta, tira su arbol y lo vuelve a construir en el cliente: el menu entero se
 * repinta en cada carga, y el aviso sale en la consola de todas las pantallas.
 * Medido: en todo `src/` **solo esos dos sitios** lo hacian; el resto de la
 * aplicacion ya leia `localStorage` dentro de un efecto.
 *
 * Y el banco del 189 tenia una comprobacion que **defendia el defecto** ("y se lee
 * al arrancar, no despues"), con un comentario que lo justificaba. Se invierte, como
 * se hizo en el lote 116 con las lineas repetidas: una comprobacion que protege un
 * error se cambia de sentido, no se borra.
 *
 * POR QUE `useLayoutEffect` Y NO `useEffect`
 * -----------------------------------------
 * La cura de manual es leer la preferencia en un `useEffect`. Eso arregla la
 * hidratacion pero devuelve el problema que el lote 189 queria evitar: el primer
 * pintado sale con todo plegado y un instante despues salta a lo que habia
 * guardado.
 *
 * `useLayoutEffect` corre **despues de montar y antes de que el navegador pinte**,
 * asi que se consiguen las dos cosas: el HTML que React compara con el del servidor
 * es identico -- el valor de partida -- y nadie llega a ver el estado de partida en
 * pantalla.
 *
 * LA ELECCION DEL HOOK SEGUN EL ENTORNO NO ES EL DEFECTO DE ANTES, y la diferencia
 * es toda: `typeof window` aqui decide QUE HOOK se usa, no QUE SE PINTA. El HTML
 * que sale es el mismo en los dos lados. En el servidor no hay pintado que adelantar
 * y React avisa si se usa `useLayoutEffect`, asi que alli se usa el normal.
 */
const useEfectoAntesDePintar = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function usePreferenciaDelNavegador<T>(
  clave: string,
  inicial: T,
  desdeTexto: (crudo: string | null) => T | null,
): [T, Dispatch<SetStateAction<T>>] {
  //  EL VALOR DE PARTIDA ES EL MISMO EN LOS DOS LADOS. Eso es lo que arregla la
  //  hidratacion, y es la unica linea de este fichero que no se puede cambiar.
  const [valor, setValor] = useState<T>(inicial);

  //  Hasta que no se haya intentado leer, no se escribe: si el efecto que guarda
  //  corriera antes, escribiria el valor de partida y **borraria la preferencia
  //  justo antes de leerla**. Con `useLayoutEffect` el orden esta garantizado (los
  //  efectos de layout se vacian antes que los normales), pero la guarda se queda:
  //  es lo que hace que el orden no sea una suposicion.
  const restaurado = useRef(false);

  useEfectoAntesDePintar(() => {
    try {
      const leido = desdeTexto(window.localStorage.getItem(clave));
      //  `null` es "no hay preferencia": se respeta el valor de partida. Un objeto o
      //  una lista vacios son una preferencia de verdad ("lo deje todo cerrado") y se
      //  aplican.
      if (leido !== null) setValor(leido);
    } catch {
      //  Ventana privada, cookies bloqueadas, cuota llena: no poder recordar una
      //  preferencia no puede dejar el menu sin pintar.
    }
    restaurado.current = true;
    //  `desdeTexto` no va en las dependencias a proposito: es una funcion de modulo,
    //  estable, y meterla obligaria a envolverla en cada sitio que use el hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  useEffect(() => {
    if (!restaurado.current) return;
    try {
      window.localStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      //  Igual que al leer: que no se pueda guardar no rompe la navegacion.
    }
  }, [clave, valor]);

  return [valor, setValor];
}
