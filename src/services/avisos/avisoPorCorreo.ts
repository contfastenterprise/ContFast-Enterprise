/**
 * Los avisos del panel, por correo.
 *
 * POR QUE EXISTE ESTE CANAL (lote 200)
 * ------------------------------------
 * Los avisos existen desde el lote 158 y salen por WhatsApp desde el 178. Pero medido
 * el 2026-09-26, con el dueño delante: **por WhatsApp no puede salir ninguno**. El
 * numero que tiene la cuenta es el de PRUEBA que regala Meta (`+1 555-346-2012`, y su
 * propio error lo dice: "WhatsApp **provided** number"), y Meta rechaza todo lo que se
 * mande desde el -- plantilla o texto libre, con la ventana de 24 horas abierta o
 * cerrada:
 *
 *     HTTP 400: (#131037) WhatsApp provided number needs display name approval
 *
 * Se arregla dando de alta el numero real de la empresa, que es un tramite de Meta y no
 * codigo. Mientras, el SMTP de este sistema SI funciona (el lote 157 dejo el registro de
 * correos y tiene filas), asi que el aviso sale por donde puede salir hoy. Decision del
 * dueño: correo ahora, WhatsApp cuando haya numero propio -- y el trabajo del 178/196
 * no se toca, queda esperando.
 *
 * ESTE FICHERO ES PURO: decide QUE se manda y COMO se escribe. Quien lo manda de verdad
 * es `enviarAvisosPorCorreo.ts`, que abre el SMTP y toca la base.
 */

import { severidadDeAviso, type AvisoDelPanel } from '@/services/avisos/avisoDelPanel';

/**
 * Que severidades salen por correo.
 *
 * Las mismas que por WhatsApp hoy (`error` y `warning`), pero en su **propia** lista y
 * no compartiendo la del otro canal: son dos decisiones distintas que hoy coinciden. Si
 * algun dia se quiere que el correo lleve tambien los `info` -- un resumen diario, por
 * ejemplo -- se cambia aqui sin tocar el telefono de nadie.
 */
export const SEVERIDADES_POR_CORREO: readonly string[] = ['error', 'warning'];

/** ¿Este aviso sale por correo? */
export function seMandaPorCorreo(tipo: string): boolean {
  return SEVERIDADES_POR_CORREO.includes(severidadDeAviso(tipo));
}

/**
 * La direccion, limpia, o `null` si no es utilizable.
 *
 * Validacion DELIBERADAMENTE MODESTA: que tenga una arroba con algo a cada lado y un
 * punto en el dominio. No se intenta un patron exhaustivo -- los que circulan por ahi
 * rechazan direcciones validas de verdad -- y quien decide de verdad si existe es el
 * servidor de correo. Lo que esto evita es lo que de verdad pasa: un espacio, un nombre
 * escrito sin arroba, o dos direcciones pegadas.
 */
export function correoValido(texto: string | null | undefined): string | null {
  const limpio = (texto ?? '').trim();
  if (limpio === '') return null;
  //  Un espacio dentro ya descarta: es el error mas comun al escribir dos direcciones.
  if (/\s/.test(limpio)) return null;
  const partes = limpio.split('@');
  if (partes.length !== 2) return null;
  const [usuario, dominio] = partes as [string, string];
  if (usuario === '' || dominio === '') return null;
  if (!dominio.includes('.')) return null;
  //  Ni punto al principio ni al final del dominio, que es lo que deja un "correo@.com"
  //  o un "correo@dominio." pasar por bueno.
  if (dominio.startsWith('.') || dominio.endsWith('.')) return null;
  return limpio;
}

export interface EnvioPorCorreo {
  destino: string;
  asunto: string;
  cuerpo: string;
  /** La clave estable del aviso (`notifications.clave`), para marcar lo que salio. */
  clave: string;
}

