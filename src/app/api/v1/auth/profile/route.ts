import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { db, users, auditLogs } from '@/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateProfileSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres').optional(),
  avatarUrl: z.string().url('URL inválida').nullable().optional(),
  avatarPath: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    // 1. Rate Limiting
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    // 2. Auth Session
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    // 3. Body parse
    const body = await req.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { name, avatarUrl, avatarPath } = parsed.data;

    // Fetch existing user to check differences
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!existingUser) {
      return NextResponse.json({ success: false, error: { message: 'Usuario no encontrado' } }, { status: 404 });
    }

    // Prepare update parameters
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
    if (avatarPath !== undefined) updateData.avatarPath = avatarPath;

    // Execute database update
    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, session.userId))
      .returning();

    // Log the audit event
    await db.insert(auditLogs).values({
      companyId: session.companyId,
      userId: session.userId,
      action: 'Usuario actualizó su foto de perfil',
      entityType: 'users',
      entityId: session.userId,
      oldValues: {
        avatarUrl: existingUser.avatarUrl,
        avatarPath: existingUser.avatarPath,
      },
      newValues: {
        avatarUrl: updatedUser.avatarUrl,
        avatarPath: updatedUser.avatarPath,
      },
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        avatarUrl: updatedUser.avatarUrl,
        avatarPath: updatedUser.avatarPath,
      },
      message: 'Perfil actualizado exitosamente',
    });
  } catch (error: any) {
    console.error('Profile update error:', error);
    return NextResponse.json(
      { success: false, error: { message: error.message || 'Error interno del servidor' } },
      { status: 500 }
    );
  }
}
export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        avatarPath: users.avatarPath,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ success: false, error: { message: 'Usuario no encontrado' } }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { message: error.message || 'Error interno' } },
      { status: 500 }
    );
  }
}
