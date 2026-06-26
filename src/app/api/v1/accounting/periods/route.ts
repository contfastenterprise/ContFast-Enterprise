import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { db, accountingPeriods } from '@/db';
import { eq, and, desc } from 'drizzle-orm';
import { enforcePermission } from '@/middleware/permissions';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const createPeriodSchema = z.object({
  name: z.string().min(1, 'El nombre del periodo es requerido (ej: MM/AAAA)'),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Fecha de inicio inválida'),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Fecha de fin inválida'),
});

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const resHeaders = new Headers();
    const session = await verifyAuth(req, resHeaders);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    await enforcePermission(session.userId, session.role, session.roleId, 'contabilidad', 'read');

    const periods = await db.select()
      .from(accountingPeriods)
      .where(eq(accountingPeriods.companyId, session.companyId))
      .orderBy(desc(accountingPeriods.startDate));

    return NextResponse.json({ success: true, data: periods }, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error fetching periods:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const resHeaders = new Headers();
    const session = await verifyAuth(req, resHeaders);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    await enforcePermission(session.userId, session.role, session.roleId, 'contabilidad', 'write');

    const body = await req.json();
    const parsed = createPeriodSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    // Check if period already exists
    const existing = await db.select().from(accountingPeriods)
      .where(and(
        eq(accountingPeriods.companyId, session.companyId),
        eq(accountingPeriods.name, parsed.data.name)
      ))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'Ya existe un período contable con este nombre.' } },
        { status: 409 }
      );
    }

    const [period] = await db.insert(accountingPeriods).values({
      id: uuidv4(),
      companyId: session.companyId,
      name: parsed.data.name,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      status: 'open',
    }).returning();

    return NextResponse.json({ success: true, data: period }, { status: 201, headers: resHeaders });
  } catch (error: any) {
    console.error('Error creating period:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
