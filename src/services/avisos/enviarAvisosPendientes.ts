/**
 * Manda por WhatsApp los avisos del panel que todavia no han salido (lote 178).
 *
 * VA DETRAS DE `sincronizarAvisos`, a proposito: esa deja la tabla igual a lo
 * que dice el panel AHORA -- inserta lo nuevo, reabre lo que volvio y cierra lo
 * que dejo de aplicar --, y solo despues se puede saber que es nuevo de verdad.
 *
 * NUNCA LANZA. Avisar de un problema no puede convertirse en un problema: si
 * WhatsApp no responde, el panel se carga igual. Lo que falle se registra.
 *
 * SE MARCA LO QUE SALIO, NO LO QUE SE INTENTO. Un envio fallido deja la marca
 * vacia y se reintenta en la siguiente carga del panel; marcarlo antes de
 * saber si salio convertiria un fallo de red en un aviso perdido para siempre.
 */
import { and, eq } from 'drizzle-orm';
import { db, companySettings, companies } from '@/db';
import { Logger } from '@/utils/logger';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';
import { avisosQueSeMandan } from '@/services/avisos/avisoPorWhatsApp';
import { formatDateDisplay, diaRD } from '@/utils/fechasLocales';
import { clavesYaMandadasPorWhatsApp, marcarMandadasPorWhatsApp, type AvisoDelPanel } from '@/services/avisos/sincronizarAvisos';
import { mandarWhatsApp, motivoParaNoMandar } from '@/services/avisos/whatsappKapso';
import { esRechazoDeTodos } from '@/services/avisos/rechazoDeWhatsApp';

export async function enviarAvisosPendientes(
  companyId: string,
  modo: ModoOperativo,
  avisos: readonly AvisoDelPanel[],
): Promise<number> {
  try {
    if (avisos.length === 0) return 0;
    // Si el sistema no puede mandar, no se consulta nada: ni una lectura de mas
    // en cada carga del panel de todas las empresas que no lo usan.
    if (motivoParaNoMandar()) return 0;

    const [ajustes] = await db
      .select({ numero: companySettings.whatsappAvisos, empresa: companies.name })
      .from(companySettings)
      .innerJoin(companies, eq(companies.id, companySettings.companyId))
      .where(and(eq(companySettings.companyId, companyId)))
      .limit(1);

    // Sin numero configurado, esta empresa no manda avisos. Es el estado de
    // todas hasta que alguien lo ponga en Configuracion.
    if (!ajustes?.numero) return 0;

    const yaMandados = await clavesYaMandadasPorWhatsApp(companyId, modo);
    // La fecha del aviso es la de REPUBLICA DOMINICANA, no la del servidor:
    // Vercel corre en UTC y a partir de las 20:00 de RD ya es el dia siguiente
    // (el defecto del lote 174). Un aviso fechado mañana no se cree.
    const pendientes = avisosQueSeMandan(avisos, ajustes.empresa, ajustes.numero, yaMandados, formatDateDisplay(diaRD()));
    if (pendientes.length === 0) return 0;

    const salieron: string[] = [];
    for (const [i, envio] of pendientes.entries()) {
      const r = await mandarWhatsApp(envio.numero, envio.texto, envio.parametros);
      if (r.enviado) {
        salieron.push(envio.clave);
        continue;
      }
      Logger.warn('[avisos-whatsapp] no salio un aviso', { companyId, clave: envio.clave, motivo: r.motivo });

      //  LOTE 196: LO QUE SE RECHAZA POR CONFIGURACION SE RECHAZA PARA TODOS.
      //
      //  Todos los avisos de esta empresa van al mismo numero, con la misma clave de
      //  API y la misma plantilla, asi que un 4xx en el primero ya dice como acaban
      //  los demas: cinco peticiones y cinco esperas de red para la misma respuesta.
      //  Lo reporto el dueño el 2026-09-25, con cinco lineas iguales por carga.
      //
      //  NO se dan por perdidos: no se marcan, asi que la siguiente carga los vuelve
      //  a intentar. Eso importa porque sin plantilla el texto libre solo se acepta
      //  dentro de las 24 h desde que esa persona escribio al numero -- el mismo
      //  aviso que hoy se rechaza puede salir mañana sin que nadie cambie nada.
      if (esRechazoDeTodos(r.estado ?? 0)) {
        const sinIntentar = pendientes.length - i - 1;
        if (sinIntentar > 0) {
          Logger.warn('[avisos-whatsapp] no se intentan los demas: mismo motivo', {
            companyId, sinIntentar, motivo: r.motivo,
          });
        }
        break;
      }
    }

    await marcarMandadasPorWhatsApp(companyId, modo, salieron);
    return salieron.length;
  } catch (err: unknown) {
    Logger.warn('[avisos-whatsapp] fallo el envio de avisos', { companyId, error: (err as Error)?.message });
    return 0;
  }
}
