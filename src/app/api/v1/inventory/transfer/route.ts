import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { transferStock } from '@/services/inventoryService';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const data = await req.json();
    const { sourceWarehouseId, destinationWarehouseId, items, reason } = data;

    if (!sourceWarehouseId || !destinationWarehouseId || !items || !items.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (sourceWarehouseId === destinationWarehouseId) {
      return NextResponse.json({ error: 'Source and destination cannot be the same' }, { status: 400 });
    }

    // Verify user has access to source warehouse if not admin
    if (auth.role !== 'administrador' && auth.role !== 'sistemas') {
      if (!auth.allowedWarehouses.includes(sourceWarehouseId)) {
        return NextResponse.json({ error: 'Forbidden: No access to source warehouse' }, { status: 403 });
      }
    }

    const transferId = await transferStock(
      auth.companyId,
      sourceWarehouseId,
      destinationWarehouseId,
      items,
      auth.userId,
      reason
    );

    return NextResponse.json({ success: true, data: { transferId } });
  } catch (error: any) {
    console.error('Error transferring stock:', error);
    return NextResponse.json({ error: error.message || 'Failed to transfer stock' }, { status: 500 });
  }
}
