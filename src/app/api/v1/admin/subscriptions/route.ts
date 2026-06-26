import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { db, subscriptions, plans, companies } from '@/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { enforcePermission } from '@/middleware/permissions';

const createSubscriptionSchema = z.object({
  companyId: z.string().uuid('ID de compañía inválido'),
  planId: z.string().uuid('ID de plan inválido'),
  status: z.enum(['active', 'past_due', 'canceled', 'trialing']).optional().default('active'),
  currentPeriodStart: z.string().datetime({ message: 'Fecha de inicio inválida (ISO format)' }),
  currentPeriodEnd: z.string().datetime({ message: 'Fecha de fin inválida (ISO format)' }),
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

    // Only systems or administration role can see subscriptions
    await enforcePermission(session.userId, session.role, session.roleId, 'administracion', 'read');

    const results = await db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        currentPeriodStart: subscriptions.currentPeriodStart,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        createdAt: subscriptions.createdAt,
        companyId: subscriptions.companyId,
        companyName: companies.name,
        companyRnc: companies.rnc,
        planId: subscriptions.planId,
        planName: plans.name,
        planPrice: plans.price,
        maxEcfLimit: plans.maxEcfLimit,
        maxUsers: plans.maxUsers,
        maxWarehouses: plans.maxWarehouses,
      })
      .from(subscriptions)
      .innerJoin(companies, eq(subscriptions.companyId, companies.id))
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .orderBy(subscriptions.createdAt);

    return NextResponse.json({ success: true, data: results }, { headers: resHeaders });
  } catch (err: any) {
    console.error('Error listing subscriptions:', err);
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, { status: 500 });
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

    // Only systems administrator can create/assign subscriptions manually
    if (session.role !== 'sistemas') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado. Solo el rol sistemas puede asignar suscripciones.' } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    // Verify company and plan exist
    const [company] = await db.select().from(companies).where(eq(companies.id, parsed.data.companyId)).limit(1);
    if (!company) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Compañía no encontrada' } },
        { status: 404 }
      );
    }

    const [plan] = await db.select().from(plans).where(eq(plans.id, parsed.data.planId)).limit(1);
    if (!plan) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Plan no encontrado' } },
        { status: 404 }
      );
    }

    // Check if there is an active/existing subscription for this company to deactivate/overwrite
    // (A company should only have one subscription at a time)
    await db.update(subscriptions)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(and(eq(subscriptions.companyId, parsed.data.companyId), eq(subscriptions.status, 'active')));

    const [newSub] = await db.insert(subscriptions).values({
      companyId: parsed.data.companyId,
      planId: parsed.data.planId,
      status: parsed.data.status,
      currentPeriodStart: new Date(parsed.data.currentPeriodStart),
      currentPeriodEnd: new Date(parsed.data.currentPeriodEnd),
      updatedAt: new Date(),
    }).returning();

    return NextResponse.json({ success: true, data: newSub }, { status: 201, headers: resHeaders });
  } catch (err: any) {
    console.error('Error creating subscription:', err);
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, { status: 500 });
  }
}
