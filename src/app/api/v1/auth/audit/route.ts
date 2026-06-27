import { NextRequest, NextResponse } from 'next/server';
import { RbacService } from '@/services/auth/rbacService';
import { verifyAuth } from '@/middleware/auth';
import { z } from 'zod';

const auditSchema = z.object({
  route: z.string(),
  method: z.string().max(10),
  allowed: z.boolean(),
  reason: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    const body = await req.json();
    
    const parsed = auditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const ipAddress = req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown';

    // Log the access attempt using the helper service
    await RbacService.logAccessAttempt(
      auth ? auth.companyId : null,
      auth ? auth.userId : null,
      ipAddress,
      parsed.data.route,
      parsed.data.method,
      parsed.data.allowed,
      parsed.data.reason
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Audit API Error]:', err);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } },
      { status: 500 }
    );
  }
}
