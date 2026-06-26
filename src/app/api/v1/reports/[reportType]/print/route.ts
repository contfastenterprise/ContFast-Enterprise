import { NextRequest, NextResponse } from 'next/server';
import { reportQueue } from '@/services/jobs/reportQueue';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<any> }
) {
  try {
    const { reportType } = await params;
    
    // Parse params like ?format=pdf&from=2025-01-01&to=2025-01-31
    const searchParams = request.nextUrl.searchParams;
    const format = (searchParams.get('format') || 'pdf') as 'pdf' | 'xlsx';
    
    if (!reportQueue) {
      console.log(`[Reports Print Route] Queue not available. Returning fallback job ID.`);
      return NextResponse.json({
        job_id: `fallback-report-${reportType}-${Date.now()}`,
        status: 'processing'
      });
    }

    // Encolar trabajo en BullMQ
    const job = await reportQueue.add('generate-report', {
      reportType,
      format,
      filters: Object.fromEntries(searchParams.entries()),
      companyId: 'fake-company-id',
      userId: 'fake-user-id'
    });

    return NextResponse.json({
      job_id: job.id,
      status: 'processing'
    });

  } catch (error) {
    console.error('Error enqueuing report:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
