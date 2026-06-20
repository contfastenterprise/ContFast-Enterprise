import { NextRequest, NextResponse } from 'next/server';
import { db, expenses, expenseLines, companies, companySettings, suppliers, warehouses } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { eq, and } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return new NextResponse('No autorizado', { status: 401 });
    }

    const { id } = await params;

    // Fetch the expense details
    const expenseResult = await db
      .select({
        id: expenses.id,
        companyId: expenses.companyId,
        warehouseId: expenses.warehouseId,
        supplierId: expenses.supplierId,
        expenseType: expenses.expenseType,
        isMinorExpense: expenses.isMinorExpense,
        ncf: expenses.ncf,
        issueDate: expenses.issueDate,
        paymentDate: expenses.paymentDate,
        amount: expenses.amount,
        itbis: expenses.itbis,
        isc: expenses.isc,
        otherTaxes: expenses.otherTaxes,
        tip: expenses.tip,
        paymentMethod: expenses.paymentMethod,
        description: expenses.description,
        createdAt: expenses.createdAt,
        supplierName: suppliers.name,
        supplierRnc: suppliers.rnc,
        supplierAddress: suppliers.address,
        warehouseName: warehouses.name,
      })
      .from(expenses)
      .leftJoin(suppliers, eq(expenses.supplierId, suppliers.id))
      .leftJoin(warehouses, eq(expenses.warehouseId, warehouses.id))
      .where(and(eq(expenses.id, id), eq(expenses.companyId, session.companyId)))
      .limit(1);

    if (expenseResult.length === 0) {
      return new NextResponse('Compra/Gasto no encontrado.', { status: 404 });
    }

    const expense = expenseResult[0];

    // Fetch company profile and settings
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1);

    const [settings] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, session.companyId))
      .limit(1);

    if (!company) {
      return new NextResponse('Perfil de compañía no encontrado.', { status: 404 });
    }

    // Fetch expense lines
    const lines = await db
      .select()
      .from(expenseLines)
      .where(eq(expenseLines.expenseId, id));

    const docData = {
      company: {
        name: company.name,
        rnc: company.rnc,
        address: company.address || '',
        phone: company.phone || '',
        email: company.email || '',
        logoUrl: settings?.logoUrl || undefined,
      },
      supplier: {
        name: expense.supplierName || 'N/A',
        rnc: expense.supplierRnc || 'N/A',
        address: expense.supplierAddress || '',
      },
      purchase: expense,
      lines: lines,
    };

    const html = DocumentTemplates.renderPurchase(docData);
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, 'carta');

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', `inline; filename="compra_${expense.id.slice(0, 8)}.pdf"`);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers
    });
  } catch (error: any) {
    console.error('Error generating purchase PDF GET:', error);
    return new NextResponse(`Error al generar vista de impresión de compra: ${error.message}`, {
      status: 500
    });
  }
}
