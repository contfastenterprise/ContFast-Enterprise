import { NextRequest, NextResponse } from 'next/server';
import { reportQueue } from '@/services/jobs/reportQueue';
import { DocumentService } from '@/services/print/documentService';
import { verifyAuth } from '@/middleware/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<any> }
) {
  try {
    const resHeaders = new Headers();
    const session = await verifyAuth(request, resHeaders);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { jobId } = await params;
    
    if (!reportQueue) {
      if (jobId.startsWith('fallback-')) {
        return NextResponse.json({
          status: 'ready',
          url: `/api/v1/reports/pdf?fallback=true&id=${jobId}`,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
        }, { headers: resHeaders });
      }
      return NextResponse.json({ error: 'Queue not available' }, { status: 500, headers: resHeaders });
    }
    
    const job = await reportQueue.getJob(jobId);
    
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404, headers: resHeaders });
    }

    // Verify multi-tenant isolation: check if the job belongs to the authenticated user's company
    if (job.data?.companyId !== session.companyId) {
      return NextResponse.json({ error: 'Acceso denegado. Este trabajo pertenece a otra empresa.' }, { status: 403, headers: resHeaders });
    }

    const state = await job.getState();

    if (state === 'completed') {
      const result = job.returnvalue;
      if (result && result.documentId) {
        // Generate signed URL when ready
        const url = DocumentService.generateSignedUrl(result.documentId, 15);
        return NextResponse.json({
          status: 'ready',
          url,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
        }, { headers: resHeaders });
      }
    }

    if (state === 'failed') {
      return NextResponse.json({ status: 'failed', error: job.failedReason }, { status: 500, headers: resHeaders });
    }

    return NextResponse.json({ status: 'processing' }, { headers: resHeaders });

  } catch (error: any) {
    console.error('Error checking job status:', error);
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}
