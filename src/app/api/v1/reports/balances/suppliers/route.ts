import { NextRequest, NextResponse } from 'next/server';
import { db, accountsPayable, suppliers } from '@/db';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permissions';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Auditoria ISO-03: esta ruta verificaba la sesion pero no el permiso.
    const denegado = await requirePermission(auth, 'proveedores', 'read');
    if (denegado) return denegado;
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
          overdue1to30: 0,
          overdue31to60: 0,
          overdue61Plus: 0,
        };
      }
      
      const bal = Number(item.balance);
      grouped[sid].totalBalance += bal;
      
      const dueDate = new Date(item.dueDate);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dueDate);
      due.setHours(0, 0, 0, 0);
      
      const diffTime = today.getTime() - due.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 0) {
        grouped[sid].overdueBalance += bal;
        if (diffDays <= 30) {
          grouped[sid].overdue1to30 += bal;
        } else if (diffDays <= 60) {
          grouped[sid].overdue31to60 += bal;
        } else {
          grouped[sid].overdue61Plus += bal;
        }
      }
    });

    return NextResponse.json(Object.values(grouped));
  } catch (error: any) {
    console.error('Error fetching supplier balances:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
