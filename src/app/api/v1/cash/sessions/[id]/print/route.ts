import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { cashSessions, cashMovements, cashRegisters } from '@/db/schema/cash';
import { invoices } from '@/db/schema/invoices';
import { users } from '@/db/schema/auth';
import { companies, companySettings } from '@/db/schema/companies';
import { eq, inArray } from 'drizzle-orm';
import { customerReceiptApplied, accountsReceivable } from '@/db/schema/accounting';
import { verifyAuth } from '@/middleware/auth';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { PdfGenerator } from '@/services/print/pdfGenerator';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return NextResponse.json({ error: { message: 'No autorizado.' } }, { status: 401 });
    }

    const { id } = await params;

    // 1. Fetch Company Info
    const [settings] = await db
      .select({ logoUrl: companySettings.logoUrl })
      .from(companySettings)
      .where(eq(companySettings.companyId, auth.companyId))
      .limit(1);
    const logoUrl = settings?.logoUrl || null;

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, auth.companyId))
      .limit(1);

    // 2. Fetch Session Info
    const [cashSession] = await db
      .select({
        id: cashSessions.id,
        openedAt: cashSessions.openedAt,
        closedAt: cashSessions.closedAt,
        initialBalance: cashSessions.initialBalance,
        expectedBalance: cashSessions.expectedBalance,
        actualBalance: cashSessions.actualBalance,
        difference: cashSessions.difference,
        closeObservations: cashSessions.justification,
        registerName: cashRegisters.name,
        userName: users.name,
      })
      .from(cashSessions)
      .leftJoin(cashRegisters, eq(cashSessions.cashRegisterId, cashRegisters.id))
      .leftJoin(users, eq(cashSessions.userId, users.id))
      .where(eq(cashSessions.id, id))
      .limit(1);

    if (!cashSession) {
      return NextResponse.json({ error: { message: 'Sesión no encontrada.' } }, { status: 404 });
    }

    // 3. Fetch Movements
    const rawMovements = await db
      .select({
        id: cashMovements.id,
        type: cashMovements.type,
        amount: cashMovements.amount,
        description: cashMovements.description,
        reference: cashMovements.reference,
        createdAt: cashMovements.createdAt,
        codigoFactura: invoices.codigoFactura,
        invoiceId: cashMovements.invoiceId,
        ncf: invoices.ncf,
      })
      .from(cashMovements)
      .leftJoin(invoices, eq(cashMovements.invoiceId, invoices.id))
      .where(eq(cashMovements.cashSessionId, id))
      .orderBy(cashMovements.createdAt);

    // Buscar UUIDs huérfanos en descripciones y referencias
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const missingInvoiceIds = new Set<string>();

    rawMovements.forEach(m => {
      if (!m.invoiceId) {
        const descMatches = m.description?.match(uuidRegex);
        const refMatches = m.reference?.match(uuidRegex);
        if (descMatches) descMatches.forEach(id => missingInvoiceIds.add(id));
        if (refMatches) refMatches.forEach(id => missingInvoiceIds.add(id));
      }
    });

    const missingInvoicesMap = new Map<string, string>();
    if (missingInvoiceIds.size > 0) {
      const missingIdsArray = Array.from(missingInvoiceIds);
      
      // 1. Direct Invoice UUIDs
      const missingInvoicesData = await db
        .select({ id: invoices.id, codigoFactura: invoices.codigoFactura })
        .from(invoices)
        .where(inArray(invoices.id, missingIdsArray));
      
      missingInvoicesData.forEach(inv => {
        if (inv.codigoFactura) {
          missingInvoicesMap.set(inv.id, inv.codigoFactura);
        }
      });

      // 2. Receipt UUIDs mapping to invoices
      const receiptInvoicesData = await db
        .select({ receiptId: customerReceiptApplied.receiptId, codigoFactura: invoices.codigoFactura })
        .from(customerReceiptApplied)
        .innerJoin(accountsReceivable, eq(customerReceiptApplied.arId, accountsReceivable.id))
        .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
        .where(inArray(customerReceiptApplied.receiptId, missingIdsArray));

      receiptInvoicesData.forEach(row => {
        if (row.codigoFactura) {
          const current = missingInvoicesMap.get(row.receiptId) || '';
          missingInvoicesMap.set(
            row.receiptId, 
            current ? `${current}, ${row.codigoFactura}` : row.codigoFactura
          );
        }
      });
    }

    const movements = rawMovements.map(m => {
      let description = m.description || m.type;
      let reference = m.reference || '';

      // Reemplazar los UUIDs huérfanos por su respectivo código de factura
      missingInvoicesMap.forEach((codigoFactura, uuid) => {
        description = description.replace(uuid, codigoFactura);
        reference = reference.replace(uuid, codigoFactura);
        
        // Si el texto ya tiene el código y es un cobro, limpiarlo para dejar solo el código
        if (m.type === 'cash_in' && (reference.includes(codigoFactura) || description.includes(codigoFactura))) {
          reference = codigoFactura;
        }
      });

      if (m.invoiceId) {
        const targetNumber = m.codigoFactura || 'Factura Sin Número';
        
        // Reemplazar el UUID por el número de factura
        description = description.replace(m.invoiceId, targetNumber);
        reference = reference.replace(m.invoiceId, targetNumber);

        // Si el NCF está en la referencia o descripción, quitarlo o reemplazarlo
        if (m.ncf) {
          description = description.replace(m.ncf, targetNumber);
          reference = reference.replace(m.ncf, targetNumber);
        }

        // Si es un cobro (cash_in) y está atado a una factura, la referencia debe ser solo el número.
        if (m.type === 'cash_in') {
          reference = targetNumber;
        }

        // Si es una venta y no se ve el número de factura por ningún lado, agregarlo.
        if (m.type === 'sale' && !reference.includes(targetNumber)) {
          reference = reference ? `${reference} / Fact: ${targetNumber}` : `Fact: ${targetNumber}`;
        }
      }

      return {
        ...m,
        description,
        reference
      };
    });

    // Calculate totals
    const totalCashIn = movements
      .filter(m => m.type === 'sale' || m.type === 'cash_in')
      .reduce((sum, m) => sum + Number(m.amount), 0);
      
    const totalCashOut = movements
      .filter(m => m.type === 'refund' || m.type === 'cash_out')
      .reduce((sum, m) => sum + Number(m.amount), 0);

    const reportData = {
      company: {
        ...company,
        logoUrl
      },
      session: cashSession,
      movements: movements,
      totals: {
        cashIn: totalCashIn,
        cashOut: totalCashOut
      }
    };

    // 4. Generate HTML and PDF
    const html = DocumentTemplates.renderCashClosureReport(reportData);
    const pdfBuffer = await PdfGenerator.generatePdf(html, 'carta');

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="arqueo_caja.pdf"',
      }
    });

  } catch (error: any) {
    console.error('Error generating cash closure report PDF:', error);
    return NextResponse.json(
      { error: { message: error.message || 'Ocurrió un error al generar el reporte.' } },
      { status: 500 }
    );
  }
}
