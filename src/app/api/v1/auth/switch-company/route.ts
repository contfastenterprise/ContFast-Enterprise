import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, createSession, clearSession } from '@/middleware/auth';
import { db, companies, auditLogs } from '@/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const switchCompanySchema = z.object({
  newCompanyId: z.string().uuid('ID de empresa inválido'),
});

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autenticado' } }, { status: 401 });
    }

    // Solo el rol sistemas puede cambiar de empresa
    if (session.role !== 'sistemas') {
      return NextResponse.json(
        { success: false, error: { message: 'No autorizado. Solo el rol sistemas puede cambiar de empresa.' } }, 
        { status: 403 }
      );
    }

    const body = await req.json();
    const result = switchCompanySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { message: result.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { newCompanyId } = result.data;

    // Verificar si la empresa destino existe y está activa
    const [targetCompany] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, newCompanyId))
      .limit(1);

    if (!targetCompany || targetCompany.status !== 'active') {
      return NextResponse.json(
        { success: false, error: { message: 'La empresa seleccionada no existe o está inactiva.' } },
        { status: 400 }
      );
    }

    // Generar nuevos headers para las cookies
    const resHeaders = new Headers();
    const ipAddress = req.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = req.headers.get('user-agent') || '';

    // Invalidar sesión actual
    await clearSession(session.sessionId, resHeaders);

    // Crear nueva sesión apuntando al nuevo companyId
    await createSession(
      session.userId,
      newCompanyId,
      session.role,
      session.roleId,
      ipAddress,
      userAgent,
      resHeaders
    );

    // Registrar en auditoría el cambio de empresa
    await db.insert(auditLogs).values({
      companyId: newCompanyId,
      userId: session.userId,
      action: 'switch_company',
      entityType: 'companies',
      entityId: newCompanyId,
      newValues: { fromCompanyId: session.companyId, toCompanyId: newCompanyId },
      ipAddress,
    });

    return NextResponse.json(
      { success: true, message: 'Cambio de empresa exitoso', data: { company: targetCompany } },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error switching company:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Error interno del servidor' } },
      { status: 500 }
    );
  }
}
