import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, ecfSequences, invoices } from '@/db';
import { eq, and, isNull, count, sql } from 'drizzle-orm';
import { checkRateLimit } from '@/middleware/rateLimiter';

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const allowed = await checkRateLimit(ip, 'standard');
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
      { status: 429 }
    );
  }

  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'read');

    const sequences = await db
      .select()
      .from(ecfSequences)
      .where(and(eq(ecfSequences.companyId, auth.companyId), isNull(ecfSequences.deletedAt)))
      .orderBy(ecfSequences.ecfType);

    // Get the invoice usage count for all sequence types in a single grouped query
    const usages = await db
      .select({
        ecfType: invoices.ecfType,
        usedCount: count(),
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.companyId, auth.companyId),
          isNull(invoices.deletedAt)
        )
      )
      .groupBy(invoices.ecfType);

    const usagesMap = new Map(usages.map(u => [u.ecfType, Number(u.usedCount)]));

    const result = sequences.map((seq) => ({
      ...seq,
      usedCount: usagesMap.get(seq.ecfType) || 0,
    }));

    return NextResponse.json({ success: true, data: result }, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error in GET /api/v1/ecf/sequences:', error);
    const status = error.status || 500;
    return NextResponse.json(
      { success: false, error: { code: error.code || 'SERVER_ERROR', message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const allowed = await checkRateLimit(ip, 'standard');
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
      { status: 429 }
    );
  }

  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'write');

    const body = await req.json();
    const { ecfType, prefix, startSequence, maxSequence, sequenceExpiry } = body;

    const startSeq = parseInt(startSequence, 10);
    const maxSeq = parseInt(maxSequence, 10);

    if (isNaN(startSeq) || isNaN(maxSeq)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'startSequence y maxSequence deben ser números válidos.' },
        },
        { status: 400, headers: resHeaders }
      );
    }

    if (maxSeq < startSeq) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'La secuencia máxima (hasta) no puede ser menor que la secuencia inicial (desde).' },
        },
        { status: 400, headers: resHeaders }
      );
    }

    // Validate sequenceExpiry format dd-MM-yyyy
    if (sequenceExpiry && !/^\d{2}-\d{2}-\d{4}$/.test(sequenceExpiry)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'sequenceExpiry debe estar en formato dd-MM-yyyy.' },
        },
        { status: 400, headers: resHeaders }
      );
    }

    // Check if there is already an active sequence for this ecfType (category)
    const [existingActive] = await db
      .select({ id: ecfSequences.id })
      .from(ecfSequences)
      .where(
        and(
          eq(ecfSequences.companyId, auth.companyId),
          eq(ecfSequences.ecfType, ecfType),
          eq(ecfSequences.status, 'active'),
          isNull(ecfSequences.deletedAt)
        )
      )
      .limit(1);

    if (existingActive) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Ya existe una secuencia activa para esta categoría de comprobante. Debe desactivarla o inactivarla antes de poder registrar una nueva.',
          },
        },
        { status: 400, headers: resHeaders }
      );
    }

    const [newSeq] = await db
      .insert(ecfSequences)
      .values({
        companyId: auth.companyId,
        ecfType,
        prefix: prefix || 'E',
        currentSequence: startSeq - 1, // Will be incremented on first use
        maxSequence: maxSeq,
        sequenceExpiry: sequenceExpiry || null,
        status: 'active',
      })
      .returning();

    return NextResponse.json(
      { success: true, data: newSeq, message: 'Secuencia SACF creada exitosamente.' },
      { status: 201, headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/ecf/sequences:', error);
    const status = error.status || 500;
    return NextResponse.json(
      { success: false, error: { code: error.code || 'SERVER_ERROR', message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
