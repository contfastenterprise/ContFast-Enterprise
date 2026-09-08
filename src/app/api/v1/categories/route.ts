import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, productCategories } from '@/db';
import { eq, and, ilike } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';
import { v4 as uuidv4 } from 'uuid';

// Auditoria P2-26 (2026-09-03): esta ruta destructuraba el cuerpo sin validar y
// solo comprobaba a mano que `name` no fuera vacio. Nada verificaba tipos,
// longitudes ni el valor de `status`. Los limites salen del esquema: `name` es
// varchar(255) y `status` un varchar sin restriccion en la base, asi que la
// unica lista de valores validos es esta.
const crearCategoriaSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(255, 'El nombre no puede pasar de 255 caracteres'),
  description: z.string().trim().max(2000, 'La descripción es demasiado larga').optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;

    const filters = [
      eq(productCategories.companyId, auth.companyId)
    ];

    if (search) {
      filters.push(ilike(productCategories.name, `%${search}%`));
    }

    const categories = await db.select()
      .from(productCategories)
      .where(and(...filters));

    return NextResponse.json({ success: true, data: categories });
  } catch (error: unknown) {
    console.error('Error fetching categories:', error);
    return NextResponse.json({ success: false, error: { message: 'Error interno del servidor' } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });

    const body = await req.json();
    const parsed = crearCategoriaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }
    const { name, description, status } = parsed.data;

    const newCategory = await db.insert(productCategories).values({
      id: uuidv4(),
      companyId: auth.companyId,
      name,
      description,
      status: status || 'active'
    }).returning();

    return NextResponse.json({ success: true, data: newCategory[0] }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating category:', error);
    return NextResponse.json({ success: false, error: { message: 'Error interno del servidor' } }, { status: 500 });
  }
}
