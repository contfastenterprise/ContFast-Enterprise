import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { warehouses } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { exigirAltaDeAlmacen } from '@/services/suscripcion/planRepositorio';
import { PlanNoPermiteError, cuerpoDelBloqueo } from '@/services/suscripcion/planVigente';
import { verifyAuth } from '@/middleware/auth';
import { isAdminOrSistemas } from '@/middleware/permissions';
import { v4 as uuidv4 } from 'uuid';

// Auditoria P2-26 (2026-09-03): esta ruta destructuraba el cuerpo sin validar y
// solo comprobaba a mano que `name` y `code` no fueran vacios. Los limites
// salen del esquema: `name` es varchar(255), `code` varchar(50), y `status` un
// varchar sin restriccion en la base. `code` va en un indice UNIQUE por
// empresa, asi que ademas se normaliza el espacio en blanco: "ALM-01" y
// "ALM-01 " no pueden ser dos almacenes distintos.
const crearAlmacenSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(255, 'El nombre no puede pasar de 255 caracteres'),
  code: z.string().trim().min(1, 'El código es requerido').max(50, 'El código no puede pasar de 50 caracteres'),
  address: z.string().trim().max(2000, 'La dirección es demasiado larga').optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const companyId = auth.companyId;
    
    // Todo: Filtrar por los almacenes a los que tiene acceso si no es admin
    // Por ahora obtenemos todos los de la compañía
    const companyWarehouses = await db.select().from(warehouses).where(eq(warehouses.companyId, companyId));

    return NextResponse.json({ success: true, data: companyWarehouses });
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return NextResponse.json({ error: 'Failed to fetch warehouses' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const companyId = auth.companyId;
    
    // Only admins/system can create warehouses
    if (!isAdminOrSistemas(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = await req.json();
    const parsed = crearAlmacenSchema.safeParse(data);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { name, code, address, status } = parsed.data;

    // Comprobar que el código no exista
    const existing = await db.select().from(warehouses).where(
      and(eq(warehouses.companyId, companyId), eq(warehouses.code, code))
    );

    if (existing.length > 0) {
      return NextResponse.json({ error: 'A warehouse with this code already exists' }, { status: 400 });
    }

    // LOTE 299: el plan, con la regla unica, y la cuenta DENTRO de la transaccion
    // que inserta, bajo el candado de la empresa. Antes: sin suscripcion `active` no
    // habia limite, y dos altas a la vez contaban las dos N-1 y pasaban las dos.
    const newWarehouse = await db.transaction(async (tx) => {
      await exigirAltaDeAlmacen(tx, companyId);
      return await tx.insert(warehouses).values({
        id: uuidv4(),
        companyId,
        name,
        code,
        address,
        status: status || 'active',
      }).returning();
    });

    return NextResponse.json({ data: newWarehouse[0] }, { status: 201 });
  } catch (error) {
    // Lote 299: el bloqueo del plan, con su `code` (403/409) como en todas las puertas.
    if (error instanceof PlanNoPermiteError) {
      return NextResponse.json(cuerpoDelBloqueo(error), { status: error.status });
    }
    console.error('Error creating warehouse:', error);
    return NextResponse.json({ error: 'Failed to create warehouse' }, { status: 500 });
  }
}
