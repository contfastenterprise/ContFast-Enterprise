import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { DashboardRepository } from '@/repositories/dashboardRepository';

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const [stats, chart, recent] = await Promise.all([
      DashboardRepository.getStats(session.companyId),
      DashboardRepository.getWeeklyChart(session.companyId),
      DashboardRepository.getRecentActivity(session.companyId)
    ]);

    return NextResponse.json({
      success: true,
      data: {
        stats,
        chart,
        recent
      }
    });
  } catch (err: any) {
    console.error('Error fetching dashboard data:', err);
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}
