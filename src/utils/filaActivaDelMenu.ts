/**
 *  LA FILA ACTIVA DEL MENU: CENTRADA, UN POCO MAS GRANDE, Y CON UN FONDO QUE VIAJA
 *  (lote 259, pedido del dueño el 2026-10-03).
 *
 *  Vive fuera de `new-app-sidebar.tsx` por la leccion del lote 190: alli dentro,
 *  con `'use client'`, React e iconos, un banco no puede cargar la regla para
 *  EJECUTARLA, y uno que la reimplementa comprueba su copia, no el codigo.
 *
 *  Nada de aqui toca el DOM: recibe medidas y devuelve numeros o textos.
 */

/**
 *  Cuanto crece la fila activa. 4,5 % son unos 2 px de alto y unos 10 px de ancho
 *  en una fila de 220: se nota sin empujar a nadie, porque es una ESCALA y no un
 *  relleno mayor -- un relleno mayor movería todas las filas de debajo, y con el
 *  fondo deslizandose y el menu desplazandose a la vez el menu "bailaria".
 *
 *  El tope no es estetico: la lista tiene 12 px de margen a la derecha y recorta lo
 *  que se sale (`overflow-y: auto` recorta tambien en horizontal). Por encima de
 *  ~1,05 la fila se cortaria contra el borde.
 */
export const ESCALA_DE_LA_FILA_ACTIVA = 1.045;

/**
 *  El `transform` de una fila: la activa crece, las demas no llevan nada.
 *
 *  Se devuelve `undefined` y no `'scale(1)'` para las demas a proposito: un
 *  `transform` en cada una de las 59 filas crearia 59 capas de composicion para
 *  nada. La transicion de ida y de vuelta la pone la clase de la fila.
 */
export function escalaDeLaFila(activa: boolean): string | undefined {
  return activa ? `scale(${ESCALA_DE_LA_FILA_ACTIVA})` : undefined;
}

/**
 *  QUE FILA ES LA ACTIVA: UNA, la que mas se parece a la pantalla.
 *
 *  Antes cada fila decidia sola con `pathname.startsWith(item.href)`, y eso
 *  iluminaba DOS a la vez cuando una ruta del menu es prefijo de otra: en
 *  `/dashboard/hr/employees` salian activas "Dashboard RRHH" (`/dashboard/hr`) y
 *  "Empleados". Se vio al medir este lote. Con el fondo que viaja ya no es solo
 *  feo: dos filas activas pintan dos indicadores con el MISMO `layoutId`, y
 *  framer-motion no sabe cual es el bueno.
 *
 *  Dos reglas:
 *    · gana la ruta mas LARGA de las que coinciden (la mas especifica);
 *    · coincidir es ser la pantalla o una pagina DEBAJO de ella, con su `/`: sin
 *      la barra, `/dashboard/bank` coincidiria con una `/dashboard/banks`.
 *  `/dashboard` (Inicio) solo coincide consigo mismo: si no, estaria activo en
 *  todas las pantallas.
 */
export function filaActiva(rutas: readonly string[], pantalla: string): string | null {
  let mejor: string | null = null;
  for (const ruta of rutas) {
    const coincide = ruta === pantalla || (ruta !== '/dashboard' && pantalla.startsWith(`${ruta}/`));
    if (coincide && (mejor === null || ruta.length > mejor.length)) mejor = ruta;
  }
  return mejor;
}

/**
 *  Las dos secciones donde puede salir la pantalla activa. Sale DOS veces si esta
 *  anclada -- en Favoritos y en su grupo (lote 191) -- y dos elementos con el
 *  mismo `layoutId` montados a la vez se pelean: framer-motion los trata como uno
 *  solo y el fondo saltaria de una seccion a la otra. Cada seccion tiene el suyo.
 */
export type SeccionDelMenu = 'favoritos' | 'grupos';

export function idDelIndicador(seccion: SeccionDelMenu): string {
  return `menu-activo-${seccion}`;
}

export interface MedidasParaCentrar {
  /** Donde empieza la fila, contado desde el principio del CONTENIDO (no de lo que se ve). */
  filaArriba: number;
  filaAlto: number;
  /** Alto de lo que se ve de la lista. */
  vista: number;
  /** Alto de todo el contenido de la lista. */
  contenido: number;
}

/**
 *  El desplazamiento de la lista que deja la fila en el centro.
 *
 *  Acotado a lo que se puede desplazar: las primeras y las ultimas filas no se
 *  pueden centrar del todo, y pedir un desplazamiento negativo o mas alla del final
 *  lo recortaria el navegador igual -- pero devolverlo acotado hace que lo que se
 *  pide sea lo que pasa, y que un banco lo pueda comprobar.
 */
export function desplazamientoParaCentrar(m: MedidasParaCentrar): number {
  const objetivo = m.filaArriba + m.filaAlto / 2 - m.vista / 2;
  const maximo = Math.max(0, m.contenido - m.vista);
  return Math.round(Math.min(maximo, Math.max(0, objetivo)));
}

/**
 *  Como se desplaza: suave, salvo la primera vez y salvo con "reducir movimiento".
 *
 *  La primera vez es al cargar la pagina (o al abrir el cajon del movil): ahi no
 *  hay de donde venir, y un desplazamiento suave seria ver el menu correr solo
 *  nada mas entrar.
 */
export function comoDesplazar(reducirMovimiento: boolean, primeraVez: boolean): ScrollBehavior {
  return reducirMovimiento || primeraVez ? 'auto' : 'smooth';
}

/**
 *  Si hay que centrar AHORA: solo cuando cambia la pantalla, no cuando se abre o se
 *  cierra un grupo.
 *
 *  Es la decision que mas importa del lote. El efecto que centra corre tambien al
 *  cambiar los grupos abiertos -- hace falta, porque al navegar a una pantalla de un
 *  grupo cerrado la fila no existe hasta que el grupo se abre solo --, pero si
 *  centrara en cada cambio, cerrar un grupo moveria el menu debajo del raton: lo
 *  que el lote 194 dejo escrito que no se hace ("al cerrar no se mueve").
 *
 *  `centradaEn` es la ultima pantalla ya centrada; `null` antes de la primera vez.
 */
export function hayQueCentrar(centradaEn: string | null, pantalla: string): boolean {
  return centradaEn !== pantalla;
}
