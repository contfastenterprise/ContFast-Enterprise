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

/**
 * Los avisos que hay que mandar por correo ahora.
 *
 * Mismo criterio que el canal de WhatsApp (lote 178): se filtra por severidad y por lo
 * que YA salio, y sin direccion configurada no se manda nada -- ni se consulta nada.
 *
 * LOTE 205: devuelve los AVISOS y no un correo por aviso. Antes esta funcion armaba un
 * envio por cada uno; el dueño pidio que todos vayan en un solo documento, asi que quien
 * decide que entra sigue siendo esto y como se presenta es del informe. Con ocho avisos
 * pendientes, lo de antes eran ocho correos.
 */
export function avisosParaElInforme(
  avisos: readonly AvisoDelPanel[],
  correoConfigurado: string | null | undefined,
  yaMandados: ReadonlySet<string>,
): AvisoDelPanel[] {
  if (!correoValido(correoConfigurado)) return [];
  return avisos.filter((a) => seMandaPorCorreo(a.type) && !yaMandados.has(a.id));
}

/**
 * El asunto del informe: la empresa delante y cuantos avisos hay detras.
 *
 * LA EMPRESA VA EN EL ASUNTO, y no es un adorno: quien administra varias recibe los
 * avisos de todas en la misma bandeja, y "3 avisos pendientes" sin decir de quien no se
 * puede ni ordenar ni buscar.
 *
 * LOS GRAVES SE CUENTAN APARTE cuando hay: "8 avisos pendientes" y "8 avisos pendientes
 * (3 graves)" piden atencion distinta, y el asunto es lo unico que se ve sin abrir.
 */
export function asuntoDelInforme(avisos: readonly AvisoDelPanel[], empresa: string): string {
  //  LA SEVERIDAD SE DERIVA de la clase del aviso, NO es `a.type`. `type` vale
  //  'invoice_rejected', 'caja_con_diferencia', 'check_due'... y quien lo traduce a
  //  error/warning/info es `severidadDeAviso`. Compararlo con 'error' a pelo da SIEMPRE
  //  falso, asi que el asunto nunca habria contado un grave -- y el banco lo cazo.
  const graves = avisos.filter((a) => severidadDeAviso(a.type) === 'error').length;
  const cuantos = avisos.length;
  const plural = cuantos === 1 ? 'aviso pendiente' : 'avisos pendientes';
  const cola = graves > 0 ? ` (${graves} grave${graves === 1 ? '' : 's'})` : '';
  return `[${empresa}] ${cuantos} ${plural}${cola}`;
}

/**
 * El cuerpo del correo. Texto llano a proposito: se lee igual en el movil, en un cliente
 * viejo y en un reenvio, y no hay nada que se pueda romper al maquetarlo.
 *
 * REPITE LOS AVISOS AUNQUE VAYAN EN EL PDF, y esto es deliberado: un adjunto puede no
 * abrirse -- en el movil, con una conexion mala, o si el PDF no se pudo generar (pasa: el
 * navegador que lo dibuja puede no arrancar). Si el cuerpo fuera "ver el adjunto", un
 * fallo del PDF dejaria un correo que no dice nada. Asi el correo se sostiene solo y el
 * informe es el detalle.
 */
export function cuerpoDelInforme(
  avisos: readonly AvisoDelPanel[],
  empresa: string,
  conInforme: boolean,
): string {
  //  Los graves primero: el mismo orden que el informe, para que no se lean dos ordenes
  //  distintos del mismo contenido.
  const PESO: Record<string, number> = { error: 0, warning: 1, info: 2 };
  const ordenados = [...avisos].sort(
    (a, b) => (PESO[severidadDeAviso(a.type)] ?? 9) - (PESO[severidadDeAviso(b.type)] ?? 9));
  const lineas: string[] = [
    `Avisos pendientes de ${empresa}: ${avisos.length}.`,
    '',
  ];
  for (const a of ordenados) {
    lineas.push(`• [${rotuloDeSeveridad(severidadDeAviso(a.type))}] ${a.title}`);
    if (a.description) lineas.push(`  ${a.description}`);
    //  El enlace es lo que convierte un aviso en algo que se puede atender: sin el, hay
    //  que buscar la pantalla a mano.
    if (a.actionLink) lineas.push(`  Para atenderlo: ${a.actionLink}`);
    lineas.push('');
  }
  if (conInforme) {
    lineas.push('Se adjunta el informe en PDF, con el movimiento de compras y ventas.');
    lineas.push('');
  }
  lineas.push('ContFast Enterprise — aviso automático del sistema.');
  return lineas.filter((l, i, todas) => !(l === '' && todas[i - 1] === '')).join('\n');
}

