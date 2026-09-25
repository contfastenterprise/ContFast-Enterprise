/**
 * Que dice un rechazo de WhatsApp, y si vale la pena seguir intentando.
 *
 * DE DONDE SALE (lote 196)
 * ------------------------
 * El dueño paso el registro de una sesion de desarrollo del 2026-09-25 con esto,
 * repetido en cada carga del panel:
 *
 *     [avisos-whatsapp] no salio un aviso { clave: 'declaracion-606-202608',
 *                                          motivo: 'HTTP 422' }
 *
 * Cinco avisos, cinco peticiones, cinco lineas iguales, y otra vez cinco en la
 * carga siguiente. De ahi salieron DOS defectos, y ninguno era la plantilla:
 *
 * 1. **EL MOTIVO SE TIRABA A LA BASURA.** El codigo hacia
 *    `datos?.error?.message || `HTTP ${res.status}``, o sea que solo sabia leer la
 *    forma de error de Meta (`{error:{message}}`). Kapso contesta con otra forma,
 *    asi que lo unico que quedaba era "HTTP 422" -- y con eso no se puede arreglar
 *    nada. Es la leccion del lote 185: un log que no señala al sitio correcto
 *    cuesta una investigacion entera.
 *
 * 2. **SE REINTENTABA IGUAL PARA SIEMPRE.** El lote 178 marca solo lo que SALIO, a
 *    proposito, para que un fallo de red se reintente en la siguiente carga en vez
 *    de perderse. Pero un rechazo por configuracion no es un fallo de red: los
 *    cinco avisos de esa empresa van al mismo numero, con la misma clave de API y
 *    la misma plantilla, asi que si el primero se rechaza por eso, **los otros
 *    cuatro ya se sabe como acaban**. Cinco peticiones y cinco esperas de red para
 *    recibir la misma respuesta.
 *
 * LO QUE NO SE HACE, Y ES DELIBERADO: no se marca el aviso como "imposible" ni se
 * deja de intentar en las cargas siguientes. Sin plantilla configurada, el texto
 * libre solo se acepta dentro de las 24 h desde que esa persona escribio al numero
 * -- o sea que el mismo aviso que hoy se rechaza puede salir mañana sin que nadie
 * cambie nada. Darlo por perdido seria perder avisos de verdad. Lo que se corta es
 * **repetir la misma peticion dentro de la misma pasada**.
 *
 * Fichero puro y sin imports: la regla tiene que poder ejecutarse en un banco.
 */

/** Tope de lo que se copia del cuerpo del error al registro. */
const TOPE_MOTIVO = 200;

/**
 * El motivo de un rechazo, leido del cuerpo venga con la forma que venga.
 *
 * Se prueban las formas conocidas por orden y, si ninguna encaja, **se copia el
 * cuerpo tal cual** recortado: es feo en el registro, pero un texto feo que dice
 * que pasa vale mas que un "HTTP 422" limpio que no dice nada.
 *
 * SE RECORTA, y no es cosmetica: un cuerpo de error puede traer la peticion entera
 * de vuelta, y esa lleva el numero de telefono del destinatario. Doscientos
 * caracteres son de sobra para un mensaje de error y poco para un volcado.
 *
 * Nunca lanza: esto corre en el camino de un panel que tiene que cargar igual.
 */
export function motivoDelRechazo(estado: number, cuerpo: unknown): string {
  const recortar = (t: string) => {
    const limpio = t.replace(/\s+/g, ' ').trim();
    if (limpio === '') return '';
    return limpio.length > TOPE_MOTIVO ? `${limpio.slice(0, TOPE_MOTIVO)}…` : limpio;
  };

  const texto = (() => {
    if (cuerpo === null || cuerpo === undefined) return '';
    //  Un cuerpo que ni era JSON llega ya como texto.
    if (typeof cuerpo === 'string') return recortar(cuerpo);
    if (typeof cuerpo !== 'object') return recortar(String(cuerpo));

    const c = cuerpo as Record<string, unknown>;

    //  1) La forma de Meta, que es la que ya se leia.
    const deMeta = (c.error as Record<string, unknown> | undefined)?.message;
    if (typeof deMeta === 'string' && deMeta.trim() !== '') return recortar(deMeta);

    //  2) `{ message: ... }` a secas, y `{ error: 'texto' }`.
    if (typeof c.message === 'string' && c.message.trim() !== '') return recortar(c.message);
    if (typeof c.error === 'string' && c.error.trim() !== '') return recortar(c.error);

    //  3) `{ errors: [...] }`, que es lo que suelen devolver las validaciones: la
    //     lista puede traer textos o objetos con `message`, y hasta un objeto de
    //     campo -> errores (`{ to: ['is invalid'] }`).
    const lista = c.errors;
    if (Array.isArray(lista) && lista.length > 0) {
      const partes = lista.map((e) => {
        if (typeof e === 'string') return e;
        const m = (e as Record<string, unknown>)?.message;
        return typeof m === 'string' ? m : JSON.stringify(e);
      });
      return recortar(partes.join('; '));
    }
    if (lista && typeof lista === 'object') return recortar(JSON.stringify(lista));

    //  4) No se reconoce nada: el cuerpo entero, recortado. Es el caso que dejaba
    //     "HTTP 422" a secas.
    const crudo = recortar(JSON.stringify(cuerpo));
    return crudo === '{}' ? '' : crudo;
  })();

  //  EL ESTADO SIEMPRE VA DELANTE. Sin el no se puede clasificar el fallo al leer
  //  el registro: un 422 se arregla cambiando la peticion y un 503 esperando.
  return texto === '' ? `HTTP ${estado}` : `HTTP ${estado}: ${texto}`;
}

/**
 * ¿Este rechazo le va a pasar igual a todos los avisos de esta pasada?
 *
 * Todos los avisos de una empresa salen con la MISMA clave de API, el MISMO numero
 * de destino y la MISMA plantilla. Asi que lo que se rechaza por cualquiera de esas
 * tres cosas -- o por la ventana de 24 horas, que es de la conversacion y no del
 * mensaje -- se va a rechazar cinco veces igual.
 *
 * Se decide por el ESTADO y no por el texto: los textos cambian cuando al
 * proveedor le da por cambiarlos, y anclarse a ellos es la trampa de la forma.
 *
 *   · 4xx = la peticion es la que esta mal. La siguiente sera igual de mala.
 *   · 408 y 429 son la excepcion: "tardo demasiado" y "vas muy rapido" son del
 *     momento, no de la peticion. Con 429 ademas conviene no insistir en la misma
 *     pasada, asi que tambien cortan -- pero por otra razon, y eso queda dicho aqui
 *     para que nadie lo "arregle" al reves.
 *   · 5xx = el problema es del otro lado. No se puede saber si al siguiente le
 *     tocara mejor, asi que se sigue.
 *   · Sin estado (0) = no hubo respuesta: red, plazo agotado. Se sigue.
 */
export function esRechazoDeTodos(estado: number): boolean {
  if (estado === 408) return false;
  //  MUTANTE EQUIVALENTE, ANOTADO: quitar esta linea NO cambia el comportamiento --
  //  429 ya cae en el 4xx de abajo -- y por eso el banco no la mata. Se queda escrita
  //  a proposito, porque dice una intencion distinta: el 408 esta exceptuado por ser
  //  del momento, y si alguien exceptuara el 429 "por coherencia" estaria haciendo lo
  //  contrario de lo que hace falta. Insistir tras un 429 empeora las cosas.
  if (estado === 429) return true;
  return estado >= 400 && estado < 500;
}
