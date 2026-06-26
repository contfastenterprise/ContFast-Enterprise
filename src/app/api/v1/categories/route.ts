import { NextRequest, NextResponse } from 'next/server';
import { db, productCategories } from '@/db';
import { eq, and, ilike } from 'drizzle-orm';
import { verifyAuth } from '@/middleware/auth';
import { v4 as uuidv4 } from 'uuid';

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
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    return NextResponse.json({ success: false, error: { message: 'Error interno del servidor' } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth) return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });

    const body = await req.json();
    const { name, description, status } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: { message: 'El nombre es requerido' } }, { status: 400 });
    }

    const newCategory = await db.insert(productCategories).values({
      id: uuidv4(),
      companyId: auth.companyId,
      name,
      description,
      status: status || 'active'
    }).returning();

    return NextResponse.json({ success: true, data: newCategory[0] }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating category:', error);
    return NextResponse.json({ success: false, error: { message: 'Error interno del servidor' } }, { status: 500 });
  }
}
