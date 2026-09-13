import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, ecfSequences } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { diaDesdeFechaDgii } from '@/services/dgii/fechaDgii';

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

    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'facturacion', 'write');

    const body = await req.json();
    const { status, currentSequence, maxSequence, sequenceExpiry } = body;

    const updateFields: Partial<typeof ecfSequences.$inferInsert> = { updatedAt: new Date() };

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
      if (sequenceExpiry === null || (typeof sequenceExpiry === 'string' && sequenceExpiry.trim() === '')) {
        updateFields.sequenceExpiry = null;
        updateFields.expiryDate = null;
      } else if (typeof sequenceExpiry !== 'string') {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Fecha de vencimiento debe ser una cadena válida.' } },
          { status: 400, headers: resHeaders }
        );
      } else {
        const trimmed = sequenceExpiry.trim();
        // Antes esto era /^\d{2}-\d{2}-\d{4}$/, que comprueba la FORMA y no la
        // fecha: '32-13-2026' y '31-02-2026' pasaban enteras. Y este texto se
        // guarda tal cual en `sequence_expiry`, que es lo PRIMERO que
        // `vencimientoSecuencia` devuelve, asi que una fecha imposible viajaba
        // dentro del e-CF hasta la DGII.
        //
        // El `new Date(anio, mes, dia)` que derivaba `expiry_date` lo empeoraba:
        // ese constructor normaliza en silencio, y el 32 de enero se guardaba
        // como el 1 de febrero. Las dos columnas de la misma secuencia acababan
        // diciendo cosas distintas, y la que se envia era la imposible.
        const dia = diaDesdeFechaDgii(trimmed);
        if (!dia) {
          return NextResponse.json(
            { success: false, error: { code: 'VALIDATION_ERROR', message: 'La fecha de vencimiento debe ser una fecha real en formato dd-MM-yyyy.' } },
            { status: 400, headers: resHeaders }
          );
        }
        updateFields.sequenceExpiry = trimmed;
        updateFields.expiryDate = dia;
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
  } catch (error: unknown) {
    console.error('Error in PUT /api/v1/ecf/sequences/[id]:', error);
    const e = error as Error & { status?: number; code?: string };
    const status = e.status || 500;
    return NextResponse.json(
      { success: false, error: { code: e.code || 'SERVER_ERROR', message: e.message } },
      { status, headers: resHeaders }
    );
  }
}
