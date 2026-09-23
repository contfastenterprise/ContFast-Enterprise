/**
 * Los seis huecos de la plantilla de WhatsApp, rellenados desde un aviso.
 *
 * POR QUE ESTE FICHERO (lote 179)
 * -------------------------------
 * El lote 178 mandaba el aviso como UN parametro suelto, porque cuando se
 * escribio no habia plantilla. La que Meta APROBO el 2026-09-23 --
 * `aviso_administrativo`, es_MX -- tiene SEIS huecos y CON NOMBRE:
 *
 *     [cabecera fija: Aviso administrativo]
 *
 *     Hola {{administrador}}, se detectó un aviso en {{empresa}}: {{tipo_aviso}}.
 *
 *     Cantidad pendiente: {{cantidad}}
 *     Fecha: {{fecha}}
 *
 *     Revisa la información en {{app_name}} cuando puedas.
 *
 *     [pie fijo: Notificación automática]
 *
 * LOTE 184: eran CINCO cuando se escribio el 179, porque es lo que el dueño
 * dijo que habia creado. Al leer la plantilla aprobada con la API salio que
 * llevaba una mas, `empresa`, asi que el cuerpo del 179 habria dado 132000
 * -- descuadre de parametros -- y NO habria salido ni un aviso. Comprobado con
 * un envio real de seis parametros: `message_status: accepted`.
 *
 * La leccion, y es la segunda vez en dos lotes: la forma de la plantilla se LEE
 * de la API (`GET /meta/whatsapp/v24.0/{waba}/message_templates`), no se da por
 * sabida. La cabecera y el pie son fijos, asi que no llevan parametros.
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
export const HUECOS_DE_LA_PLANTILLA = ['administrador', 'empresa', 'tipo_aviso', 'cantidad', 'fecha', 'app_name'] as const;

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
 * Los seis huecos, listos para mandar.
 *
 * `administrador` va con un saludo GENERICO, no con un nombre. El destino se
 * configura por empresa, no por persona: no sabemos quien lee ese telefono, y
 * poner ahi el nombre de la empresa -- que es lo que hacia el lote 179, cuando
 * no habia hueco propio para ella -- ahora seria repetirla dos veces en la
 * misma frase. Inventarse un nombre propio seria peor.
 *
 * `empresa` es el hueco que el lote 184 vino a llenar, y es el que de verdad
 * importa: quien administra varias empresas recibe los avisos de todas en el
 * mismo telefono, y "Faltan RD$ 500 en el arqueo" sin decir de quien no sirve.
 */
export function parametrosDelAviso(
  aviso: AvisoDelPanel,
  empresa: string,
  fecha: string,
): Record<HuecoDeLaPlantilla, string> {
  const monto = montoDelAviso(aviso.description, aviso.title);
  // El punto final lo pone la plantilla ("...un aviso en {{empresa}}: {{tipo_aviso}}."),
  // asi que el del aviso sobraria y saldrian dos seguidos.
  const queEs = `${aviso.title} · ${aviso.description}`.replace(/\.+$/, '');
  return {
    administrador: 'Administrador',
    empresa: limpiarParametro(empresa),
    tipo_aviso: limpiarParametro(queEs),
    cantidad: limpiarParametro(monto),
    fecha: limpiarParametro(fecha),
    app_name: 'ContFast',
  };
}
