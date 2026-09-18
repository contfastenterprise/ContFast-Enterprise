import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { db, declaracionesDgii, withTenantMode } from '@/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { TIPOS_DECLARACION } from '@/services/dgii/declaracionesPendientes';

/**
 * Lote 159: la marca de "este 606/607 ya se presento a la DGII".
 *
 * No sube nada a la DGII ni guarda el fichero: el TXT se genera al descargarlo.
 * Esto es la constancia, y es lo que apaga el aviso del panel.
 */
const esquemaMarca = z.object({
  tipo: z.enum(TIPOS_DECLARACION),
  //  AAAAMM. Se valida la forma aqui porque de aqui sale la clave unica.
  periodo: z.string().regex(/^\d{4}(0[1-9]|1[0-2])$/, 'El período debe ser AAAAMM'),
});

async function sesion(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  if (!(await checkRateLimit(ip, 'standard'))) {
    return { error: NextResponse.json({ success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } }, { status: 429 }) };
  }
  const auth = await verifyAuth(req);
  if (!auth) {
    return { error: NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 }) };
  }
  return { auth };
}

export async function GET(req: NextRequest) {
  try {
    const { auth, error } = await sesion(req);
    if (error) return error;
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'contabilidad', 'read');

    const marcas = await db
      .select({
        tipo: declaracionesDgii.tipo,
        periodo: declaracionesDgii.periodo,
        presentadaEn: declaracionesDgii.presentadaEn,
      })
      .from(declaracionesDgii)
      .where(withTenantMode(declaracionesDgii, { companyId: auth.companyId, modo: auth.modo }));

    return NextResponse.json({ success: true, data: marcas });
  } catch (error: unknown) {
    const e = error as Error & { status?: number };
    console.error('Error listando declaraciones:', error);
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: e.message } }, { status: e.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { auth, error } = await sesion(req);
    if (error) return error;
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'contabilidad', 'write');

    const parsed = esquemaMarca.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }, { status: 400 });
    }

    //  `onConflictDoNothing`: marcar dos veces el mismo periodo no es un dato
    //  nuevo, y quien lo pulse dos veces no tiene por que ver un error.
    await db
      .insert(declaracionesDgii)
      .values({
        companyId: auth.companyId,
        modo: auth.modo,
        tipo: parsed.data.tipo,
        periodo: parsed.data.periodo,
        presentadaPor: auth.userId,
      })
      .onConflictDoNothing();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const e = error as Error & { status?: number };
    console.error('Error marcando declaración:', error);
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: e.message } }, { status: e.status || 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { auth, error } = await sesion(req);
    if (error) return error;
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'contabilidad', 'write');

    const { searchParams } = new URL(req.url);
    const parsed = esquemaMarca.safeParse({ tipo: searchParams.get('tipo'), periodo: searchParams.get('periodo') });
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }, { status: 400 });
    }

    //  Se puede quitar: marcar por error un periodo apagaria un aviso que hace
    //  falta, y eso tiene que poder deshacerse.
    await db
      .delete(declaracionesDgii)
      .where(and(
        eq(declaracionesDgii.companyId, auth.companyId),
        eq(declaracionesDgii.modo, auth.modo),
        eq(declaracionesDgii.tipo, parsed.data.tipo),
        eq(declaracionesDgii.periodo, parsed.data.periodo)
      ));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const e = error as Error & { status?: number };
    console.error('Error quitando la marca de declaración:', error);
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: e.message } }, { status: e.status || 500 });
  }
}
