import { NextRequest, NextResponse } from 'next/server';
import { db, expenses, suppliers, warehouses, companies, companySettings } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { eq, and, sql, between } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return new NextResponse('No autorizado', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const isMinorExpenseStr = searchParams.get('isMinorExpense'); // 'true' or 'false'
    const expenseType = searchParams.get('expenseType');
    const supplierId = searchParams.get('supplierId');
    const warehouseId = searchParams.get('warehouseId');
    const ncf = searchParams.get('ncf');

    const filters: any[] = [eq(expenses.companyId, session.companyId)];

    if (startDate && endDate) {
      filters.push(between(expenses.issueDate, startDate, endDate));
    } else if (startDate) {
      filters.push(sql`${expenses.issueDate} >= ${startDate}`);
    } else if (endDate) {
      filters.push(sql`${expenses.issueDate} <= ${endDate}`);
    }

    if (isMinorExpenseStr === 'true') {
      filters.push(eq(expenses.isMinorExpense, true));
    } else if (isMinorExpenseStr === 'false') {
      filters.push(eq(expenses.isMinorExpense, false));
    }

    if (expenseType) {
      filters.push(eq(expenses.expenseType, expenseType));
    }

    if (supplierId) {
      filters.push(eq(expenses.supplierId, supplierId));
    }

    if (warehouseId) {
      filters.push(eq(expenses.warehouseId, warehouseId));
    }

    if (ncf) {
      filters.push(sql`LOWER(${expenses.ncf}) LIKE ${'%' + ncf.toLowerCase() + '%'}`);
    }

    const items = await db
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
        warehouseName: warehouses.name,
      })
      .from(expenses)
      .leftJoin(suppliers, eq(expenses.supplierId, suppliers.id))
      .leftJoin(warehouses, eq(expenses.warehouseId, warehouses.id))
      .where(and(...filters))
      .orderBy(sql`${expenses.issueDate} DESC, ${expenses.createdAt} DESC`);

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

    const docData = {
      company: {
        name: company.name,
        rnc: company.rnc,
        address: company.address || '',
        phone: company.phone || '',
        email: company.email || '',
        logoUrl: settings?.logoUrl || undefined,
      },
      items,
      filters: {
        startDate: startDate || 'Inicio',
        endDate: endDate || 'Hoy',
        type: isMinorExpenseStr === 'true' ? 'expenses' : isMinorExpenseStr === 'false' ? 'purchases' : 'all',
      }
    };

    const html = DocumentTemplates.renderPurchasesReport(docData);
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, 'carta');

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', 'inline; filename="reporte_compras.pdf"');

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers
    });
  } catch (error: any) {
    console.error('Error generating purchases report PDF:', error);
    return new NextResponse(`Error al generar reporte de compras: ${error.message}`, {
      status: 500
    });
  }
}
