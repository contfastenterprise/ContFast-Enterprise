import { NextRequest, NextResponse } from 'next/server';
import { db, accountsReceivable, customers, invoices } from '@/db';
import { eq, and, isNull, desc, gt } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { companyId, modo } = auth;

    const url = new URL(req.url);
    const customerId = url.searchParams.get('customerId');

    let queryConditions = and(
      eq(accountsReceivable.companyId, companyId),
      eq(accountsReceivable.modo, modo),
      isNull(accountsReceivable.deletedAt),
      gt(accountsReceivable.balance, '0')
    );

    if (customerId && customerId !== 'all') {
      queryConditions = and(queryConditions, eq(accountsReceivable.customerId, customerId));
    }

    const data = await db
      .select({
        id: accountsReceivable.id,
        invoiceId: accountsReceivable.invoiceId,
        ncf: invoices.ncf,
        codigoFactura: invoices.codigoFactura,
        amount: accountsReceivable.amount,
        balance: accountsReceivable.balance,
        dueDate: accountsReceivable.dueDate,
        status: accountsReceivable.status,
        customerId: accountsReceivable.customerId,
        customerName: customers.name,
        customerRnc: customers.rncCedula,
        createdAt: accountsReceivable.createdAt,
      })
      .from(accountsReceivable)
      .leftJoin(customers, eq(accountsReceivable.customerId, customers.id))
      .leftJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
      .where(queryConditions)
      .orderBy(desc(accountsReceivable.dueDate));

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching receivables report:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
