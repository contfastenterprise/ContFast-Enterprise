import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { DGIIService } from '@/services/dgii/rncLookup';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    // Comentar verifyAuth temporalmente si es necesario probar desde postman sin login
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const { rnc } = await params;
    
    // Validación básica de RNC o Cédula Dominicana
    const cleanRnc = rnc.replace(/\D/g, '');
    if (cleanRnc.length !== 9 && cleanRnc.length !== 11) {
      return NextResponse.json(
        { success: false, message: 'El RNC o Cédula debe tener 9 u 11 dígitos' },
        { status: 400 }
      );
    }

    const result = await DGIIService.lookupRNC(cleanRnc);

    if (!result.success) {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Error in DGII RNC Lookup endpoint:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
