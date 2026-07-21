import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { ProductRepository } from '@/repositories/productRepository';

export async function GET(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json({ success: false, error: { message: 'No autenticado.' } }, { status: 401 });
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'catalogo', 'read');

    const nextBarcode = await ProductRepository.getNextBarcode(auth.companyId);
    return NextResponse.json({ success: true, barcode: nextBarcode }, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error in GET /api/v1/products/next-barcode:', error);
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}
