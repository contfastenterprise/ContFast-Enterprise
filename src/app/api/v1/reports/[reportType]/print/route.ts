import { NextRequest, NextResponse } from 'next/server';
import { reportQueue } from '@/services/jobs/reportQueue';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<any> }
) {
  try {
    const resHeaders = new Headers();
    const session = await verifyAuth(request, resHeaders);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Verify user has permission to read reports
    await enforcePermission(session.userId, session.role, session.roleId, 'reportes', 'read');

    const { reportType } = await params;
    
    // Parse params like ?format=pdf&from=2025-01-01&to=2025-01-31
    const searchParams = request.nextUrl.searchParams;
    const format = (searchParams.get('format') || 'pdf') as 'pdf' | 'xlsx';
    
    if (!reportQueue) {
      console.log(`[Reports Print Route] Queue not available. Returning fallback job ID.`);
      return NextResponse.json({
        job_id: `fallback-report-${reportType}-${Date.now()}`,
        status: 'processing'
      }, { headers: resHeaders });
    }

    // Enqueue job in BullMQ with authentic companyId and userId
    const job = await reportQueue.add('generate-report', {
      reportType,
      format,
      filters: Object.fromEntries(searchParams.entries()),
      companyId: session.companyId,
      userId: session.userId
    });

    return NextResponse.json({
      job_id: job.id,
      status: 'processing'
    }, { headers: resHeaders });

  } catch (error: any) {
    console.error('Error enqueuing report:', error);
    const status = error.status || 500;
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status });
  }
}
