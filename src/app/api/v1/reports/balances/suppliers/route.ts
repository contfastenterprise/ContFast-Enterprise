import { NextRequest, NextResponse } from 'next/server';
import { db, accountsPayable, suppliers } from '@/db';
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
    const supplierId = url.searchParams.get('supplierId');

    let queryConditions = and(
      eq(accountsPayable.companyId, companyId),
      eq(accountsPayable.modo, modo),
      isNull(accountsPayable.deletedAt),
      gt(accountsPayable.balance, '0')
    );

    if (supplierId && supplierId !== 'all') {
      queryConditions = and(queryConditions, eq(accountsPayable.supplierId, supplierId));
    }

    const items = await db
      .select({
        balance: accountsPayable.balance,
        dueDate: accountsPayable.dueDate,
        supplierId: accountsPayable.supplierId,
        supplierName: suppliers.name,
        supplierRnc: suppliers.rnc,
      })
      .from(accountsPayable)
      .leftJoin(suppliers, eq(accountsPayable.supplierId, suppliers.id))
      .where(queryConditions);

    // Aggregate in memory
    const grouped: Record<string, any> = {};
    const now = new Date();
    
    items.forEach(item => {
      const sid = item.supplierId || 'unknown';
      if (!grouped[sid]) {
        grouped[sid] = {
          supplierId: sid,
          supplierName: item.supplierName || 'Desconocido',
          supplierRnc: item.supplierRnc || 'N/A',
          totalBalance: 0,
          overdueBalance: 0,
        };
      }
      
      const bal = Number(item.balance);
      grouped[sid].totalBalance += bal;
      
      if (new Date(item.dueDate) < now) {
        grouped[sid].overdueBalance += bal;
      }
    });

    return NextResponse.json(Object.values(grouped));
  } catch (error: any) {
    console.error('Error fetching supplier balances:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
