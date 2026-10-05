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
    //
    //  LOTE 289: se compara por RUTA, no por ruta + modulo, a proposito. Una ruta que no
    //  esta en la base entra con TODAS sus filas de la siembra (antiguedad-saldos: las
    //  dos). Pero si la base ya tiene la ruta con otro modulo, aqui no se añade nada:
    //  comparar tambien el modulo haria que esta reparacion, que corre sola y alcanza a
    //  las seis empresas (la tabla no tiene `company_id`), AÑADIERA permisos en cuanto la
    //  base y la siembra discreparan. Una ruta a la que le falta una de sus filas no se
    //  repara sola; se arregla a mano.
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
  } catch (err: unknown) {
    console.error('[Route Mappings API Error]:', err);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: (err as Error).message } },
      { status: 500 }
    );
  }
}
