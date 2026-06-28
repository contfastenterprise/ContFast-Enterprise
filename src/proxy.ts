import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) {
  throw new Error('La variable de entorno JWT_SECRET es obligatoria y debe estar definida.');
}

// Edge-compatible HS256 JWT Verification using Web Crypto API
async function verifyHS256(token: string, secret: string): Promise<any | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Import the secret key
    const encoder = new TextEncoder();
    const secretKeyData = encoder.encode(secret);
    
    const key = await crypto.subtle.importKey(
      'raw',
      secretKeyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Verify signature
    const dataToVerify = encoder.encode(`${headerB64}.${payloadB64}`);
    
    const base64UrlDecode = (str: string) => {
      let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      return atob(base64);
    };

    const signatureString = base64UrlDecode(signatureB64);
    const signatureBuffer = new Uint8Array(signatureString.length);
    for (let i = 0; i < signatureString.length; i++) {
      signatureBuffer[i] = signatureString.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBuffer,
      dataToVerify
    );

    if (!isValid) return null;

    // Parse payload
    const payloadJson = base64UrlDecode(payloadB64);
    const payload = JSON.parse(payloadJson);

    // Check expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null; // Expired
    }

    return payload;
  } catch (err) {
    console.error('[Proxy-Auth] Error verifying token:', err);
    return null;
  }
}

const STATIC_ROUTE_MAPPINGS = [
  { pattern: /^\/dashboard\/accounting/, module: 'contabilidad', action: 'read' },
  { pattern: /^\/api\/v1\/accounting/, module: 'contabilidad', action: null },
  { pattern: /^\/dashboard\/invoices/, module: 'facturacion', action: 'read' },
  { pattern: /^\/api\/v1\/invoices/, module: 'facturacion', action: null },
  { pattern: /^\/dashboard\/adjustments/, module: 'facturacion', action: 'read' },
  { pattern: /^\/api\/v1\/adjustments/, module: 'facturacion', action: null },
  { pattern: /^\/dashboard\/cash/, module: 'caja', action: 'read' },
  { pattern: /^\/api\/v1\/cash/, module: 'caja', action: null },
  { pattern: /^\/dashboard\/bank/, module: 'banco', action: 'read' },
  { pattern: /^\/api\/v1\/bank/, module: 'banco', action: null },
  { pattern: /^\/dashboard\/customers/, module: 'clientes', action: 'read' },
  { pattern: /^\/api\/v1\/customers/, module: 'clientes', action: null },
  { pattern: /^\/dashboard\/suppliers/, module: 'proveedores', action: 'read' },
  { pattern: /^\/api\/v1\/suppliers/, module: 'proveedores', action: null },
  { pattern: /^\/dashboard\/products/, module: 'catalogo', action: 'read' },
  { pattern: /^\/api\/v1\/products/, module: 'catalogo', action: null },
  { pattern: /^\/dashboard\/inventory/, module: 'catalogo', action: 'read' },
  { pattern: /^\/api\/v1\/categories/, module: 'catalogo', action: null },
  { pattern: /^\/api\/v1\/inventory/, module: 'catalogo', action: null },
  { pattern: /^\/dashboard\/reports/, module: 'reportes', action: 'read' },
  { pattern: /^\/api\/v1\/reports/, module: 'reportes', action: null },
  { pattern: /^\/dashboard\/admin/, module: 'administracion', action: 'read' },
  { pattern: /^\/api\/v1\/admin/, module: 'administracion', action: null },
  { pattern: /^\/dashboard\/settings/, module: 'administracion', action: 'read' },
  { pattern: /^\/api\/v1\/company\/settings/, module: 'administracion', action: null },
  { pattern: /^\/dashboard\/hr/, module: 'nomina', action: 'read' },
  { pattern: /^\/api\/v1\/hr/, module: 'nomina', action: null },
  { pattern: /^\/dashboard\/retentions/, module: 'retenciones', action: 'read' },
  { pattern: /^\/api\/v1\/retentions/, module: 'retenciones', action: null },
  { pattern: /^\/dashboard\/delivery-notes/, module: 'conduce', action: 'read' },
  { pattern: /^\/api\/v1\/delivery-notes/, module: 'conduce', action: null },
];

