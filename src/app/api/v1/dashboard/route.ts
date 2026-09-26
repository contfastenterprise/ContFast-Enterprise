import { NextRequest, NextResponse, after } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { isAdminOrSistemas } from '@/middleware/permissions';
import { DashboardRepository } from '@/repositories/dashboardRepository';
import { sincronizarAvisos } from '@/services/avisos/sincronizarAvisos';
import { enviarAvisosPorCorreo } from '@/services/avisos/enviarAvisosPorCorreo';
import { motivoDelError, motivoParaLaPantalla } from '@/utils/motivoDelError';

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    if (!isAdminOrSistemas(session.role)) {
      return NextResponse.json({
        success: false,
        error: { message: 'No tiene permisos para realizar esta acción. Solo usuarios de administración o de sistemas pueden acceder a esta información.' }
      }, { status: 403 });
    }

    const url = new URL(req.url);
    const period = url.searchParams.get('period') || 'semana';
    const days = period === 'mes' ? 28 : 7;

    const [stats, chart, recent, comparisonChart, topCustomers, categoryData, collectionStatusData] = await Promise.all([
      DashboardRepository.getStats(session.companyId, session.modo),
      DashboardRepository.getWeeklyChart(session.companyId, days, session.modo),
      DashboardRepository.getRecentActivity(session.companyId, session.modo),
      DashboardRepository.getComparisonChart(session.companyId, days, session.modo),
      DashboardRepository.getTopCustomers(session.companyId, session.modo),
      DashboardRepository.getCategorySales(session.companyId, days, session.modo),
      DashboardRepository.getCollectionStatus(session.companyId, days, session.modo)
    ]);

    // Lote 160: los avisos que el panel acaba de calcular se guardan, para que
    // no vivan solo en esta pantalla: la campana los enseña en toda la
    // aplicación y quedan hasta que se atienden. `sincronizarAvisos` cierra
    // solos los que ya no aparecen y NUNCA lanza: guardar el aviso no puede
    // tumbar el panel que lo produjo.
    await sincronizarAvisos(session.companyId, session.modo, stats.alertsDetails ?? []);

    //  LOTE 200: LOS AVISOS SALEN POR CORREO. El canal de WhatsApp se RETIRO.
    //
    //  Estuvo desde el lote 178 y nunca llego a entregar un aviso en produccion.
    //  Medido el 2026-09-26: la cuenta tiene UN numero, `+1 555-346-2012`, que es el
    //  de PRUEBA que regala Meta -- su propio error lo dice, "WhatsApp **provided**
    //  number" -- y rechaza todo lo que se mande desde el, plantilla o texto libre,
    //  con la ventana de 24 horas abierta o cerrada:
    //
    //      HTTP 400: (#131037) WhatsApp provided number needs display name approval
    //
    //  Para que funcionara habia que dar de alta un numero propio de la empresa en
    //  Meta, que es un tramite y no codigo. Decision del dueño (2026-09-26): quitarlo
    //  y quedarse con el correo, que SI funciona hoy (el SMTP lleva meses enviando y
    //  el lote 157 dejo su registro).
    //
    //  Lo que se fue con el: `whatsappKapso.ts`, `enviarAvisosPendientes.ts`,
    //  `plantillaDeAviso.ts`, `avisoPorWhatsApp.ts`, `rechazoDeWhatsApp.ts`, el campo
    //  de la pantalla, su ajuste y las variables `KAPSO_*`. Lo que NO se fue: la
    //  columna `notifications.whatsapp_enviado_at` y `company_settings.whatsapp_avisos`
    //  quedan RESERVADAS con su dato (mismo criterio que el lote 107): borrar columnas
    //  con historia es irreversible y no hace falta para nada.
    //  LOTE 200: y por correo, que es por donde HOY pueden salir.
    //
    //  Medido el 2026-09-26: por WhatsApp no sale ninguno, porque el numero de la
    //  cuenta es el de PRUEBA de Meta y rechaza todo (#131037). El canal de WhatsApp se
    //  queda -- no se toca -- para cuando la empresa tenga numero propio.
    //
    //  Los dos canales van por SEPARADO y cada uno con su marca en la base: que uno
    //  falle no puede impedir el otro, y el dia que los dos funcionen un aviso saldra
    //  por los dos sin repetirse.
    after(() => enviarAvisosPorCorreo(session.companyId, session.modo, stats.alertsDetails ?? []));

    return NextResponse.json({
      success: true,
      data: {
        stats,
        chart,
        recent,
        comparisonChart,
        topCustomers,
        categoryData,
        collectionStatusData
      }
    });
  } catch (err: unknown) {
    //  LOTE 197: EL MOTIVO DE VERDAD, QUE ESTABA EN `cause`.
    //
    //  Esta ruta devolvia 500 en PRODUCCION y el registro solo decia
    //  `Failed query: select ... from invoices`, que es el envoltorio de Drizzle: el
    //  error real (`CONNECTION_CLOSED`, `too many clients`, un tiempo agotado) viaja
    //  en `error.cause` y se descartaba. Con el panel caido no se envian los avisos
    //  por WhatsApp, porque salen de aqui mismo (lote 178): un fallo mudo en esta
    //  ruta apaga dos cosas a la vez.
    //
    //  Se sigue pasando `err` detras del motivo para no perder el rastro de pila,
    //  que es lo unico que dice EN QUE consulta fue.
    console.error('Error fetching dashboard data:', motivoDelError(err), err);
    //  A la pantalla va el NUCLEO, no el envoltorio: es lo que explica el fallo y,
    //  de paso, deja de mandarle al navegador la consulta que fallo -- hoy la pinta
    //  tal cual en el aviso de "no se pudieron cargar los datos".
    return NextResponse.json({ success: false, error: { message: motivoParaLaPantalla(err) } }, { status: 500 });
  }
}
