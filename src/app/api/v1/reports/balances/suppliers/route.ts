import { NextRequest, NextResponse } from 'next/server';
import { db, accountsPayable, suppliers } from '@/db';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permissions';
import { analizarVencimiento } from '@/services/cartera/vencimiento';
import { hoyDia } from '@/utils/fechasLocales';

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
    const hoy = hoyDia();
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

      // Este informe agrupa en TRES tramos, no en cuatro: junta 61-90 y 90+ en
      // un "61 o mas". Las fronteras siguen siendo las de
      // `services/cartera/vencimiento`; lo unico propio de aqui es esa union.
      //
      // Antes la cuenta se hacia a mano y tenia el fallo de husos en su forma
      // pura: `today` en medianoche LOCAL y `due` en medianoche UTC, con el
      // `setHours` fijandolo en el dia anterior. Los dos lados no estaban en la
      // misma escala, asi que el atraso salia inflado en uno TODOS los dias, y
      // eso movia saldos de tramo en la frontera de cada uno.
      const v = analizarVencimiento(item.dueDate, { hoy, saldo: bal });
      if (v.vencida) {
        grouped[sid].overdueBalance += bal;
        if (v.tramo === '1-30') grouped[sid].overdue1to30 += bal;
        else if (v.tramo === '31-60') grouped[sid].overdue31to60 += bal;
        else grouped[sid].overdue61Plus += bal;
      }
    });

    return NextResponse.json(Object.values(grouped));
  } catch (error: unknown) {
    console.error('Error fetching supplier balances:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
