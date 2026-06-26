import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { isAdminOrSistemas } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { SupplierRepository } from '@/repositories/supplierRepository';
import { z } from 'zod';

const updateSupplierSchema = z.object({
  rnc: z.string().min(9).max(15).optional(),
  name: z.string().min(2).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const supplier = await SupplierRepository.findById(id, session.companyId);
    if (!supplier) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Proveedor no encontrado' } }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: supplier });
  } catch (error: any) {
    console.error('Error fetching supplier:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const body = await req.json();
    const parsed = updateSupplierSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const updated = await SupplierRepository.update(id, session.companyId, parsed.data);
    if (!updated) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Proveedor no encontrado' } }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Error updating supplier:', error);
    const isDuplicate = error.message.includes('en uso');
    return NextResponse.json(
      { success: false, error: { code: isDuplicate ? 'CONFLICT' : 'SERVER_ERROR', message: error.message } },
      { status: isDuplicate ? 409 : 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    if (!isAdminOrSistemas(session.role)) {
      return NextResponse.json({
        success: false,
        error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'No tiene permisos para realizar esta acción. Solo usuarios de administración o sistemas pueden eliminar o anular registros.' }
      }, { status: 403 });
    }

    const deleted = await SupplierRepository.softDelete(id, session.companyId);
    if (!deleted) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Proveedor no encontrado' } }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Proveedor eliminado correctamente' });
  } catch (error: any) {
    console.error('Error deleting supplier:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
