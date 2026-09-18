import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { isAdminOrSistemas } from '@/middleware/permissions';
import { DashboardRepository } from '@/repositories/dashboardRepository';
import { sincronizarAvisos } from '@/services/avisos/sincronizarAvisos';

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
    console.error('Error fetching dashboard data:', err);
    return NextResponse.json({ success: false, error: { message: (err as Error).message } }, { status: 500 });
  }
}
