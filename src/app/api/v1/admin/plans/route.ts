import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { db, plans } from '@/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { enforcePermission } from '@/middleware/permissions';

const createPlanSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  description: z.string().optional().default(''),
  price: z.number().min(0, 'El precio no puede ser negativo'),
  maxEcfLimit: z.number().int('Debe ser entero').min(-1, 'Debe ser -1 (ilimitado) o mayor'),
  maxUsers: z.number().int('Debe ser entero').min(-1, 'Debe ser -1 (ilimitado) o mayor'),
  maxWarehouses: z.number().int('Debe ser entero').min(1, 'Debe ser al menos 1'),
  active: z.boolean().optional().default(true),
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

    // Only sistemas or administration can list plans
    await enforcePermission(session.userId, session.role, session.roleId, 'administracion', 'read');

    const allPlans = await db.select().from(plans).orderBy(plans.price);
    return NextResponse.json({ success: true, data: allPlans }, { headers: resHeaders });
  } catch (err: any) {
    console.error('Error listing plans:', err);
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

    // Strict validation: Only systems administrator can create plans
    if (session.role !== 'sistemas') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado. Solo el rol sistemas puede crear planes.' } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = createPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const [newPlan] = await db.insert(plans).values({
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price.toString(), // DB DECIMAL stores as string in Drizzle mapping
      maxEcfLimit: parsed.data.maxEcfLimit,
      maxUsers: parsed.data.maxUsers,
      maxWarehouses: parsed.data.maxWarehouses,
      active: parsed.data.active,
      updatedAt: new Date(),
    }).returning();

    return NextResponse.json({ success: true, data: newPlan }, { status: 201, headers: resHeaders });
  } catch (err: any) {
    console.error('Error creating plan:', err);
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, { status: 500 });
  }
}
