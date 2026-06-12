import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { ArRepository } from '@/repositories/arRepository';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    await checkRateLimit(ip, 'standard');

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const { id } = await params;
    const receipt = await ArRepository.getReceiptDetails(session.companyId, id);

    if (!receipt) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Recibo de ingreso no encontrado' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: receipt });
  } catch (error: any) {
    console.error('Error fetching receipt details:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
