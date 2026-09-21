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
import { clavesYaMandadasPorWhatsApp, marcarMandadasPorWhatsApp, type AvisoDelPanel } from '@/services/avisos/sincronizarAvisos';
import { mandarWhatsApp, motivoParaNoMandar } from '@/services/avisos/whatsappKapso';

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
    const pendientes = avisosQueSeMandan(avisos, ajustes.empresa, ajustes.numero, yaMandados);
    if (pendientes.length === 0) return 0;

    const salieron: string[] = [];
    for (const envio of pendientes) {
      const r = await mandarWhatsApp(envio.numero, envio.texto);
      if (r.enviado) salieron.push(envio.clave);
      else Logger.warn('[avisos-whatsapp] no salio un aviso', { companyId, clave: envio.clave, motivo: r.motivo });
    }

    await marcarMandadasPorWhatsApp(companyId, modo, salieron);
    return salieron.length;
  } catch (err: unknown) {
    Logger.warn('[avisos-whatsapp] fallo el envio de avisos', { companyId, error: (err as Error)?.message });
    return 0;
  }
}
