import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, users, roles, companies, auditLogs } from '@/db';
import { eq, and } from 'drizzle-orm';
import { checkRateLimit } from '@/middleware/rateLimiter';

const registerSchema = z.object({
  fullName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  email: z.string().email('Formato de correo electrónico inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

export async function POST(req: NextRequest) {
  const ipAddress = req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown';

  // Rate limit registration by IP
  const allowed = await checkRateLimit(ipAddress, 'auth');
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Intente más tarde.' } },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { fullName, email, password } = result.data;

    // Check if email already exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: { code: 'EMAIL_ALREADY_EXISTS', message: 'El correo electrónico ya está registrado.' } },
        { status: 400 }
      );
    }

    // Since we need a companyId and roleId for a user, we will associate this user
    // with either an existing company or create a default demo one for them to start, 
    // or retrieve the latest company.
    // In our case, for signup/register we check if there is at least one company or we create a default one.
    let company = await db.select().from(companies).limit(1);
    let companyId: string;

    if (company.length === 0) {
      const [newCompany] = await db
        .insert(companies)
        .values({
          name: 'Empresa Demo S.R.L.',
          rnc: '101001001',
          businessActivity: 'Servicios Generales',
          status: 'active',
        })
        .returning();
      companyId = newCompany.id;
    } else {
      companyId = company[0].id;
    }

    // Get a default role (like 'administracion' or 'sistemas' or create one)
    let role = await db
      .select()
      .from(roles)
      .where(and(eq(roles.companyId, companyId), eq(roles.name, 'administracion')))
      .limit(1);

    let roleId: string;
    if (role.length === 0) {
      // Look for a system-wide null company role or create one
      const systemRole = await db
        .select()
        .from(roles)
        .where(eq(roles.name, 'administracion'))
        .limit(1);

      if (systemRole.length > 0) {
        roleId = systemRole[0].id;
      } else {
        const [newRole] = await db
          .insert(roles)
          .values({
            companyId,
            name: 'administracion',
            description: 'Rol de administrador del sistema',
            isFixed: true,
          })
          .returning();
        roleId = newRole.id;
      }
    } else {
      roleId = role[0].id;
    }

    // Hash Password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create User
    const [newUser] = await db
      .insert(users)
      .values({
        companyId,
        roleId,
        name: fullName,
        email: email.toLowerCase(),
        passwordHash,
        status: 'active',
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
      });

    // Create Audit Log
    await db.insert(auditLogs).values({
      companyId,
      userId: newUser.id,
      action: 'user_registered',
      entityType: 'users',
      entityId: newUser.id,
      newValues: { email: newUser.email, name: newUser.name },
      ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: 'Usuario registrado exitosamente.',
      data: {
        user: newUser,
      },
    });
  } catch (error: any) {
    console.error('Registration API error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: 'Ha ocurrido un error interno en el servidor.' } },
      { status: 500 }
    );
  }
}
