/**
 * Los cinco huecos de la plantilla de WhatsApp, rellenados desde un aviso.
 *
 * POR QUE ESTE FICHERO (lote 179)
 * -------------------------------
 * El lote 178 mandaba el aviso como UN parametro suelto, porque cuando se
 * escribio no habia plantilla. La que creo el dueño el 2026-09-21 en el panel
 * de Kapso, `aviso_administrativo`, tiene CINCO y CON NOMBRE:
 *
 *     Hola {{administrador}}, se detectó el siguiente aviso: {{tipo_aviso}}.
 *
 *     Cantidad pendiente: {{cantidad}}
 *     Fecha: {{fecha}}
 *
 *     Revisa la información en {{app_name}}.
 *
 * Meta rechaza el mensaje entero si el numero de parametros no coincide
 * (error 132000), asi que con el cuerpo del 178 NO habria salido ni un aviso --
 * y como nada lanza, solo se habria visto en el registro. De ahi este fichero.
 *
 * LAS REGLAS DE META PARA UN PARAMETRO DE CUERPO, que no son opcionales:
 *   · no puede ir VACIO;
 *   · no admite salto de linea, tabulador, ni cuatro espacios seguidos;
 *   · tiene un tope de longitud.
 * El titulo y la descripcion de un aviso son texto libre escrito para una
 * pantalla, asi que pasan por `limpiarParametro` antes de entrar.
 *
 * Sin base y sin red a proposito, como `avisoPorWhatsApp.ts`: lo que decide
 * que le llega a alguien por telefono es lo que mas falta hace poder probar.
 */
import type { AvisoDelPanel } from '@/services/avisos/avisoDelPanel';

/**
 * Los nombres de los huecos, en el orden de la plantilla.
 *
 * Si algun dia la plantilla cambia, esto y `parametrosDelAviso` cambian juntos:
 * son el CONTRATO con lo que Meta tiene aprobado, no una preferencia nuestra.
 */
export const HUECOS_DE_LA_PLANTILLA = ['administrador', 'tipo_aviso', 'cantidad', 'fecha', 'app_name'] as const;

export type HuecoDeLaPlantilla = (typeof HUECOS_DE_LA_PLANTILLA)[number];

/** Lo que se manda cuando un hueco no tiene nada que decir. Nunca vacio. */
export const SIN_DATO = 'No aplica';

/** Tope de Meta para un parametro de cuerpo. */
const TOPE = 1024;

/**
 * Deja un texto en condiciones de ser un parametro de plantilla.
 *
 * Los saltos de linea pasan a " · " y no a un espacio: el titulo y la
 * descripcion son dos frases distintas, y pegarlas sin separacion se lee mal.
 */
export function limpiarParametro(texto: string | null | undefined): string {
  if (texto === null || texto === undefined) return SIN_DATO;
  const limpio = String(texto)
    .replace(/[\r\n]+/g, ' · ')
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, TOPE)
    .trim();
  // Un parametro vacio hace que Meta rechace el mensaje entero.
  return limpio === '' ? SIN_DATO : limpio;
}

/**
 * El importe del que habla el aviso, si habla de alguno.
 *
 * La plantilla tiene un hueco "Cantidad pendiente" y la mayoria de los avisos
 * que se mandan llevan dinero dentro ("Faltan RD$ 500,00 en el arqueo", un
 * cheque de RD$ 144.092,15). Los que no -- una declaracion que vence -- dicen
 * "No aplica"; inventarles una cifra seria peor que dejar el hueco sin dato.
 *
 * Se lee del texto y no de un campo porque el aviso del panel no tiene campo de
 * importe: es texto ya formateado para enseñarse. Si se equivoca, se equivoca
 * en UN hueco informativo, no en lo que se avisa.
 */
export function montoDelAviso(...textos: (string | null | undefined)[]): string | null {
  for (const t of textos) {
    if (!t) continue;
    // El formato dominicano que usa todo el sistema: RD$ 1.234,56.
    const m = /RD\$\s?-?[\d.,]*\d/.exec(t);
    if (m) return m[0].replace(/RD\$\s?/, 'RD$ ');
  }
  return null;
}

/**
 * Los cinco huecos, listos para mandar.
 *
 * `administrador` lleva el nombre de la EMPRESA y no el de una persona: el
 * destino se configura por empresa y quien administra varias recibe los avisos
 * de todas en el mismo telefono. Saber de cual es el aviso importa mas que un
 * saludo con nombre propio, que ademas no tenemos.
 */
export function parametrosDelAviso(
  aviso: AvisoDelPanel,
  empresa: string,
  fecha: string,
): Record<HuecoDeLaPlantilla, string> {
  const monto = montoDelAviso(aviso.description, aviso.title);
  // El punto final lo pone la plantilla ("...el siguiente aviso: {{tipo_aviso}}."),
  // asi que el del aviso sobraria y saldrian dos seguidos.
  const queEs = `${aviso.title} · ${aviso.description}`.replace(/\.+$/, '');
  return {
    administrador: limpiarParametro(empresa),
    tipo_aviso: limpiarParametro(queEs),
    cantidad: limpiarParametro(monto),
    fecha: limpiarParametro(fecha),
    app_name: 'ContFast',
  };
}
