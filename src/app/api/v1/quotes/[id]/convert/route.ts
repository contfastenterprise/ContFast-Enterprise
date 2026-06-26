import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { QuoteService } from '@/services/quoteService';

export async function POST(req: NextRequest, { params }: { params: Promise<any> }) {
  const { id } = await params;
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'write');

    const quote = await QuoteService.getQuote(id);
    if (!quote || quote.companyId !== auth.companyId) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Cotización no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    if (quote.status === 'invoiced') {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'Esta cotización ya fue facturada.' } },
        { status: 409, headers: resHeaders }
      );
    }

    const payload = await QuoteService.prepareInvoicePayload(id);

    return NextResponse.json(
      { success: true, data: payload },
      { headers: resHeaders }
    );

  } catch (error: any) {
    console.error('Error in POST /api/v1/quotes/[id]/convert:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500, headers: resHeaders }
    );
  }
}
