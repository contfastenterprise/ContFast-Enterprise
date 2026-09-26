/**
 * Manda por correo los avisos del panel que todavia no han salido (lote 200), en UN solo
 * correo con un informe en PDF adjunto (lote 205).
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
 * LO QUE CAMBIA EN EL LOTE 205, pedido del dueño: "el correo lo quiero como un reporte,
 * en un pdf con los datos de la empresa y el formato que tenemos en los demas pdf. todos
 * los aviso debe de estar en un solo archivo pdf".
 *
 *  · **UN correo, no uno por aviso.** Con ocho pendientes lo de antes eran ocho correos.
 *    Y desaparece con eso la cuarta garantia del lote 196 ("lo que falla por
 *    configuracion no se repite en la misma pasada"): ya no hay pasada que cortar, porque
 *    solo hay un envio. La propiedad que protegia -- no repetir la misma peticion
 *    condenada -- se cumple sola.
 *  · **El PDF no puede costar un aviso.** Dibujarlo arranca un Chromium, y eso falla por
 *    motivos que no tienen nada que ver con los avisos (memoria, arranque en frio, el
 *    servicio externo). Si el informe no sale, el correo se manda IGUAL con el texto, que
 *    ya lleva todos los avisos. Al contrario -- no mandar nada porque el adjunto fallo --
 *    seria convertir una mejora de presentacion en una perdida de informacion.
 *  · **Corre dentro de `after()`** (lote 199), asi que el panel no espera ni al PDF ni al
 *    SMTP.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { db, companySettings, companies, notifications } from '@/db';
import { Logger } from '@/utils/logger';
import { getTransporter, getFromEmail } from '@/utils/mailer';
import { motivoDelError } from '@/utils/motivoDelError';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';
import {
  avisosParaElInforme,
  asuntoDelInforme,
  cuerpoDelInforme,
  nombreDelInforme,
  correoValido,
} from '@/services/avisos/avisoPorCorreo';
import {
  clavesYaMandadasPorCorreo,
  marcarMandadasPorCorreo,
  type AvisoDelPanel,
} from '@/services/avisos/sincronizarAvisos';
import { informeDeAvisosPdf } from '@/services/avisos/informeDeAvisos';
import { diaDelInforme } from '@/services/avisos/movimientoDeLosDias';

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
    const destino = correoValido(ajustes?.correo);
    if (!destino) return 0;

    const yaMandados = await clavesYaMandadasPorCorreo(companyId, modo);
    const pendientes = avisosParaElInforme(avisos, ajustes?.correo, yaMandados);
    if (pendientes.length === 0) return 0;

    const transporte = getTransporter();
    if (!transporte) {
      Logger.warn('[avisos-correo] no hay transporte de correo configurado');
      return 0;
    }

    const empresa = ajustes?.empresa ?? '';

    //  DESDE CUANDO ESTA CADA AVISO. Lo sabe `notifications`, que `sincronizarAvisos`
    //  acaba de escribir en esta misma peticion. Sin este dato el informe dice que hay un
    //  arqueo descuadrado pero no si es de hoy o de hace tres semanas, que es lo que
    //  decide si corre prisa.
    const desdeCuando = await fechasDeLosAvisos(companyId, modo);

    //  EL INFORME NO PUEDE TUMBAR EL AVISO: si no sale, se manda el correo sin adjunto.
    let adjunto: Buffer | null = null;
    try {
      adjunto = await informeDeAvisosPdf({ companyId, modo, empresa, avisos: pendientes, desdeCuando });
    } catch (err: unknown) {
      Logger.warn('[avisos-correo] no se pudo generar el informe; se manda sin adjunto', {
        companyId, motivo: motivoDelError(err),
      });
    }

    const claves = pendientes.map((a) => a.id);
    try {
      await transporte.sendMail({
        from: getFromEmail('ContFast Enterprise'),
        to: destino,
        subject: asuntoDelInforme(pendientes, empresa),
        text: cuerpoDelInforme(pendientes, empresa, adjunto !== null),
        ...(adjunto
          ? {
            attachments: [{
              //  El dia sale del MISMO sitio que el del informe, para que no puedan
              //  discrepar: un adjunto fechado el 27 con un informe fechado el 26 es lo
              //  que hace dudar de los dos.
              filename: nombreDelInforme(empresa, diaDelInforme()),
              content: adjunto,
              contentType: 'application/pdf',
            }],
          }
          : {}),
      });
    } catch (err: unknown) {
      //  NO SE MARCA NADA: la siguiente carga del panel lo reintenta entero. Un SMTP
      //  caido vuelve, y una direccion mal escrita se corrige -- perder los avisos por un
      //  fallo de red seria irreversible.
      Logger.warn('[avisos-correo] no salio el informe de avisos', {
        companyId,
        cuantos: claves.length,
        //  Con la causa completa (lote 197): un fallo de SMTP la trae anidada, y sin
        //  ella el registro solo dice "sendMail failed", que no sirve para nada.
        motivo: motivoDelError(err),
      });
      return 0;
    }

    await marcarMandadasPorCorreo(companyId, modo, claves);
    Logger.info('[avisos-correo] informe enviado', {
      companyId, cuantos: claves.length, conInforme: adjunto !== null,
    });
    return claves.length;
  } catch (err: unknown) {
    Logger.warn('[avisos-correo] fallo el envio de avisos', { companyId, motivo: motivoDelError(err) });
    return 0;
  }
}

/**
 * Desde cuando esta pendiente cada aviso, por su clave.
 *
 * Solo los que siguen vigentes (`resolvedAt` nulo): un aviso que se cerro y volvio tiene
 * su fila reutilizada, y la fecha que importa es la de ahora, no la de la primera vez.
 */
async function fechasDeLosAvisos(
  companyId: string,
  modo: ModoOperativo,
): Promise<Map<string, Date>> {
  const filas = await db
    .select({ clave: notifications.clave, creado: notifications.createdAt })
    .from(notifications)
    .where(and(
      eq(notifications.companyId, companyId),
      eq(notifications.modo, modo),
      isNull(notifications.resolvedAt),
    ));
  const mapa = new Map<string, Date>();
  for (const f of filas) if (f.creado) mapa.set(f.clave, f.creado);
  return mapa;
}

