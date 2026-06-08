import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, ecfSequences } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'write');

    const body = await req.json();
    const { status } = body;

    if (!status || !['active', 'inactive'].includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'status debe ser "active" o "inactive".' },
        },
        { status: 400, headers: resHeaders }
      );
    }

    const [updated] = await db
      .update(ecfSequences)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(ecfSequences.id, id), eq(ecfSequences.companyId, auth.companyId)))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Secuencia no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: updated, message: `Secuencia ${status === 'active' ? 'activada' : 'desactivada'} exitosamente.` },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in PUT /api/v1/ecf/sequences/[id]:', error);
    const status = error.status || 500;
    return NextResponse.json(
      { success: false, error: { code: error.code || 'SERVER_ERROR', message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
