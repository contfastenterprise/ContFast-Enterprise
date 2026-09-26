import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { isAdminOrSistemas } from '@/middleware/permissions';
import { DashboardRepository } from '@/repositories/dashboardRepository';
import { sincronizarAvisos } from '@/services/avisos/sincronizarAvisos';
import { enviarAvisosPendientes } from '@/services/avisos/enviarAvisosPendientes';
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

    // Lote 178: y los que todavia no han salido, al WhatsApp de la empresa.
    // DESPUES de sincronizar, que es cuando se sabe cual es nuevo de verdad.
    // Tampoco lanza, y no se espera a que termine para responder: el panel no
    // se queda colgado porque WhatsApp tarde.
    void enviarAvisosPendientes(session.companyId, session.modo, stats.alertsDetails ?? []);

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
