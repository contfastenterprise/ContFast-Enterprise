import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { db, subscriptions, plans } from '@/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateSubscriptionSchema = z.object({
  planId: z.string().uuid().optional(),
  status: z.enum(['active', 'past_due', 'canceled', 'trialing']).optional(),
  currentPeriodStart: z.string().datetime().optional(),
  currentPeriodEnd: z.string().datetime().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const resHeaders = new Headers();
    const session = await verifyAuth(req, resHeaders);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    // Only systems administrator can update subscriptions
    if (session.role !== 'sistemas') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado. Solo el rol sistemas puede modificar suscripciones.' } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Suscripción no encontrada' } },
        { status: 404 }
      );
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (parsed.data.planId !== undefined) {
      const [plan] = await db.select().from(plans).where(eq(plans.id, parsed.data.planId)).limit(1);
      if (!plan) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Plan seleccionado no existe' } },
          { status: 404 }
        );
      }
      updateData.planId = parsed.data.planId;
    }

    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.currentPeriodStart !== undefined) updateData.currentPeriodStart = new Date(parsed.data.currentPeriodStart);
    if (parsed.data.currentPeriodEnd !== undefined) updateData.currentPeriodEnd = new Date(parsed.data.currentPeriodEnd);

    const [updatedSub] = await db.update(subscriptions)
      .set(updateData)
      .where(eq(subscriptions.id, id))
      .returning();

    return NextResponse.json({ success: true, data: updatedSub }, { headers: resHeaders });
  } catch (err: any) {
    console.error('Error updating subscription:', err);
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, { status: 500 });
  }
}
