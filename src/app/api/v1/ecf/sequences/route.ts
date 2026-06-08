import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, ecfSequences, invoices } from '@/db';
import { eq, and, isNull, count, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
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

    // For each sequence, count how many invoices used it
    const result = await Promise.all(
      sequences.map(async (seq) => {
        const [usage] = await db
          .select({ usedCount: count() })
          .from(invoices)
          .where(
            and(
              eq(invoices.companyId, auth.companyId),
              eq(invoices.ecfType, seq.ecfType),
              isNull(invoices.deletedAt)
            )
          );

        return {
          ...seq,
          usedCount: Number(usage?.usedCount || 0),
        };
      })
    );

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

    if (!ecfType || !startSequence || !maxSequence) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'ecfType, startSequence y maxSequence son requeridos.' },
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

    const [newSeq] = await db
      .insert(ecfSequences)
      .values({
        companyId: auth.companyId,
        ecfType,
        prefix: prefix || 'E',
        currentSequence: parseInt(startSequence, 10) - 1, // Will be incremented on first use
        maxSequence: parseInt(maxSequence, 10),
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
