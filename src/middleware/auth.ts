import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { db, users, sessions, roles, userWarehouses } from '@/db';
import { eq, and, isNull } from 'drizzle-orm';
import crypto from 'crypto';
import { RbacService } from '@/services/auth/rbacService';
import { isAdminOrSistemas } from './permissions';

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('Las variables de entorno JWT_SECRET y JWT_REFRESH_SECRET son obligatorias y deben estar definidas.');
}

// En desarrollo (http://localhost) el flag Secure bloquea las cookies.
// Sólo activar en producción (HTTPS).
const isProduction = process.env.NODE_ENV === 'production';
const SECURE_FLAG = isProduction ? '; Secure' : '';

export interface AuthPayload {
  userId: string;
  companyId: string;
  role: string; // systems | admin | accounting | billing | bank | cashier
  roleId: string;
  sessionId: string;
  allowedWarehouses: string[];
  permissions: string[];
  modo: 'PRODUCCION' | 'PRUEBA';
}

// Helpers for hash generation
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function fetchAllowedWarehouses(userId: string, roleName: string): Promise<string[]> {
  if (isAdminOrSistemas(roleName)) {
    return ['*'];
  }
  const assigned = await db
    .select({ warehouseId: userWarehouses.warehouseId })
    .from(userWarehouses)
    .where(eq(userWarehouses.userId, userId));
    
  return assigned.map((a: any) => a.warehouseId);
}

// ── Aislamiento del storefront (auditoria ISO-02) ────────────────────────────
// El registro publico de la tienda (POST /api/storefront/auth/register) crea
// usuarios con rol `cliente` y les emite una sesion normal, igual que la del
// ERP. Sin esta comprobacion esa sesion servia para llamar a CUALQUIER ruta
// /api/v1/*, incluidas las 54 que solo verifican autenticacion y no permisos
// (banco, nomina, reportes financieros, estados de cuenta). Como el endpoint es
// publico y el slug de empresa es el nombre comercial en minusculas, un
// desconocido podia registrarse indicando la empresa que quisiera y leer su
// contabilidad completa.
//
// El rol `cliente` no lo usa nada mas en el sistema: lo crea unicamente ese
// endpoint. La tienda solo necesita /api/storefront/* y estas rutas de sesion.
// Todo lo demas se deniega: verifyAuth devuelve null y cada ruta responde su
// propio 401 sin cambios.
const STOREFRONT_ROLE = 'cliente';
const STOREFRONT_ALLOWED_PREFIXES = ['/api/storefront/'];
const STOREFRONT_ALLOWED_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/me',
  '/api/v1/auth/logout',
  '/api/v1/auth/refresh',
]);

function isStorefrontPathAllowed(pathname: string): boolean {
  if (!pathname) return false;
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (STOREFRONT_ALLOWED_PREFIXES.some((prefix) => clean.startsWith(prefix))) return true;
  return STOREFRONT_ALLOWED_PATHS.has(clean);
}

function getRequestPathname(req: NextRequest): string {
  try {
    return req.nextUrl?.pathname || new URL(req.url).pathname;
  } catch (_) {
    return '';
  }
}

/**
 * Verifies JWT tokens and handles Refresh Token Rotation if access token is expired.
 * Modifies the response headers if a token refresh occurs.
 *
 * Ademas acota el alcance de las sesiones del storefront: ver STOREFRONT_ROLE.
 */
export async function verifyAuth(
  req: NextRequest,
  resHeaders: Headers = new Headers()
): Promise<AuthPayload | null> {
  const auth = await resolveAuthPayload(req, resHeaders);
  if (!auth) return null;

  if ((auth.role || '').toLowerCase().trim() === STOREFRONT_ROLE) {
    if (!isStorefrontPathAllowed(getRequestPathname(req))) {
      return null;
    }
  }

  return auth;
}

/**
 * Resolucion del payload de sesion (cabeceras firmadas del proxy, access token
 * o rotacion del refresh token). No aplica reglas de alcance: eso es
 * responsabilidad de `verifyAuth`, que es la funcion que consumen las rutas.
 */
