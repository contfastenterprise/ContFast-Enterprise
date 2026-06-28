import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, users, roles, companies } from '@/db';
import { eq, count, and, isNull } from 'drizzle-orm';
import { createSession } from '@/middleware/auth';
import { v4 as uuidv4 } from 'uuid';

/**
 * RUTA DE RECUPERACIÓN DE EMERGENCIA
 *
 * Solo está disponible cuando el sistema ya fue inicializado (hay empresa en DB)
 * pero NO existe ningún usuario activo — situación que ocurre cuando:
 * 1. Las cookies de sesión fueron rechazadas durante el setup inicial
 *    (ej. flag Secure en http://localhost)
 * 2. Todos los usuarios fueron desactivados accidentalmente
 *
 * SI HAY USUARIOS ACTIVOS → Devuelve 403 (no se puede usar como backdoor)
 */

export const runtime = 'nodejs';

const recoverSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  // Clave secreta del servidor para evitar uso no autorizado
  recoveryKey: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Verificar que el sistema esté inicializado
    const [companyResult] = await db.select({ id: companies.id }).from(companies).limit(1);
    if (!companyResult) {
      return NextResponse.json(
        { success: false, error: { message: 'El sistema no ha sido inicializado. Use el wizard de setup.' } },
        { status: 400 }
      );
    }

    // 2. Verificar la clave de recuperación del entorno
    const RECOVERY_KEY = process.env.RECOVERY_SECRET_KEY;
    if (!RECOVERY_KEY) {
      return NextResponse.json(
        { success: false, error: { message: 'La recuperación de emergencia no está habilitada. Configure RECOVERY_SECRET_KEY en .env' } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = recoverSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    // 3. Validar la clave de recuperación
    if (parsed.data.recoveryKey !== RECOVERY_KEY) {
      return NextResponse.json(
        { success: false, error: { message: 'Clave de recuperación incorrecta.' } },
        { status: 403 }
      );
    }

    // 4. Verificar que no existan usuarios activos (protección anti-backdoor)
    const [activeUserCount] = await db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.companyId, companyResult.id), eq(users.status, 'active'), isNull(users.deletedAt)));

    if ((activeUserCount?.value || 0) > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `La recuperación de emergencia no está disponible: existen ${activeUserCount.value} usuario(s) activo(s). Use /auth/login con sus credenciales.`
          }
        },
        { status: 403 }
      );
    }

    // 5. Obtener el rol 'sistemas'
    const [roleSistemas] = await db
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(eq(roles.name, 'sistemas'))
      .limit(1);

    if (!roleSistemas) {
      return NextResponse.json(
        { success: false, error: { message: 'No se encontró el rol de sistemas. La base de datos puede estar corrupta.' } },
        { status: 500 }
      );
    }

    // 6. Crear el usuario de recuperación
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(parsed.data.password, salt);

    // Verificar si el correo ya existe (aunque esté inactivo)
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email.toLowerCase()))
      .limit(1);

    let recoveredUserId: string;

    if (existingUser) {
      // Reactivar y actualizar contraseña del usuario existente
      await db
        .update(users)
        .set({ status: 'active', passwordHash, updatedAt: new Date() })
        .where(eq(users.id, existingUser.id));
      recoveredUserId = existingUser.id;
    } else {
      // Crear nuevo usuario administrador
      const [newUser] = await db
        .insert(users)
        .values({
          id: uuidv4(),
          companyId: companyResult.id,
          roleId: roleSistemas.id,
          name: parsed.data.name,
          email: parsed.data.email.toLowerCase(),
          passwordHash,
          status: 'active',
        })
        .returning({ id: users.id });
      recoveredUserId = newUser.id;
    }

    // 7. Crear sesión y emitir cookies
    const resHeaders = new Headers();
    const userAgent = req.headers.get('user-agent') || '';
    const ipAddress = req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown';

    await createSession(
      recoveredUserId,
      companyResult.id,
      roleSistemas.name,
      roleSistemas.id,
      ipAddress,
      userAgent,
      resHeaders
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Recuperación exitosa. El usuario administrador ha sido creado/reactivado.',
        data: { email: parsed.data.email }
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('[RECOVERY] Error:', error);
    return NextResponse.json(
      { success: false, error: { message: `Error de recuperación: ${error.message}` } },
      { status: 500 }
    );
  }
}
