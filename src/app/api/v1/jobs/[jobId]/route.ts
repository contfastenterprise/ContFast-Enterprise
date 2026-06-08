import { NextRequest, NextResponse } from 'next/server';
import { reportQueue } from '@/services/jobs/reportQueue';
import { DocumentService } from '@/services/print/documentService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    
    const job = await reportQueue.getJob(jobId);
    
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const state = await job.getState();

    if (state === 'completed') {
      const result = job.returnvalue;
      if (result && result.documentId) {
        // Generar signed URL cuando está listo
        const url = DocumentService.generateSignedUrl(result.documentId, 15);
        return NextResponse.json({
          status: 'ready',
          url,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
        });
      }
    }

    if (state === 'failed') {
      return NextResponse.json({ status: 'failed', error: job.failedReason }, { status: 500 });
    }

    return NextResponse.json({ status: 'processing' });

  } catch (error) {
    console.error('Error checking job status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
