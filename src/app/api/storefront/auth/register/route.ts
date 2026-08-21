import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, users, roles, companies } from '@/db';
import { eq } from 'drizzle-orm';
import { createSession } from '@/middleware/auth';
import { StorefrontCompanyService } from '@/services/storefront/companyService';

const registerSchema = z.object({
  fullName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  email: z.string().email('El correo electrónico no es válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  empresaSlug: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const { fullName, email, password, empresaSlug } = parsed.data;

    // Verificar si existe el email
    const [existingUser] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (existingUser) {
      return NextResponse.json({ success: false, error: { message: 'El correo electrónico ya está registrado.' } }, { status: 400 });
    }

    // Obtener la empresa dinámicamente
    const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
    if (!company) {
      return NextResponse.json({ success: false, error: { message: 'Empresa no encontrada.' } }, { status: 404 });
    }
    const companyId = company.id;

    // Obtener o crear el rol "cliente"
    let [clienteRole] = await db.select().from(roles).where(eq(roles.name, 'cliente')).limit(1);
    if (!clienteRole) {
      const [newRole] = await db.insert(roles).values({
        name: 'cliente',
        description: 'Cliente Detallista (Storefront)',
        isFixed: true,
      }).returning();
      clienteRole = newRole;
    }

    // Hashear Password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Crear Usuario
    const [newUser] = await db
      .insert(users)
      .values({
        companyId,
        roleId: clienteRole.id,
        name: fullName,
        email: email.toLowerCase(),
        passwordHash,
        status: 'active',
      })
      .returning();

    // Crear sesión directamente para auto-login
    const ipAddress = req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown';
    const userAgent = req.headers.get('user-agent') || '';
    const resHeaders = new Headers();

    await createSession(
      newUser.id,
      newUser.companyId,
      clienteRole.name,
      clienteRole.id,
      ipAddress,
      userAgent,
      resHeaders
    );

    return NextResponse.json(
      { success: true, data: { user: { id: newUser.id, name: newUser.name, email: newUser.email } } },
      { headers: resHeaders }
    );

  } catch (error) {
    console.error('Error in storefront register:', error);
    return NextResponse.json({ success: false, error: { message: 'Error interno del servidor.' } }, { status: 500 });
  }
}
