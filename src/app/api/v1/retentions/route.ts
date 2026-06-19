import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, retentions } from '@/db';
import { eq, and, or, isNull } from 'drizzle-orm';
import { z } from 'zod';

const retentionSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  type: z.enum(['ITBIS', 'ISR', 'OTRA']),
  percentage: z.number().positive().max(100),
  active: z.boolean().optional().default(true),
});

// GET — list all retentions for the company
export async function GET(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);
  if (!auth) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } }, { status: 401 });
  }

  try {
    const list = await db
      .select()
      .from(retentions)
      .where(or(isNull(retentions.companyId), eq(retentions.companyId, auth.companyId)))
      .orderBy(retentions.type, retentions.name);

    return NextResponse.json({ success: true, data: list }, { headers: resHeaders });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } }, { status: 500, headers: resHeaders });
  }
}

// POST — create a new retention type
export async function POST(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);
  if (!auth) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } }, { status: 401 });
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'administracion', 'write');
    const body = await req.json();
    const data = retentionSchema.parse(body);

    const [created] = await db.insert(retentions).values({
      companyId: auth.companyId,
      name: data.name,
      type: data.type,
      percentage: String(data.percentage),
      active: data.active ?? true,
    }).returning();

    return NextResponse.json({ success: true, data: created }, { status: 201, headers: resHeaders });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.issues[0].message } }, { status: 400, headers: resHeaders });
    }
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } }, { status: error.status || 500, headers: resHeaders });
  }
}
