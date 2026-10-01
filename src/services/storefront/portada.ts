/**
 * La portada de la tienda publica, configurable por empresa (lote 235).
 *
 * Decision del dueno al redisenar la tienda (lote 231): anuncio de arriba,
 * titulo, texto e imagen, distintos por empresa. Reglas puras -- sin React,
 * sin base --, para que la ruta que guarda, la tienda que ensena, la pantalla
 * de Configuracion y el banco usen LAS MISMAS:
 *
 *  · VACIO NO ES UN ERROR: es "usa lo de siempre". Asi una empresa que no
 *    configure nada tiene la portada del lote 231, y quien borre un campo
 *    vuelve a ella en vez de quedarse con un hueco en blanco.
 *  · EL ANUNCIO y EL TITULO van en UNA linea: un salto de linea pegado desde
 *    otro sitio romperia la barra fina de arriba. El texto si admite parrafos.
 *  · LOS TOPES son los de la pantalla Y los del servidor: uno solo aqui.
 */
export type PortadaGuardada = {
  anuncio: string | null;
  titulo: string | null;
  texto: string | null;
  imagenUrl: string | null;
};

export const LIMITES_DE_PORTADA = { anuncio: 120, titulo: 80, texto: 400 } as const;

export const PORTADA_VACIA: PortadaGuardada = { anuncio: null, titulo: null, texto: null, imagenUrl: null };

export const TEXTO_POR_DEFECTO =
  'Explora nuestro catálogo, arma tu selección y solicita tu cotización en línea. Te respondemos con precios y tiempos de entrega.';

export function tituloPorDefecto(nombreDeLaEmpresa: string): string {
  return `Bienvenido a ${nombreDeLaEmpresa}`;
}

const unaLinea = (v: string) => v.replace(/\s+/g, ' ').trim();
const parrafos = (v: string) => v.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const oNull = (v: string) => (v === '' ? null : v);

/** Lo que se GUARDA: recortado, en su forma, y vacio como `null`. */
export function limpiarPortada(entrada: { anuncio?: unknown; titulo?: unknown; texto?: unknown; imagenUrl?: unknown }): PortadaGuardada {
  const t = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    anuncio: oNull(unaLinea(t(entrada.anuncio))),
    titulo: oNull(unaLinea(t(entrada.titulo))),
    texto: oNull(parrafos(t(entrada.texto))),
    imagenUrl: oNull(t(entrada.imagenUrl).trim()),
  };
}

/** Campo -> mensaje de lo que pasa del tope. Vacio si todo cabe. */
export function erroresDePortada(p: PortadaGuardada): Partial<Record<keyof typeof LIMITES_DE_PORTADA, string>> {
  const errores: Partial<Record<keyof typeof LIMITES_DE_PORTADA, string>> = {};
  const nombres = { anuncio: 'El anuncio', titulo: 'El título', texto: 'El texto' } as const;
  for (const campo of ['anuncio', 'titulo', 'texto'] as const) {
    const largo = p[campo]?.length ?? 0;
    if (largo > LIMITES_DE_PORTADA[campo]) {
      errores[campo] = `${nombres[campo]} no puede pasar de ${LIMITES_DE_PORTADA[campo]} caracteres (tiene ${largo}).`;
    }
  }
  return errores;
}

/** Lo que la tienda ENSENA: lo configurado, y lo de siempre donde falte. */
export function portadaParaMostrar(guardada: PortadaGuardada | null | undefined, nombreDeLaEmpresa: string) {
  const p = guardada ?? PORTADA_VACIA;
  return {
    anuncio: p.anuncio || null,
    titulo: p.titulo || tituloPorDefecto(nombreDeLaEmpresa),
    texto: p.texto || TEXTO_POR_DEFECTO,
    imagenUrl: p.imagenUrl || null,
  };
}
