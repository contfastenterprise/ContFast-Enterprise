import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission, isAdminOrSistemas } from '@/middleware/permissions';
import { db, retentions } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['ITBIS', 'ISR', 'OTRA']).optional(),
  percentage: z.number().positive().max(100).optional(),
  active: z.boolean().optional(),
});

// PUT — update a retention
export async function PUT(req: NextRequest, { params }: { params: Promise<any> }) {
  const { id } = await params;
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);
  if (!auth) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } }, { status: 401 });
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'administracion', 'write');
    const body = await req.json();
    const data = updateSchema.parse(body);

    // Only allow editing company-owned retentions (not global ones)
    const existing = await db.select().from(retentions).where(eq(retentions.id, id)).limit(1);
    if (!existing.length) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Retención no encontrada.' } }, { status: 404, headers: resHeaders });
    }

    const isGlobal = existing[0].companyId === null;
    const isOwner = existing[0].companyId === auth.companyId;

    if (!isGlobal && !isOwner) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'No autorizado.' } }, { status: 403, headers: resHeaders });
    }

    const updatePayload: Record<string, any> = {};

    if (isGlobal) {
      // Global retentions: only allow toggling active
      if (data.active !== undefined) updatePayload.active = data.active;
      if (data.name !== undefined || data.type !== undefined || data.percentage !== undefined) {
        return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Las retenciones globales del sistema solo se pueden activar/desactivar.' } }, { status: 403, headers: resHeaders });
      }
    } else {
      // Company retentions: full edit
      if (data.name !== undefined) updatePayload.name = data.name;
      if (data.type !== undefined) updatePayload.type = data.type;
      if (data.percentage !== undefined) updatePayload.percentage = String(data.percentage);
      if (data.active !== undefined) updatePayload.active = data.active;
    }

    const [updated] = await db.update(retentions).set(updatePayload).where(eq(retentions.id, id)).returning();

    return NextResponse.json({ success: true, data: updated }, { headers: resHeaders });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.issues[0].message } }, { status: 400, headers: resHeaders });
    }
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } }, { status: error.status || 500, headers: resHeaders });
  }
}

// DELETE — soft delete (set active = false) or hard delete company retentions
export async function DELETE(req: NextRequest, { params }: { params: Promise<any> }) {
  const { id } = await params;
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);
  if (!auth) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } }, { status: 401 });
  }

  try {
    if (!isAdminOrSistemas(auth.role)) {
      return NextResponse.json({
        success: false,
        error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'No tiene permisos para realizar esta acción. Solo usuarios de administración o sistemas pueden eliminar o anular registros.' }
      }, { status: 403, headers: resHeaders });
    }

    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'administracion', 'write');

    const existing = await db.select().from(retentions).where(eq(retentions.id, id)).limit(1);
    if (!existing.length) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Retención no encontrada.' } }, { status: 404, headers: resHeaders });
    }

    if (existing[0].companyId === null) {
      // Retencion global (company_id NULL): aplica a TODAS las empresas.
      //
      // Desactivarla la apaga para todas, no solo para quien pulsa el boton, y
      // desde la aplicacion no hay forma de volver a activarla. Por eso queda
      // reservada al rol sistemas, que es el operador del servicio, igual que
      // en admin/subscriptions. Antes podia hacerlo cualquier usuario con
      // permiso de administracion de cualquier empresa.
      //
      // Nota: la aplicacion tampoco puede CREAR retenciones globales -- el POST
      // fija siempre companyId: auth.companyId --, asi que estas filas solo
      // pueden venir de la base. Si en el futuro se quiere que cada empresa las
      // desactive por su cuenta, hace falta una tabla de excepciones por
      // empresa; apagar la fila compartida no es eso.
      if (auth.role !== 'sistemas') {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Esta retención es global y aplica a todas las empresas. Solo el rol sistemas puede desactivarla.' } },
          { status: 403, headers: resHeaders }
        );
      }
      await db.update(retentions).set({ active: false }).where(eq(retentions.id, id));
      return NextResponse.json({ success: true, message: 'Retención global desactivada.' }, { headers: resHeaders });
    }

    if (existing[0].companyId !== auth.companyId) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'No autorizado.' } }, { status: 403, headers: resHeaders });
    }

    await db.delete(retentions).where(eq(retentions.id, id));
    return NextResponse.json({ success: true }, { headers: resHeaders });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } }, { status: error.status || 500, headers: resHeaders });
  }
}
