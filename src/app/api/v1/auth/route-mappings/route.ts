import { NextRequest, NextResponse } from 'next/server';
import { db, routeMappings } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { DEFAULT_ROUTE_MAPPINGS } from '@/constants/defaultMappings';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
        { status: 401 }
      );
    }

    let mappings = await db.select().from(routeMappings);

    // Auto-reconciliation of missing default route mappings (self-healing)
    const missingMappings = DEFAULT_ROUTE_MAPPINGS.filter(
      (def) => !mappings.some((m) => m.routePattern === def.routePattern)
    );

    if (missingMappings.length > 0) {
      const inserts = missingMappings.map((m) => ({
        id: uuidv4(),
        routePattern: m.routePattern,
        module: m.module,
        action: m.action || 'read',
        isMenuItem: m.isMenuItem,
        displayName: m.displayName,
        groupName: m.groupName,
        iconName: m.iconName,
        orderIndex: m.orderIndex,
      }));

      await db.insert(routeMappings).values(inserts);
      mappings = await db.select().from(routeMappings);
    }

    return NextResponse.json({
      success: true,
      data: mappings,
    });
  } catch (err: any) {
    console.error('[Route Mappings API Error]:', err);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } },
      { status: 500 }
    );
  }
}
