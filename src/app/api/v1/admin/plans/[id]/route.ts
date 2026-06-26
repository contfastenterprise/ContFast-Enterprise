import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { db, plans } from '@/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updatePlanSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').optional(),
  description: z.string().optional(),
  price: z.number().min(0, 'El precio no puede ser negativo').optional(),
  maxEcfLimit: z.number().int().min(-1).optional(),
  maxUsers: z.number().int().min(-1).optional(),
  maxWarehouses: z.number().int().min(1).optional(),
  active: z.boolean().optional(),
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

    // Strict validation: Only systems administrator can update plans
    if (session.role !== 'sistemas') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado. Solo el rol sistemas puede modificar planes.' } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updatePlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
        { status: 400 }
      );
    }

    const [existing] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Plan no encontrado' } },
        { status: 404 }
      );
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.price !== undefined) updateData.price = parsed.data.price.toString();
    if (parsed.data.maxEcfLimit !== undefined) updateData.maxEcfLimit = parsed.data.maxEcfLimit;
    if (parsed.data.maxUsers !== undefined) updateData.maxUsers = parsed.data.maxUsers;
    if (parsed.data.maxWarehouses !== undefined) updateData.maxWarehouses = parsed.data.maxWarehouses;
    if (parsed.data.active !== undefined) updateData.active = parsed.data.active;

    const [updatedPlan] = await db.update(plans)
      .set(updateData)
      .where(eq(plans.id, id))
      .returning();

    return NextResponse.json({ success: true, data: updatedPlan }, { headers: resHeaders });
  } catch (err: any) {
    console.error('Error updating plan:', err);
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, { status: 500 });
  }
}
