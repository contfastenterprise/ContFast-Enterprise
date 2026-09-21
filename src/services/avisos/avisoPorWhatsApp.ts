/**
 * Que aviso del panel se manda por WhatsApp, a que numero y con que texto.
 *
 * POR QUE (lote 178)
 * ------------------
 * Los avisos existen desde el lote 158 y se guardan desde el 160, pero solo
 * los ve quien ABRE el panel. Un cheque en garantia que se cobra mañana, una
 * caja con diferencia o el 606 que vence el dia 15 no esperan a que alguien
 * entre a mirar. El dueño ya tiene un numero de WhatsApp de empresa conectado
 * (verificado el 2026-09-21), asi que el aviso puede ir a donde si se mira.
 *
 * LAS TRES DECISIONES
 * -------------------
 * 1. EL DESTINO ES DE LA EMPRESA, no una variable de entorno (decision del
 *    dueño, 2026-09-21). El sistema es multiempresa: los avisos de D'JIMENEZ
 *    no son asunto de quien administra Latin Doors. Vacio = no se manda nada,
 *    que es como estan todas hasta que alguien lo configure.
 * 2. SE MANDAN LOS GRAVES Y LOS DE ADVERTENCIA, no los informativos. Un
 *    periodo contable que se acaba dentro de un mes no merece un WhatsApp; un
 *    comprobante rechazado o un descuadre de caja, si.
 * 3. CADA AVISO SE MANDA UNA VEZ. El panel recalcula sus avisos en cada carga;
 *    sin esa regla, el mismo cheque se anunciaria cada vez que alguien abre el
 *    inicio, y un aviso que se repite es un aviso que se aprende a ignorar.
 *    La marca vive en `notifications.whatsapp_enviado_at`.
 *
 * Sin base de datos y sin red: aqui solo se decide.
 */
// De `avisoDelPanel`, no de `sincronizarAvisos`: ese abre la conexion a la
// base al importarse, y aqui no se toca la base a proposito.
import { severidadDeAviso, type AvisoDelPanel } from '@/services/avisos/avisoDelPanel';

/** Las severidades que llegan al telefono (decision del dueño, 2026-09-21). */
export const SEVERIDADES_POR_WHATSAPP: readonly string[] = ['error', 'warning'];

/** ¿Este aviso va por WhatsApp? */
export function seMandaPorWhatsApp(tipo: string): boolean {
  return SEVERIDADES_POR_WHATSAPP.includes(severidadDeAviso(tipo));
}

/**
 * El numero, en el formato que quiere Meta: solo digitos, con codigo de pais.
 *
 * Devuelve null si no se puede dar por bueno, y entonces NO SE MANDA NADA. Un
 * numero a medias no es un destinatario: mandarlo "por si acaso" es escribirle
 * a un desconocido con los avisos de una empresa.
 *
 * Republica Dominicana usa +1 con 809, 829 y 849. Un numero local de 10 digitos
 * que empiece por uno de esos tres se completa con el 1; lo demas tiene que
 * venir ya con su codigo de pais, porque adivinarlo seria inventarse el pais.
 */
const AREAS_RD = ['809', '829', '849'];

export function normalizarNumero(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const digitos = texto.replace(/\D/g, '');
  if (!digitos) return null;
  // 10 digitos con area dominicana: le falta el codigo de pais.
  if (digitos.length === 10 && AREAS_RD.includes(digitos.slice(0, 3))) return `1${digitos}`;
  // Con codigo de pais: entre 11 y 15 digitos (E.164 permite hasta 15).
  if (digitos.length >= 11 && digitos.length <= 15) return digitos;
  return null;
}

/**
 * El texto del aviso.
 *
 * Lleva la empresa delante a proposito: quien administra varias recibe los
 * avisos de todas en el mismo telefono, y "Faltan RD$ 500 en el arqueo" sin
 * decir de quien no sirve para nada.
 */
export function textoDelAviso(aviso: AvisoDelPanel, empresa: string): string {
  const marca = severidadDeAviso(aviso.type) === 'error' ? '🔴' : '🟠';
  return `${marca} ${empresa}\n\n${aviso.title}\n\n${aviso.description}`;
}

/** Lo que hay que mandar, ya decidido: a quien y que. */
export interface EnvioDeAviso {
  numero: string;
  texto: string;
  clave: string;
}

/**
 * Que avisos se mandan de verdad, dados los del panel y los que ya se mandaron.
 *
 * Se decide aqui, entero, para poder probarlo sin red ni base: la parte que
 * puede molestar a alguien -- repetir un mensaje -- es la que mas necesita
 * estar probada.
 */
export function avisosQueSeMandan(
  avisos: readonly AvisoDelPanel[],
  empresa: string,
  numeroConfigurado: string | null | undefined,
  yaMandados: ReadonlySet<string>,
): EnvioDeAviso[] {
  const numero = normalizarNumero(numeroConfigurado);
  if (!numero) return [];
  return avisos
    .filter((a) => seMandaPorWhatsApp(a.type) && !yaMandados.has(a.id))
    .map((a) => ({ numero, texto: textoDelAviso(a, empresa), clave: a.id }));
}