/** Como se nombra cada severidad para una persona. */
export function rotuloDeSeveridad(severidad: string): string {
  if (severidad === 'error') return 'GRAVE';
  if (severidad === 'warning') return 'ADVERTENCIA';
  return 'AVISO';
}

/**
 * El nombre del fichero adjunto.
 *
 * SE LIMPIA EL NOMBRE DE LA EMPRESA, y hace falta: los nombres reales traen puntos y
 * apostrofos (`LATIN DOORS S.R.L.`, `D'JIMENEZ`), y un nombre de fichero con barras o con
 * puntos de mas lo tratan mal algunos clientes de correo -- se ha visto guardar
 * "informe.pdf.txt". Solo letras, numeros, guion y punto de la extension.
 */
export function nombreDelInforme(empresa: string, dia: string): string {
  const limpio = (empresa || 'empresa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'empresa';
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : 'sin-fecha';
  return `avisos-${limpio}-${fecha}.pdf`;
}

/**
 * QUE CORREO DE LA EMPRESA SE PUEDE OFRECER PARA LOS AVISOS (lote 201, casilla en el 204).
 *
 * Pedido del dueño: poder usar el mismo correo de la empresa sin escribirlo otra vez.
 * Medido el 2026-09-26: las SEIS empresas tienen ya un correo valido en su ficha, y
 * ninguna tenia puesto el de avisos -- asi que esto ahorra el paso justo donde estaba.
 *
 * SE OFRECE, NO SE APLICA SOLO, y la diferencia importa: "vacio = no recibir avisos" es
 * una decision explicita (lotes 178 y 200). Si el correo de la empresa se usara por
 * defecto, las seis empezarian a recibir avisos sin que nadie lo hubiera decidido, y
 * quien quisiera no recibirlos no tendria como decirlo.
 *
 * Devuelve `null` cuando no hay nada que ofrecer, o sea cuando el correo de la empresa
 * no sirve (vacio, o mal escrito): copiar una direccion que el servidor va a rechazar
 * con un 400 deja el campo con basura y guardar falla sin que se entienda por que.
 *
 * LO QUE CAMBIO EN EL LOTE 204, y es el motivo de que esta funcion ya no reciba el
 * correo de avisos: el dueño pidio una CASILLA en vez de un boton. Un boton se esconde
 * cuando no haria nada -- incluido el caso "ya es el que esta puesto" --, pero una
 * casilla en ese caso tiene que salir MARCADA: es justo su estado normal. Las dos
 * preguntas eran una sola funcion y son distintas, asi que se separan: esta dice QUE se
 * puede ofrecer, y `usaElCorreoDeLaEmpresa` dice SI ya se esta usando.
 */
export function correoDeLaEmpresaParaAvisos(
  correoDeLaEmpresa: string | null | undefined,
): string | null {
  return correoValido(correoDeLaEmpresa);
}

/**
 * SI EL CORREO DE AVISOS ES YA EL DE LA EMPRESA -- el estado de la casilla (lote 204).
 *
 * Se comparan NORMALIZADOS: escrito con espacios alrededor o con otras mayusculas es el
 * mismo correo, y la casilla tiene que salir marcada igual. Si no, quien lo escribio a
 * mano con una mayuscula distinta veria la casilla vacia teniendo puesto ese correo, y
 * al marcarla no cambiaria nada visible.
 *
 * Es `false` cuando cualquiera de los dos no sirve: sin correo de empresa no hay nada
 * que "estar usando", y un correo de avisos ilegible no es el de la empresa.
 */
export function usaElCorreoDeLaEmpresa(
  correoDeLaEmpresa: string | null | undefined,
  correoDeAvisos: string | null | undefined,
): boolean {
  const deLaEmpresa = correoValido(correoDeLaEmpresa);
  const puesto = correoValido(correoDeAvisos);
  if (!deLaEmpresa || !puesto) return false;
  return puesto.toLowerCase() === deLaEmpresa.toLowerCase();
}
