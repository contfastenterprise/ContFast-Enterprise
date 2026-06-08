import { NextRequest, NextResponse } from 'next/server';
import { reportQueue } from '@/services/jobs/reportQueue';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportType: string }> }
) {
  try {
    const { reportType } = await params;
    
    // Parse params like ?format=pdf&from=2025-01-01&to=2025-01-31
    const searchParams = request.nextUrl.searchParams;
    const format = (searchParams.get('format') || 'pdf') as 'pdf' | 'xlsx';
    
    if (!reportQueue) {
      return NextResponse.json({ error: 'Queue not available' }, { status: 500 });
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
