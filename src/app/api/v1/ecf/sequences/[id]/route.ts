import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, ecfSequences } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { checkRateLimit } from '@/middleware/rateLimiter';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const allowed = await checkRateLimit(ip, 'standard');
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
      { status: 429 }
    );
  }

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

    // Enforce systems role constraint
    if (auth.role !== 'sistemas') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado. Solo el usuario de sistemas puede modificar las secuencias.' } },
        { status: 403, headers: resHeaders }
      );
    }

    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'write');

    const body = await req.json();
    const { status, currentSequence, maxSequence, sequenceExpiry } = body;

    const updateFields: any = { updatedAt: new Date() };

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'status debe ser "active" o "inactive".' },
          },
          { status: 400, headers: resHeaders }
        );
      }
      updateFields.status = status;
    }

    if (currentSequence !== undefined) {
      const seqNum = Number(currentSequence);
      if (isNaN(seqNum) || seqNum < 0) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Secuencia actual debe ser un número positivo.' } },
          { status: 400, headers: resHeaders }
        );
      }
      updateFields.currentSequence = Math.floor(seqNum);
    }

    if (maxSequence !== undefined) {
      const maxNum = Number(maxSequence);
      if (isNaN(maxNum) || maxNum <= 0) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Secuencia máxima debe ser un número mayor a cero.' } },
          { status: 400, headers: resHeaders }
        );
      }
      updateFields.maxSequence = Math.floor(maxNum);
    }

    if (sequenceExpiry !== undefined) {
      if (typeof sequenceExpiry !== 'string' || sequenceExpiry.trim() === '') {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Fecha de vencimiento debe ser una cadena válida.' } },
          { status: 400, headers: resHeaders }
        );
      }
      updateFields.sequenceExpiry = sequenceExpiry.trim();
      
      const parts = sequenceExpiry.split('-');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        const dateObj = new Date(year, month, day);
        if (!isNaN(dateObj.getTime())) {
          const yyyy = dateObj.getFullYear();
          const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
          const dd = String(dateObj.getDate()).padStart(2, '0');
          updateFields.expiryDate = `${yyyy}-${mm}-${dd}`;
        }
      }
    }

    const [updated] = await db
      .update(ecfSequences)
      .set(updateFields)
      .where(and(eq(ecfSequences.id, id), eq(ecfSequences.companyId, auth.companyId)))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Secuencia no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: updated, message: 'Secuencia actualizada exitosamente.' },
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
