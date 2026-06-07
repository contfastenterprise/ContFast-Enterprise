import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { db, journalEntries, journalEntryLines, chartOfAccounts, auditLogs } from '@/db';
import { eq, and, isNull, gte, lte, desc, count, inArray } from 'drizzle-orm';
import { AccountRepository } from '@/repositories/accountRepository';

const createJournalEntrySchema = z.object({
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Fecha inválida',
  }).transform((val) => new Date(val)),
  description: z.string().min(5, 'La descripción debe tener al menos 5 caracteres'),
  reference: z.string().optional(),
  lines: z.array(
    z.object({
      accountId: z.string().uuid('ID de cuenta contable inválido'),
      debit: z.number().nonnegative('El débito no puede ser negativo'),
      credit: z.number().nonnegative('El crédito no puede ser negativo'),
    })
  ).min(2, 'Debe incluir al menos dos líneas para partida doble'),
});

/**
 * GET /api/v1/accounting/entries - List journal entries
 */
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
    // Enforce "contabilidad:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'contabilidad', 'read');

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '20', 10);
    const startDateStr = searchParams.get('start_date');
    const endDateStr = searchParams.get('end_date');
    const reference = searchParams.get('reference');

    const conditions = [
      eq(journalEntries.companyId, auth.companyId),
      isNull(journalEntries.deletedAt)
    ];

    if (startDateStr) {
      conditions.push(gte(journalEntries.date, startDateStr));
    }
    if (endDateStr) {
      conditions.push(lte(journalEntries.date, endDateStr));
    }
    if (reference) {
      conditions.push(eq(journalEntries.reference, reference));
    }

    const offset = (page - 1) * perPage;

    // Count total entries
    const [totalResult] = await db
      .select({ value: count() })
      .from(journalEntries)
      .where(and(...conditions));

    const total = totalResult?.value || 0;

    // Fetch entries
    const entriesList = await db
      .select()
      .from(journalEntries)
      .where(and(...conditions))
      .orderBy(desc(journalEntries.date), desc(journalEntries.createdAt))
      .limit(perPage)
      .offset(offset);

    // Fetch lines for these entries
    const entryIds = entriesList.map((e) => e.id);
    let mappedEntries = entriesList.map((e) => ({ ...e, lines: [] as any[] }));

    if (entryIds.length > 0) {
      const lines = await db
        .select({
          id: journalEntryLines.id,
          journalEntryId: journalEntryLines.journalEntryId,
          accountId: journalEntryLines.accountId,
          debit: journalEntryLines.debit,
          credit: journalEntryLines.credit,
          accountCode: chartOfAccounts.code,
          accountName: chartOfAccounts.name,
        })
        .from(journalEntryLines)
        .innerJoin(chartOfAccounts, eq(journalEntryLines.accountId, chartOfAccounts.id))
        .where(
          and(
            inArray(journalEntryLines.journalEntryId, entryIds),
            eq(journalEntryLines.companyId, auth.companyId)
          )
        );

      mappedEntries = entriesList.map((entry) => {
        return {
          ...entry,
          lines: lines.filter((l) => l.journalEntryId === entry.id),
        };
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: mappedEntries,
        meta: {
          page,
          per_page: perPage,
          total,
          total_pages: Math.ceil(total / perPage),
        },
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/accounting/entries:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

/**
 * POST /api/v1/accounting/entries - Create a manual double-entry journal entry
 */
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
    // Enforce "contabilidad:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'contabilidad', 'write');

    const body = await req.json();
    const result = createJournalEntrySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    const { date, description, reference, lines } = result.data;

    // Verify all accountIds belong to the same company
    const accountIds = lines.map((l) => l.accountId);
    const matchedAccounts = await db
      .select({ id: chartOfAccounts.id })
      .from(chartOfAccounts)
      .where(
        and(
          inArray(chartOfAccounts.id, accountIds),
          eq(chartOfAccounts.companyId, auth.companyId),
          isNull(chartOfAccounts.deletedAt)
        )
      );

    if (matchedAccounts.length !== new Set(accountIds).size) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_ACCOUNT_ID', message: 'Una o más cuentas contables especificadas no existen o no pertenecen a su empresa.' } },
        { status: 400, headers: resHeaders }
      );
    }

    // Process double-entry creation
    const entry = await db.transaction(async (tx) => {
      const insertedEntry = await AccountRepository.createJournalEntry(tx, {
        companyId: auth.companyId,
        date,
        description,
        reference,
        lines,
      });

      // Register audit log
      await tx.insert(auditLogs).values({
        companyId: auth.companyId,
        userId: auth.userId,
        action: 'manual_journal_entry_created',
        entityType: 'journal_entries',
        entityId: insertedEntry.id,
        newValues: { description, reference, totalLines: lines.length },
        ipAddress: req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown',
      });

      return insertedEntry;
    });

    return NextResponse.json(
      { success: true, message: 'Asiento contable registrado exitosamente.', data: entry },
      { status: 201, headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/accounting/entries:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
