/**
 * Mandar un WhatsApp por Kapso.
 *
 * KAPSO TIENE DOS APIS Y NO LO DICE CLARO (lote 178)
 * ---------------------------------------------------
 * Esto costo cuatro 404 el 2026-09-21, asi que queda escrito:
 *
 *   - ADMINISTRAR (numeros, conversaciones, clientes):
 *       https://api.kapso.ai/platform/v1/...
 *   - ENVIAR mensajes:
 *       https://api.kapso.ai/meta/whatsapp/v24.0/{phone_number_id}/messages
 *
 * La referencia de la API documenta la ruta de envio como `/{phone_number_id}/
 * messages` SIN decir que cuelga de la segunda base, no de la primera. El
 * cuerpo es el de la Cloud API de Meta tal cual.
 *
 * LA VENTANA DE 24 HORAS
 * ----------------------
 * Meta solo deja mandar TEXTO LIBRE dentro de las 24 h siguientes a que esa
 * persona escriba al numero del negocio. Fuera de ahi hace falta una PLANTILLA
 * aprobada por Meta. Un aviso automatico -- un cheque que vence, una caja
 * descuadrada -- casi nunca cae dentro de esa ventana, asi que lo normal es la
 * plantilla; el texto libre solo sirve para probar.
 *
 * Por eso `KAPSO_PLANTILLA_AVISO` manda: si esta puesta se envia como
 * plantilla, y si no, como texto. Sin plantilla aprobada los avisos fuera de la
 * ventana los rechaza Meta, y eso se REGISTRA en vez de tumbar el panel.
 *
 * LOS PARAMETROS VAN CON NOMBRE (lote 179)
 * ----------------------------------------
 * La plantilla `aviso_administrativo` que creo el dueño el 2026-09-21 usa
 * parametros CON NOMBRE (`{{administrador}}`, `{{tipo_aviso}}`...), no
 * posicionales. Meta los quiere como `{ type: 'text', parameter_name: '...',
 * text: '...' }`, y si el numero de parametros no coincide rechaza el mensaje
 * entero (error 132000). El lote 178 mandaba UNO suelto: no habria salido ni
 * un aviso, y como nada lanza solo se habria visto en el registro.
 */
import { Logger } from '@/utils/logger';

const BASE_ENVIO = 'https://api.kapso.ai/meta/whatsapp/v24.0';

export interface ResultadoEnvio {
  enviado: boolean;
  /** El id que devuelve Meta, para poder seguir el mensaje. */
  wamid?: string;
  motivo?: string;
}

/** Lo que falta para poder mandar, o null si no falta nada. */
export function motivoParaNoMandar(): string | null {
  if (!process.env.KAPSO_API_KEY) return 'falta KAPSO_API_KEY';
  if (!process.env.KAPSO_PHONE_NUMBER_ID) return 'falta KAPSO_PHONE_NUMBER_ID (el numero que envia)';
  return null;
}

/**
 * Manda un mensaje. NUNCA LANZA: avisar de un problema no puede convertirse en
 * un problema, y esto corre detras de la carga del panel.
 */
export async function mandarWhatsApp(
  numero: string,
  texto: string,
  parametros?: Record<string, string>,
): Promise<ResultadoEnvio> {
  const falta = motivoParaNoMandar();
  if (falta) return { enviado: false, motivo: falta };

  const plantilla = process.env.KAPSO_PLANTILLA_AVISO;
  // Con plantilla configurada pero sin huecos que rellenar no se manda nada: un
  // envio que Meta va a rechazar seguro gasta el aviso y no avisa a nadie.
  if (plantilla && (!parametros || Object.keys(parametros).length === 0)) {
    return { enviado: false, motivo: 'hay plantilla configurada pero el aviso no trae sus parametros' };
  }

  const cuerpo = plantilla
    ? {
        messaging_product: 'whatsapp',
        to: numero,
        type: 'template',
        template: {
          name: plantilla,
          // La plantilla del dueño es es_MX. Se puede cambiar sin tocar codigo,
          // pero el valor por defecto es el de la plantilla que existe: un
          // idioma que no case da 132001 y no sale ningun aviso.
          language: { code: process.env.KAPSO_PLANTILLA_IDIOMA || 'es_MX' },
          components: [{
            type: 'body',
            parameters: Object.entries(parametros as Record<string, string>)
              .map(([parameter_name, text]) => ({ type: 'text', parameter_name, text })),
          }],
        },
      }
    : { messaging_product: 'whatsapp', to: numero, type: 'text', text: { body: texto } };

  try {
    const controlador = new AbortController();
    // El panel no puede quedarse esperando a WhatsApp.
    const plazo = setTimeout(() => controlador.abort(), 8000);
    const res = await fetch(`${BASE_ENVIO}/${process.env.KAPSO_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'X-API-Key': process.env.KAPSO_API_KEY as string, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: controlador.signal,
    });
    clearTimeout(plazo);

    const datos = await res.json().catch(() => null) as { messages?: { id: string }[]; error?: { message?: string } } | null;
    if (!res.ok) {
      // El motivo de Meta se guarda tal cual: "fuera de la ventana de 24 h" y
      // "la plantilla no existe" se arreglan de formas distintas.
      return { enviado: false, motivo: datos?.error?.message || `HTTP ${res.status}` };
    }
    return { enviado: true, wamid: datos?.messages?.[0]?.id };
  } catch (err: unknown) {
    const motivo = (err as Error)?.name === 'AbortError' ? 'WhatsApp no respondio a tiempo' : (err as Error)?.message;
    Logger.warn('[avisos-whatsapp] no se pudo enviar', { motivo });
    return { enviado: false, motivo };
  }
}
