import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, users, roles, auditLogs } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import { createSession } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';

const loginSchema = z.object({
  email: z.string().email('Formato de correo electrónico inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

export async function POST(req: NextRequest) {
  const ipAddress = req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown';

  // 1. Strict rate limiting on login by IP
  const allowed = await checkRateLimit(ipAddress, 'auth');
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos de inicio de sesión. Intente más tarde.' } },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { email, password } = result.data;

    // 2. Fetch active user
    const [user] = await db
      .select({
        id: users.id,
        companyId: users.companyId,
        roleId: users.roleId,
        passwordHash: users.passwordHash,
        name: users.name,
        email: users.email,
        status: users.status,
        roleName: roles.name,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.email, email.toLowerCase()), isNull(users.deletedAt)))
      .limit(1);

    if (!user || user.status !== 'active') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Correo electrónico o contraseña incorrectos.' } },
        { status: 401 }
      );
    }

    // 3. Compare passwords
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      // Register failed audit log
      await db.insert(auditLogs).values({
        companyId: user.companyId,
        userId: user.id,
        action: 'login_failed',
        entityType: 'users',
        entityId: user.id,
        newValues: { ipAddress, email: user.email },
        ipAddress,
      });

      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Correo electrónico o contraseña incorrectos.' } },
        { status: 401 }
      );
    }

    // 4. Create session and generate HttpOnly cookies
    const resHeaders = new Headers();
    const userAgent = req.headers.get('user-agent') || '';

    await createSession(
      user.id,
      user.companyId,
      user.roleName,
      user.roleId,
      ipAddress,
      userAgent,
      resHeaders
    );

    // 5. Register audit log
    await db.insert(auditLogs).values({
      companyId: user.companyId,
      userId: user.id,
      action: 'login_success',
      entityType: 'users',
      entityId: user.id,
      newValues: { email: user.email, role: user.roleName },
      ipAddress,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.roleName,
            companyId: user.companyId,
          },
        },
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: 'Ha ocurrido un error interno en el servidor.' } },
      { status: 500 }
    );
  }
}
