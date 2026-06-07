import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { db, users, sessions, roles } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'cf_v2_jwt_access_secret_2026_super_secure_9876543210';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'cf_v2_jwt_refresh_secret_2026_super_secure_0123456789';

export interface AuthPayload {
  userId: string;
  companyId: string;
  role: string; // systems | admin | accounting | billing | bank | cashier
  roleId: string;
  sessionId: string;
}

// Helpers for hash generation
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verifies JWT tokens and handles Refresh Token Rotation if access token is expired.
 * Modifies the response headers if a token refresh occurs.
 */
export async function verifyAuth(
  req: NextRequest,
  resHeaders: Headers = new Headers()
): Promise<AuthPayload | null> {
  const accessToken = req.cookies.get('accessToken')?.value;
  const refreshToken = req.cookies.get('refreshToken')?.value;

  // 1. Try to verify the access token
  if (accessToken) {
    try {
      const decoded = jwt.verify(accessToken, JWT_SECRET) as any;
      return {
        userId: decoded.userId,
        companyId: decoded.companyId,
        role: decoded.role,
        roleId: decoded.roleId,
        sessionId: decoded.sessionId,
      };
    } catch (err: any) {
      // If access token is expired, proceed to refresh token validation
      if (err.name !== 'TokenExpiredError') {
        return null;
      }
    }
  }

  // 2. If access token is missing/expired, check refresh token
  if (!refreshToken) {
    return null;
  }

  try {
    const decodedRefresh = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any;
    const refreshHash = hashToken(refreshToken);

    // Look up session in DB
    const [session] = await db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        companyId: sessions.companyId,
        refreshHash: sessions.refreshHash,
        invalidatedAt: sessions.invalidatedAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(eq(sessions.refreshHash, refreshHash));

    // Refresh Token Reuse Detection (Rotation theft mitigation)
    if (!session || session.invalidatedAt || new Date() > new Date(session.expiresAt)) {
      if (session && session.invalidatedAt) {
        console.warn(`[Security] Reused Refresh Token detected for User: ${session.userId}. Invalidating all active sessions.`);
        // Reused token! Kill ALL active sessions of this user as a security measure
        await db
          .update(sessions)
          .set({ invalidatedAt: new Date() })
          .where(eq(sessions.userId, session.userId));
      }
      return null;
    }

    // Load User and Role Details
    const [userWithRole] = await db
      .select({
        id: users.id,
        companyId: users.companyId,
        status: users.status,
        roleId: users.roleId,
        roleName: roles.name,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(eq(users.id, session.userId), isNull(users.deletedAt)));

    if (!userWithRole || userWithRole.status !== 'active') {
      return null;
    }

    // Generate new Access and Refresh tokens
    const newSessionId = session.id;
    const newAccessToken = jwt.sign(
      {
        userId: userWithRole.id,
        companyId: userWithRole.companyId,
        role: userWithRole.roleName,
        roleId: userWithRole.roleId,
        sessionId: newSessionId,
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const newRefreshToken = jwt.sign(
      { userId: userWithRole.id, sessionId: newSessionId },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    const newRefreshHash = hashToken(newRefreshToken);
    const ipAddress = req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown';
    const userAgent = req.headers.get('user-agent') || '';

    // Update session table with new refresh token hash (Rotate!)
    await db
      .update(sessions)
      .set({
        refreshHash: newRefreshHash,
        ipAddress,
        userAgent,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      })
      .where(eq(sessions.id, newSessionId));

    // Set cookies in response headers
    resHeaders.append(
      'Set-Cookie',
      `accessToken=${newAccessToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=900` // 15 mins
    );
    resHeaders.append(
      'Set-Cookie',
      `refreshToken=${newRefreshToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800` // 7 days
    );

    return {
      userId: userWithRole.id,
      companyId: userWithRole.companyId,
      role: userWithRole.roleName,
      roleId: userWithRole.roleId,
      sessionId: newSessionId,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Creates authentication cookies and saves session in database.
 */
export async function createSession(
  userId: string,
  companyId: string,
  role: string,
  roleId: string,
  ipAddress: string,
  userAgent: string,
  resHeaders: Headers
): Promise<void> {
  const sessionId = crypto.randomUUID();

  // Generate tokens
  const accessToken = jwt.sign(
    { userId, companyId, role, roleId, sessionId },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId, sessionId },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  const refreshHash = hashToken(refreshToken);

  // Write session to database
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    companyId,
    refreshHash,
    ipAddress,
    userAgent,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });

  // Set cookies
  resHeaders.append(
    'Set-Cookie',
    `accessToken=${accessToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=900`
  );
  resHeaders.append(
    'Set-Cookie',
    `refreshToken=${refreshToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`
  );
}

/**
 * Invalidates and deletes cookies.
 */
export async function clearSession(
  sessionId: string,
  resHeaders: Headers
): Promise<void> {
  // Invalidate in DB
  await db
    .update(sessions)
    .set({ invalidatedAt: new Date() })
    .where(eq(sessions.id, sessionId));

  // Expire cookies
  resHeaders.append(
    'Set-Cookie',
    `accessToken=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  );
  resHeaders.append(
    'Set-Cookie',
    `refreshToken=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  );
}
