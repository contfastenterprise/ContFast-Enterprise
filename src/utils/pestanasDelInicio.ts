/**
 * Lote 208 -- que pestañas enseña el panel de inicio.
 *
 * Pedido del dueño el 2026-09-26: sacar Inteligencia de Negocios y el Agente Empresarial
 * del menu lateral y verlos como pestañas del inicio. El menu tiene cincuenta elementos
 * (medido en el lote 189) y estas dos son pantallas de CONSULTA que se miran desde el
 * inicio, no sitios donde se registra nada.
 *
 * POR QUE LA REGLA VIVE FUERA DEL COMPONENTE
 * -----------------------------------------
 * Es la leccion del lote 190, que costo un lote entero: alli la regla de "una entrada por
 * ruta" se escribio DENTRO del sidebar y el banco acabo comprobando su propia copia --
 * cinco comprobaciones en OK durante la contraprueba, y ningun mutante las mataba. Aqui
 * se puede ejecutar de verdad.
 *
 * QUIEN VE CADA PESTAÑA: EXACTAMENTE QUIEN PODIA ENTRAR EN LA RUTA
 * ---------------------------------------------------------------
 * No se inventa un criterio nuevo. Cada pestaña declara la ruta de la que viene y la
 * visibilidad se resuelve con `canAccessRoute`, que es la MISMA funcion que decide si esa
 * ruta se puede abrir escribiendola a mano. Si se copiara la condicion ("solo
 * administracion y sistemas"), el dia que alguien cambie el permiso en `route_mappings`
 * la pestaña y la ruta dirian cosas distintas: se veria una pestaña que al pulsarla no
 * ensena nada, o al reves.
 *
 * Y por eso las filas de `route_mappings` NO se borran al quitarlas del menu: son las que
 * llevan el permiso. Solo dejan de ser `isMenuItem`.
 */

/** Una pestaña del inicio. `ruta` es de donde viene y con que permiso se ve. */
export interface PestanaDelInicio {
  /** Lo que va en la URL (`?tab=`) y lo que identifica la pestaña. */
  clave: string;
  /** Lo que lee la persona. */
  titulo: string;
  /**
   * La ruta cuyo permiso manda, o `null` para la pestaña que siempre esta.
   *
   * El resumen no tiene ruta propia: ES el inicio, y quien llego al inicio ya paso por su
   * propia comprobacion. Darle una ruta significaria poder quedarse sin ninguna pestaña.
   */
  ruta: string | null;
}

/**
 * Todas las pestañas posibles, en orden.
 *
 * El RESUMEN VA PRIMERO y es la de por defecto: es lo que el inicio ha ensenado siempre, y
 * cambiar lo que alguien ve al entrar no es parte de lo que se pidio.
 */
export const PESTANAS_DEL_INICIO: readonly PestanaDelInicio[] = [
  { clave: 'resumen', titulo: 'Resumen', ruta: null },
  { clave: 'bi', titulo: 'Inteligencia de Negocio', ruta: '/dashboard/bi' },
  { clave: 'agente', titulo: 'Agente Empresarial', ruta: '/dashboard/proposals' },
];

/**
 * Las que esta persona puede ver.
 *
 * `puedeEntrar` es `canAccessRoute` del contexto de permisos. Se recibe como argumento en
 * vez de importarlo para que esto sea puro: asi el banco lo ejecuta de verdad, sin montar
 * React ni abrir la base.
 */
export function pestanasVisibles(
  puedeEntrar: (ruta: string) => boolean,
): PestanaDelInicio[] {
  return PESTANAS_DEL_INICIO.filter((p) => p.ruta === null || puedeEntrar(p.ruta));
}

/**
 * Que pestaña toca ensenar, dado lo que venga en la URL.
 *
 * DOS COSAS QUE SE PUEDEN EQUIVOCAR Y QUE AQUI NO PASAN:
 *
 *  · Una clave que no existe --una URL vieja, o escrita a mano-- cae en la primera
 *    visible, no en una pantalla en blanco.
 *  · Una clave que existe pero que esta persona NO puede ver tampoco se abre. Sin esto,
 *    `?tab=bi` en la barra de direcciones ensenaria Inteligencia de Negocios a cualquiera:
 *    la pestaña estaria escondida del listado pero el contenido se pintaria igual. Es el
 *    mismo agujero que tendria un menu que solo oculta el enlace.
 */
export function pestanaActiva(
  pedida: string | null | undefined,
  visibles: readonly PestanaDelInicio[],
): string {
  const porDefecto = visibles[0]?.clave ?? 'resumen';
  if (!pedida) return porDefecto;
  return visibles.some((p) => p.clave === pedida) ? pedida : porDefecto;
}
