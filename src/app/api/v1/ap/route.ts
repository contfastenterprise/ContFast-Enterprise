import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { ApRepository } from '@/repositories/apRepository';

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
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'proveedores', 'read');

    const url = new URL(req.url);
    const getPayments = url.searchParams.get('payments') === 'true';
    const apId = url.searchParams.get('apId') || undefined;

    if (getPayments) {
      const data = await ApRepository.getPayments(auth.companyId, apId);
      return NextResponse.json(
        { success: true, data },
        { headers: resHeaders }
      );
    }

    const flatData = await ApRepository.findAll(auth.companyId);

    // Group by supplier for the dashboard view
    const grouped: Record<string, {
      supplierId: string;
      supplierName: string;
      totalBalance: number;
      bills: any[];
    }> = {};

    for (const item of flatData) {
      const balanceNum = parseFloat(item.balance);
      if (balanceNum <= 0.01) continue;

      if (!grouped[item.supplierId]) {
        grouped[item.supplierId] = {
          supplierId: item.supplierId,
          supplierName: item.supplierName || 'Proveedor',
          totalBalance: 0,
          bills: []
        };
      }
      grouped[item.supplierId].totalBalance += balanceNum;
      grouped[item.supplierId].bills.push({
        apId: item.id,
        amount: parseFloat(item.amount),
        balance: balanceNum,
        dueDate: item.dueDate,
        status: item.status
      });
    }

    return NextResponse.json(
      { success: true, data: Object.values(grouped) },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/ap:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