/**
 * El asunto: la empresa delante y el titulo del aviso detras.
 *
 * LA EMPRESA VA EN EL ASUNTO, y no es un adorno: quien administra varias recibe los
 * avisos de todas en la misma bandeja, y "Caja con diferencia" sin decir de quien no se
 * puede ni ordenar ni buscar.
 */
export function asuntoDelAviso(aviso: AvisoDelPanel, empresa: string): string {
  return `[${empresa}] ${aviso.title}`;
}

/**
 * El cuerpo. Texto llano a proposito: se lee igual en el movil, en un cliente viejo y
 * en un reenvio, y no hay nada que se pueda romper al maquetarlo.
 */
export function cuerpoDelAviso(aviso: AvisoDelPanel, empresa: string): string {
  return [
    aviso.title,
    '',
    aviso.description,
    '',
    `Empresa: ${empresa}`,
    //  El enlace es lo que convierte un aviso en algo que se puede atender: sin el, hay
    //  que buscar la pantalla a mano.
    aviso.actionLink ? `Para atenderlo: ${aviso.actionLink}` : '',
    '',
    'ContFast Enterprise — aviso automático del sistema.',
  ].filter((l, i, todas) => !(l === '' && todas[i - 1] === '')).join('\n');
}

/**
 * Los avisos que hay que mandar por correo ahora.
 *
 * Mismo criterio que el canal de WhatsApp (lote 178): se filtra por severidad y por lo
 * que YA salio, y sin direccion configurada no se manda nada -- ni se consulta nada.
 */
export function avisosQueSeMandanPorCorreo(
  avisos: readonly AvisoDelPanel[],
  empresa: string,
  correoConfigurado: string | null | undefined,
  yaMandados: ReadonlySet<string>,
): EnvioPorCorreo[] {
  const destino = correoValido(correoConfigurado);
  if (!destino) return [];
  return avisos
    .filter((a) => seMandaPorCorreo(a.type) && !yaMandados.has(a.id))
    .map((a) => ({
      destino,
      asunto: asuntoDelAviso(a, empresa),
      cuerpo: cuerpoDelAviso(a, empresa),
      clave: a.id,
    }));
}

/**
 * QUE CORREO DE LA EMPRESA SE PUEDE OFRECER PARA LOS AVISOS (lote 201).
 *
 * Pedido del dueño: poder usar el mismo correo de la empresa sin escribirlo otra vez.
 * Medido el 2026-09-26: las SEIS empresas tienen ya un correo valido en su ficha, y
 * ninguna tenia puesto el de avisos -- asi que esto ahorra el paso justo donde estaba.
 *
 * SE OFRECE, NO SE APLICA SOLO, y la diferencia importa: "vacio = no recibir avisos" es
 * una decision explicita (lotes 178 y 200). Si el correo de la empresa se usara por
 * defecto, las seis empezarian a recibir avisos sin que nadie lo hubiera decidido, y
 * quien quisiera no recibirlos no tendria como decirlo. Con un boton, el campo sigue
 * diciendo exactamente a donde va.
 *
 * Devuelve `null` -- o sea, no hay nada que ofrecer -- en dos casos:
 *   · el correo de la empresa no sirve (vacio, o mal escrito);
 *   · ya es el que esta puesto para los avisos, porque entonces el boton no haria nada
 *     y un boton que no hace nada es peor que no tenerlo (es el defecto del avatar del
 *     lote 192).
 */
export function correoDeLaEmpresaParaAvisos(
  correoDeLaEmpresa: string | null | undefined,
  correoDeAvisos: string | null | undefined,
): string | null {
  const deLaEmpresa = correoValido(correoDeLaEmpresa);
  if (!deLaEmpresa) return null;
  //  Se comparan NORMALIZADOS: si el de avisos esta escrito con espacios alrededor o con
  //  otras mayusculas, es el mismo correo y el boton tampoco haria nada.
  const puesto = correoValido(correoDeAvisos);
  if (puesto && puesto.toLowerCase() === deLaEmpresa.toLowerCase()) return null;
  return deLaEmpresa;
}
