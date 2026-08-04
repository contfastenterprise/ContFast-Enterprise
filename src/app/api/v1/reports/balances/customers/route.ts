import { NextRequest, NextResponse } from 'next/server';
import { db, accountsReceivable, customers } from '@/db';
import { eq, and, isNull, gt } from 'drizzle-orm';
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

    const items = await db
      .select({
        balance: accountsReceivable.balance,
        dueDate: accountsReceivable.dueDate,
        customerId: accountsReceivable.customerId,
        customerName: customers.name,
        customerRnc: customers.rncCedula,
      })
      .from(accountsReceivable)
      .leftJoin(customers, eq(accountsReceivable.customerId, customers.id))
      .where(queryConditions);

    // Aggregate in memory
    const grouped: Record<string, any> = {};
    const now = new Date();
    
    items.forEach(item => {
      const cid = item.customerId || 'unknown';
      if (!grouped[cid]) {
        grouped[cid] = {
          customerId: cid,
          customerName: item.customerName || 'Desconocido',
          customerRnc: item.customerRnc || 'N/A',
          totalBalance: 0,
          overdueBalance: 0,
        };
      }
      
      const bal = Number(item.balance);
      grouped[cid].totalBalance += bal;
      
      if (new Date(item.dueDate) < now) {
        grouped[cid].overdueBalance += bal;
      }
    });

    return NextResponse.json(Object.values(grouped));
  } catch (error: any) {
    console.error('Error fetching customer balances:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
