import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { ProductRepository } from '@/repositories/productRepository';
import { clearCachePattern } from '@/infrastructure/redis';
import { z } from 'zod';

const addBarcodeSchema = z.object({
  barcode: z.string().min(1, 'El código de barras no puede estar vacío').max(100),
  barcodeType: z.string().min(1, 'El tipo de código es requerido').max(30),
});

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json({ success: false, error: { message: 'No autenticado.' } }, { status: 401 });
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'catalogo', 'read');

    const barcodes = await ProductRepository.getBarcodesByProductId(params.id, auth.companyId);
    return NextResponse.json({ success: true, data: barcodes }, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error in GET /api/v1/products/[id]/barcodes:', error);
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json({ success: false, error: { message: 'No autenticado.' } }, { status: 401 });
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'catalogo', 'write');

    const body = await req.json();
    const result = addBarcodeSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ success: false, error: { message: result.error.issues[0].message } }, { status: 400 });
    }

    const { barcode, barcodeType } = result.data;
    const newBarcode = await ProductRepository.addBarcode(params.id, auth.companyId, barcode.trim(), barcodeType);

    // Invalidate caches
    await clearCachePattern(`cache:products:${auth.companyId}:*`);

    return NextResponse.json({ success: true, data: newBarcode }, { status: 201, headers: resHeaders });
  } catch (error: any) {
    console.error('Error in POST /api/v1/products/[id]/barcodes:', error);
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json({ success: false, error: { message: 'No autenticado.' } }, { status: 401 });
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'catalogo', 'write');

    const { searchParams } = new URL(req.url);
    const barcodeId = searchParams.get('barcodeId');

    if (!barcodeId) {
      return NextResponse.json({ success: false, error: { message: 'Falta el id del código de barras (barcodeId).' } }, { status: 400 });
    }

    const deleted = await ProductRepository.removeBarcode(barcodeId, auth.companyId);
    if (!deleted) {
      return NextResponse.json({ success: false, error: { message: 'Código de barras no encontrado.' } }, { status: 404 });
    }

    // Invalidate caches
    await clearCachePattern(`cache:products:${auth.companyId}:*`);

    return NextResponse.json({ success: true, data: deleted }, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error in DELETE /api/v1/products/[id]/barcodes:', error);
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}
