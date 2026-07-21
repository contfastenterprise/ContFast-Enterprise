import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { ProductRepository } from '@/repositories/productRepository';
import { z } from 'zod';

const printLogSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive('La cantidad de etiquetas debe ser mayor a cero'),
});

export async function GET(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json({ success: false, error: { message: 'No autenticado.' } }, { status: 401 });
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'catalogo', 'read');

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '20', 10);

    const logs = await ProductRepository.getBarcodePrintLogs(auth.companyId, page, perPage);
    return NextResponse.json({ success: true, data: logs }, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error in GET /api/v1/products/barcodes/print-log:', error);
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json({ success: false, error: { message: 'No autenticado.' } }, { status: 401 });
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'catalogo', 'write');

    const body = await req.json();
    const result = printLogSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, error: { message: result.error.issues[0].message } }, { status: 400 });
    }

    const { productId, quantity } = result.data;
    const log = await ProductRepository.logBarcodePrint(productId, auth.companyId, auth.userId, quantity);

    return NextResponse.json({ success: true, data: log }, { status: 201, headers: resHeaders });
  } catch (error: any) {
    console.error('Error in POST /api/v1/products/barcodes/print-log:', error);
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 400 });
  }
}
