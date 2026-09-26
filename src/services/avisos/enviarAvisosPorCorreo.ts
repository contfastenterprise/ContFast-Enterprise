/**
 * Manda por correo los avisos del panel que todavia no han salido (lote 200).
 *
 * POR QUE ESTE CANAL. Medido el 2026-09-26: por WhatsApp no puede salir ninguno, porque
 * el numero de la cuenta es el de PRUEBA de Meta y rechaza todo (#131037, "WhatsApp
 * provided number needs display name approval"). El SMTP de este sistema si funciona.
 * Decision del dueño: correo ahora; el canal de WhatsApp se queda esperando su numero.
 *
 * LAS TRES GARANTIAS SE COPIAN DEL LOTE 178, porque son las que hacen que un aviso no
 * haga daño:
 *
 *  1. **NUNCA LANZA.** Avisar de un problema no puede convertirse en un problema: si el
 *     SMTP no responde, el panel se carga igual.
 *  2. **MARCA LO QUE SALIO, NO LO QUE SE INTENTO.** Un fallo de red deja la marca vacia
 *     y se reintenta en la siguiente carga, en vez de perder el aviso para siempre.
 *  3. **SIN DIRECCION CONFIGURADA NO SE CONSULTA NADA**: ni una lectura de mas en el
 *     panel de las empresas que no lo usan.
 *
 * Y una cuarta, del lote 196: **lo que falla por configuracion no se repite en la misma
 * pasada**. Si el primer correo se rechaza porque la direccion no existe o el SMTP no
 * autentica, a los otros tres les va a pasar igual.
 */
import { and, eq } from 'drizzle-orm';
import { db, companySettings, companies } from '@/db';
import { Logger } from '@/utils/logger';
import { getTransporter, getFromEmail } from '@/utils/mailer';
import { motivoDelError } from '@/utils/motivoDelError';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';
import { avisosQueSeMandanPorCorreo } from '@/services/avisos/avisoPorCorreo';
import {
  clavesYaMandadasPorCorreo,
  marcarMandadasPorCorreo,
  type AvisoDelPanel,
} from '@/services/avisos/sincronizarAvisos';

/** Lo que falta para poder mandar correos, o null si no falta nada. */
export function motivoParaNoMandarCorreo(): string | null {
  if (!process.env.SMTP_HOST) return 'falta SMTP_HOST';
  if (!process.env.SMTP_USER) return 'falta SMTP_USER';
  if (!process.env.SMTP_PASS) return 'falta SMTP_PASS';
  return null;
}

export async function enviarAvisosPorCorreo(
  companyId: string,
  modo: ModoOperativo,
  avisos: readonly AvisoDelPanel[],
): Promise<number> {
  try {
    if (avisos.length === 0) return 0;
    const falta = motivoParaNoMandarCorreo();
    if (falta) {
      //  Se dice UNA vez y con el nombre de la variable, nunca su valor: sin esto, un
      //  sistema sin SMTP configurado callaria igual que uno roto.
      Logger.warn('[avisos-correo] no se puede mandar', { motivo: falta });
      return 0;
    }

    const [ajustes] = await db
      .select({ correo: companySettings.avisosCorreo, empresa: companies.name })
      .from(companySettings)
      .innerJoin(companies, eq(companies.id, companySettings.companyId))
      .where(and(eq(companySettings.companyId, companyId)))
      .limit(1);

    //  Sin direccion configurada, esta empresa no manda avisos por correo. Es el estado
    //  de todas hasta que alguien la ponga en Configuracion.
    if (!ajustes?.correo) return 0;

    const yaMandados = await clavesYaMandadasPorCorreo(companyId, modo);
    const pendientes = avisosQueSeMandanPorCorreo(avisos, ajustes.empresa, ajustes.correo, yaMandados);
    if (pendientes.length === 0) return 0;

    const transporte = getTransporter();
    if (!transporte) {
      Logger.warn('[avisos-correo] no hay transporte de correo configurado');
      return 0;
    }

    const salieron: string[] = [];
    for (const [i, envio] of pendientes.entries()) {
      try {
        await transporte.sendMail({
          from: getFromEmail('ContFast Enterprise'),
          to: envio.destino,
          subject: envio.asunto,
          text: envio.cuerpo,
        });
        salieron.push(envio.clave);
      } catch (err: unknown) {
        Logger.warn('[avisos-correo] no salio un aviso', {
          companyId,
          clave: envio.clave,
          //  Con la causa completa (lote 197): un fallo de SMTP la trae anidada, y sin
          //  ella el registro solo dice "sendMail failed", que no sirve para nada.
          motivo: motivoDelError(err),
        });
        //  LO QUE FALLA POR CONFIGURACION FALLA PARA TODOS (leccion del lote 196): la
        //  direccion, el servidor y las credenciales son las mismas para los cuatro
        //  avisos de esta empresa. Seguir intentando son cuatro esperas de red para
        //  recibir la misma respuesta.
        //
        //  No se dan por perdidos: no se marcan, asi que la siguiente carga los
        //  reintenta -- un SMTP caido vuelve, y una direccion mal escrita se corrige.
        const sinIntentar = pendientes.length - i - 1;
        if (sinIntentar > 0) {
          Logger.warn('[avisos-correo] no se intentan los demas: mismo motivo', {
            companyId, sinIntentar, motivo: motivoDelError(err),
          });
        }
        break;
      }
    }

    await marcarMandadasPorCorreo(companyId, modo, salieron);
    if (salieron.length > 0) {
      Logger.info('[avisos-correo] avisos enviados', { companyId, cuantos: salieron.length });
    }
    return salieron.length;
  } catch (err: unknown) {
    Logger.warn('[avisos-correo] fallo el envio de avisos', { companyId, motivo: motivoDelError(err) });
    return 0;
  }
}
