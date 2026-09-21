import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db, users, sessions, passwordResets, auditLogs } from '@/db';
import { checkRateLimit } from '@/middleware/rateLimiter';
import {
  esquemaNuevaContrasena,
  hashDelToken,
  motivoParaNoUsarElEnlace,
} from '@/services/auth/recuperarAcceso';

export const dynamic = 'force-dynamic';

/**
 * Cambiar la contraseña con el enlace recibido por correo (lote 177).
 *
 * AQUI SI SE DICE QUE PASA. Al contrario que `forgot-password`, este punto no
 * revela nada que no supiera ya quien llego con el enlace: si caduco o si ya se
 * uso es justo lo que necesita saber para decidir si pedir otro.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const permitido = await checkRateLimit(ip, 'auth');
  if (!permitido) {
    return NextResponse.json(
      { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espere unos minutos.' } },
      { status: 429 }
    );
  }

  let datos;
  try {
    const parsed = esquemaNuevaContrasena.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }
    datos = parsed.data;
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Petición inválida.' } },
      { status: 400 }
    );
  }

  try {
    // Se busca por el HASH: el token en claro no esta guardado en ningun sitio.
    const [reset] = await db
      .select({
        id: passwordResets.id,
        userId: passwordResets.userId,
        companyId: passwordResets.companyId,
        expiresAt: passwordResets.expiresAt,
        usedAt: passwordResets.usedAt,
      })
      .from(passwordResets)
      .where(eq(passwordResets.tokenHash, hashDelToken(datos.token)))
      .limit(1);

    const motivo = motivoParaNoUsarElEnlace(reset);
    if (motivo) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_TOKEN', message: motivo } },
        { status: 400 }
      );
    }

    const [user] = await db
      .select({ id: users.id, status: users.status, companyId: users.companyId })
      .from(users)
      .where(and(eq(users.id, reset.userId), isNull(users.deletedAt)))
      .limit(1);

    // Una cuenta desactivada despues de pedir el enlace no se reactiva por
    // cambiar la contraseña.
    if (!user || user.status !== 'active') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_TOKEN', message: 'Esta cuenta no está activa. Consulte con administración.' } },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(datos.password, 10);

    // TODO EN UNA TRANSACCION: cambiar la contraseña y no marcar el enlace como
    // usado dejaria un enlace que sirve para volver a cambiarla.
    await db.transaction(async (tx) => {
      await tx.update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      await tx.update(passwordResets)
        .set({ usedAt: new Date() })
        .where(eq(passwordResets.id, reset.id));

      // SE CIERRAN LAS SESIONES ABIERTAS. Quien pide recuperar el acceso puede
      // no ser el unico que lo tiene: cambiar la contraseña y dejar viva la
      // sesion del intruso no recupera nada.
      await tx.update(sessions)
        .set({ invalidatedAt: new Date() })
        .where(and(eq(sessions.userId, user.id), isNull(sessions.invalidatedAt)));

      await tx.insert(auditLogs).values({
        // Evento de cuenta, no de entorno: al recuperar el acceso todavia no se
        // ha elegido PRUEBA ni PRODUCCION. Mismo criterio que el acceso.
        modo: 'PRODUCCION',
        companyId: user.companyId,
        userId: user.id,
        action: 'password_reset',
        entityType: 'users',
        entityId: user.id,
        oldValues: {},
        newValues: { motivo: 'Contraseña restablecida con un enlace de recuperación', ip },
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Contraseña actualizada. Ya puede iniciar sesión con la nueva.',
    });
  } catch (err: unknown) {
    console.error('Error en POST /api/v1/auth/reset-password:', err);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: 'No se pudo cambiar la contraseña. Intente de nuevo.' } },
      { status: 500 }
    );
  }
}
