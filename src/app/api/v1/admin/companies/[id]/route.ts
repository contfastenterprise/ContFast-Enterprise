import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { db, companies } from '@/db';
import { z } from 'zod';
import { eq, and, ne } from 'drizzle-orm';

const updateCompanySchema = z.object({
  name: z.string().min(1, 'El Nombre Comercial es requerido'),
  rnc: z.string().min(9, 'El RNC es requerido').max(11, 'El RNC debe tener entre 9 y 11 caracteres'),
  email: z.string().email('El correo electrónico no es válido').min(1, 'El correo electrónico es requerido'),
  businessActivity: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const session = await verifyAuth(req);
    if (!session || session.role !== 'sistemas') {
      return NextResponse.json({ success: false, error: { message: 'No autorizado. Se requiere rol de sistemas.' } }, { status: 403 });
    }

    const body = await req.json();
    const result = updateCompanySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { message: result.error.issues[0].message } },
        { status: 400 }
      );
    }

    // Check if another company uses the same RNC
    const [existing] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.rnc, result.data.rnc), ne(companies.id, id)))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { success: false, error: { message: 'Ya existe otra empresa con este RNC.' } },
        { status: 400 }
      );
    }

    const [updatedCompany] = await db
      .update(companies)
      .set({
        name: result.data.name,
        rnc: result.data.rnc,
        email: result.data.email,
        businessActivity: result.data.businessActivity || null,
        address: result.data.address || null,
        status: result.data.status,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, id))
      .returning();

    if (!updatedCompany) {
      return NextResponse.json({ success: false, error: { message: 'Empresa no encontrada' } }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updatedCompany });
  } catch (error: any) {
    console.error('Error updating company:', error);
    return NextResponse.json({ success: false, error: { message: 'Error interno del servidor' } }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const session = await verifyAuth(req);
    if (!session || session.role !== 'sistemas') {
      return NextResponse.json({ success: false, error: { message: 'No autorizado. Se requiere rol de sistemas.' } }, { status: 403 });
    }

    // Soft delete
    const [deletedCompany] = await db
      .update(companies)
      .set({ deletedAt: new Date(), status: 'inactive' })
      .where(eq(companies.id, id))
      .returning();

    if (!deletedCompany) {
      return NextResponse.json({ success: false, error: { message: 'Empresa no encontrada' } }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: deletedCompany });
  } catch (error: any) {
    console.error('Error deleting company:', error);
    return NextResponse.json({ success: false, error: { message: 'Error interno del servidor' } }, { status: 500 });
  }
}