async function resolveAuthPayload(
  req: NextRequest,
  resHeaders: Headers = new Headers()
): Promise<AuthPayload | null> {
  // 0. Check if this request has already been verified and enriched by the centralized Next.js middleware
  const userId = req.headers.get('x-user-id');
  const companyId = req.headers.get('x-company-id');
  const role = req.headers.get('x-user-role');
  const roleId = req.headers.get('x-role-id');
  const sessionId = req.headers.get('x-session-id') || '';
  const allowedWarehousesHeader = req.headers.get('x-allowed-warehouses');
  const permissionsHeader = req.headers.get('x-user-permissions');
  // Este `|| 'PRODUCCION'` SI es legitimo, al contrario que los que se
  // retiraron del resto del codigo: La cabecera puede no venir (una peticion
  // antigua, un cliente que no la manda), y aqui es donde se decide el
  // entorno de toda la sesion. A partir de este punto `modo` ya no es
  // opcional en ningun sitio.
  const environmentHeader = req.headers.get('x-environment') || 'PRODUCCION';
  const modo = environmentHeader === 'PRUEBA' ? 'PRUEBA' : 'PRODUCCION';
  const internalSignature = req.headers.get('x-internal-proxy-signature');
  // Auditoria F0-04: antes esto caia a un literal publicado en el repositorio
  // ('cf_internal_proxy_secret') cuando INTERNAL_API_KEY no estaba definida. Como
  // verifyAuth construye la sesion COMPLETA a partir de cabeceras —incluidos el rol
  // y la lista de permisos—, conocer ese literal permitia suplantar a cualquier
  // usuario de cualquier empresa en toda superficie que no pase por el proxy.
  //
  // Ahora, si la variable no esta definida, la via de cabeceras queda DESACTIVADA y
  // la peticion cae al camino normal de cookie + JWT firmado (mas abajo en esta
  // misma funcion). Es algo mas lento, pero no confia en un secreto conocido.
  const expectedSignature = process.env.INTERNAL_API_KEY;

  if (expectedSignature && userId && companyId && role && roleId) {
    if (internalSignature !== expectedSignature) {
      console.warn(`[Security] Spoofed internal headers detected from IP. Missing or invalid x-internal-proxy-signature.`);
      return null;
    }
    let allowedWarehouses: string[] = [];
    if (allowedWarehousesHeader) {
      try {
        allowedWarehouses = JSON.parse(allowedWarehousesHeader);
      } catch (_) {
        allowedWarehouses = allowedWarehousesHeader ? allowedWarehousesHeader.split(',') : [];
      }
    }
    let permissions: string[] = [];
    if (permissionsHeader) {
      try {
        permissions = JSON.parse(permissionsHeader);
      } catch (_) {
        permissions = permissionsHeader ? permissionsHeader.split(',') : [];
      }
    }
    return {
      userId,
      companyId,
      role,
      roleId,
      sessionId,
      allowedWarehouses,
      permissions,
      modo,
    };
  }

  const accessToken = req.cookies.get('accessToken')?.value;
  const refreshToken = req.cookies.get('refreshToken')?.value;

  // 1. Try to verify the access token
  if (accessToken) {
    try {
      const decoded = jwt.verify(accessToken, JWT_SECRET) as any;
      const environmentCookie = req.cookies.get('cf_environment')?.value;
      const reqModo = environmentCookie === 'PRUEBA' ? 'PRUEBA' : 'PRODUCCION';
      return {
        userId: decoded.userId,
        companyId: decoded.companyId,
        role: decoded.role,
        roleId: decoded.roleId,
        sessionId: decoded.sessionId,
        allowedWarehouses: decoded.allowedWarehouses || [],
        permissions: decoded.permissions || [],
        modo: reqModo,
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
        // Reused token! Kill ALL active sessions of this user as a security measure.
        //
        // A proposito SIN filtrar por companyId ni modo: ante un token robado
        // hay que cerrar todas las sesiones del usuario, tambien las de otras
        // empresas y las del otro entorno. Acotarlo dejaria vivas justo las
        // sesiones que el atacante podria seguir usando.
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

    // Fetch updated allowed warehouses
    const allowedWarehouses = await fetchAllowedWarehouses(userWithRole.id, userWithRole.roleName);
    
    // Fetch user permissions
    // La empresa que manda aqui es la de la SESION, no users.company_id: el rol
    // `sistemas` puede haber cambiado de empresa y sus permisos tienen que
    // resolverse contra la empresa en la que esta trabajando.
    const permissionsList = await RbacService.getUserPermissions(
      userWithRole.id,
      userWithRole.roleName,
      userWithRole.roleId,
      session.companyId
    );

    // Generate new Access and Refresh tokens
    const newSessionId = session.id;
    const newAccessToken = jwt.sign(
      {
        userId: userWithRole.id,
        companyId: session.companyId,
        role: userWithRole.roleName,
        roleId: userWithRole.roleId,
        sessionId: newSessionId,
        allowedWarehouses,
        permissions: permissionsList,
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
      `accessToken=${newAccessToken}; Path=/; HttpOnly${SECURE_FLAG}; SameSite=Strict; Max-Age=900`
    );
    resHeaders.append(
      'Set-Cookie',
      `refreshToken=${newRefreshToken}; Path=/; HttpOnly${SECURE_FLAG}; SameSite=Strict; Max-Age=604800`
    );

    const environmentCookie = req.cookies.get('cf_environment')?.value;
    const reqModo = environmentCookie === 'PRUEBA' ? 'PRUEBA' : 'PRODUCCION';
    return {
      userId: userWithRole.id,
      companyId: session.companyId,
      role: userWithRole.roleName,
      roleId: userWithRole.roleId,
      sessionId: newSessionId,
      allowedWarehouses,
      permissions: permissionsList,
      modo: reqModo,
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

  // Fetch allowed warehouses
  const allowedWarehouses = await fetchAllowedWarehouses(userId, role);

  // Fetch user permissions
  const permissionsList = await RbacService.getUserPermissions(userId, role, roleId, companyId);

  // Generate tokens
  const accessToken = jwt.sign(
    { userId, companyId, role, roleId, sessionId, allowedWarehouses, permissions: permissionsList },
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
    `accessToken=${accessToken}; Path=/; HttpOnly${SECURE_FLAG}; SameSite=Strict; Max-Age=900`
  );
  resHeaders.append(
    'Set-Cookie',
    `refreshToken=${refreshToken}; Path=/; HttpOnly${SECURE_FLAG}; SameSite=Strict; Max-Age=604800`
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
    `accessToken=; Path=/; HttpOnly${SECURE_FLAG}; SameSite=Strict; Max-Age=0`
  );
  resHeaders.append(
    'Set-Cookie',
    `refreshToken=; Path=/; HttpOnly${SECURE_FLAG}; SameSite=Strict; Max-Age=0`
  );
}