function checkRbacPermission(pathname: string, method: string, decoded: any): boolean {
  // Gracefully handle pre-existing active session tokens that do not contain the permissions payload
  if (decoded.permissions === undefined) {
    return true;
  }

  const userPermissions: string[] = decoded.permissions || [];
  const userRole = (decoded.role || '').toLowerCase();

  const isSistemas = userRole.includes('sistema');
  const isAdmin = userRole.includes('admin');

  // Si es sistemas, tiene acceso total a todo
  if (isSistemas) return true;

  for (const mapping of STATIC_ROUTE_MAPPINGS) {
    if (mapping.pattern.test(pathname)) {
      const module = mapping.module;
      let action: string;

      if (mapping.action) {
        action = mapping.action;
      } else {
        action = method === 'GET' ? 'read' : 'write';
      }

      const requiredPermission = `${module}:${action}`;

      // Admin has full operational access except write/delete on auditoria & administracion
      if (isAdmin) {
        if (module === 'auditoria' || module === 'administracion') {
          return action === 'read';
        }
        return true;
      }

      // Para los demás roles, comprobar la lista de permisos del JWT
      return userPermissions.includes(requiredPermission);
    }
  }

  // Si no coincide con ninguna regla estática del proxy, permitir acceso por defecto
  return true;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // 1. Exclude public assets, static files and internal Next.js paths
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/api/v1/auth/login') ||
    pathname.startsWith('/api/v1/auth/register') ||
    pathname.startsWith('/api/v1/auth/refresh') ||
    pathname.startsWith('/api/v1/setup/status') ||
    pathname.startsWith('/api/v1/setup/confirm') ||
    pathname.startsWith('/api/v1/setup/init') ||
    pathname.startsWith('/auth/login') ||
    pathname.startsWith('/auth/register') ||
    pathname === '/favicon.ico' ||
    pathname === '/contfast-logo.png'
  ) {
    // If authenticated user goes to login/register, redirect them to dashboard
    if (pathname === '/auth/login' || pathname === '/auth/register') {
      const accessToken = req.cookies.get('accessToken')?.value;
      if (accessToken) {
        const decoded = await verifyHS256(accessToken, JWT_SECRET);
        if (decoded) {
          return NextResponse.redirect(new URL('/dashboard', req.url));
        }
      }
    }
    return NextResponse.next();
  }

  // 2. Route Protection Target: /dashboard/*, /api/v1/*, /bank/*, /reports/*, /support/*
  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/api/v1') ||
    pathname.startsWith('/bank') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/support');

  if (isProtectedRoute) {
    const accessToken = req.cookies.get('accessToken')?.value;
    const refreshToken = req.cookies.get('refreshToken')?.value;

    // A. Access Token exists and is valid
    if (accessToken) {
      const decoded = await verifyHS256(accessToken, JWT_SECRET);
      if (decoded) {
        // Enforce RBAC permissions check
        const isAllowed = checkRbacPermission(pathname, method, decoded);
        if (!isAllowed) {
          if (pathname.startsWith('/api/v1')) {
            return NextResponse.json(
              { success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado.' } },
              { status: 403 }
            );
          }
          return NextResponse.redirect(new URL('/403', req.url));
        }

        // Clone request headers to inject security context parameters
        const requestHeaders = new Headers(req.headers);
        requestHeaders.set('x-user-id', decoded.userId);
        requestHeaders.set('x-company-id', decoded.companyId);
        requestHeaders.set('x-user-role', decoded.role);
        requestHeaders.set('x-role-id', decoded.roleId);
        requestHeaders.set('x-session-id', decoded.sessionId);
        requestHeaders.set('x-allowed-warehouses', JSON.stringify(decoded.allowedWarehouses || []));
        requestHeaders.set('x-user-permissions', JSON.stringify(decoded.permissions || []));

        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      }
    }

    // B. Access Token is missing/expired, check if Refresh Token exists to rotate session
    if (refreshToken) {
      console.log(`[Proxy] Access token expired or missing. Attempting token rotation for path: ${pathname}`);
      try {
        const refreshEndpoint = new URL('/api/v1/auth/refresh', req.nextUrl.origin);
        
        // Forward the cookies containing the refresh token to the API
        const refreshResponse = await fetch(refreshEndpoint, {
          method: 'POST',
          headers: {
            'Cookie': `refreshToken=${refreshToken}; accessToken=${accessToken || ''}`,
            'Accept': 'application/json',
          },
        });

        if (refreshResponse.ok) {
          const refreshResult = await refreshResponse.json();
          
          if (refreshResult.success) {
            console.log('[Proxy] Session rotated successfully.');
            
            // Extract the new Set-Cookie headers from the refresh API response
            const responseCookies = refreshResponse.headers.getSetCookie();
            
            // Re-read cookies to find the new access token and extract the session data
            let newAccessToken = '';
            for (const cookieStr of responseCookies) {
              if (cookieStr.startsWith('accessToken=')) {
                newAccessToken = cookieStr.split(';')[0].split('=')[1];
                break;
              }
            }

            // In case we can't parse it directly, decrypter will read it on next hop
            const decodedNew = newAccessToken ? await verifyHS256(newAccessToken, JWT_SECRET) : null;
            
            // Set request headers for downstream controllers
            const requestHeaders = new Headers(req.headers);
            if (decodedNew) {
              // Enforce RBAC permissions check on rotated token
              const isAllowed = checkRbacPermission(pathname, method, decodedNew);
              if (!isAllowed) {
                if (pathname.startsWith('/api/v1')) {
                  return NextResponse.json(
                    { success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado.' } },
                    { status: 403 }
                  );
                }
                return NextResponse.redirect(new URL('/403', req.url));
              }

              requestHeaders.set('x-user-id', decodedNew.userId);
              requestHeaders.set('x-company-id', decodedNew.companyId);
              requestHeaders.set('x-user-role', decodedNew.role);
              requestHeaders.set('x-role-id', decodedNew.roleId);
              requestHeaders.set('x-session-id', decodedNew.sessionId);
              requestHeaders.set('x-allowed-warehouses', JSON.stringify(decodedNew.allowedWarehouses || []));
              requestHeaders.set('x-user-permissions', JSON.stringify(decodedNew.permissions || []));
            }

            // Construct response with request headers overridden to propagate context downstream
            const response = NextResponse.next({
              request: {
                headers: requestHeaders,
              },
            });
            
            // Copy Set-Cookie headers to our response to persist them in client browser
            responseCookies.forEach((cookie) => {
              response.headers.append('Set-Cookie', cookie);
            });

            return response;
          }
        }
      } catch (err) {
        console.error('[Proxy-Auth] Error during token rotation fetch:', err);
      }
    }

    // C. No valid session or refresh failed: Deny Access
    const isApiRoute = pathname.startsWith('/api/v1');
    if (isApiRoute) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Sesión no válida o expirada. Por favor inicie sesión.' } },
        { status: 401 }
      );
    } else {
      // For pages, clear active cookies and redirect to login page
      const response = NextResponse.redirect(new URL('/auth/login', req.url));
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/v1/:path*',
    '/bank/:path*',
    '/reports/:path*',
    '/support/:path*',
    '/auth/:path*',
  ],
};
