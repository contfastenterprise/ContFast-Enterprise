import { NextRequest, NextResponse } from 'next/server';

// Static mappings to avoid Edge database query limitations
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

function decodeJwt(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64);
    return JSON.parse(decoded);
  } catch (err) {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // 1. Skip public assets and auth paths
  if (
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/setup') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/v1/auth/login') ||
    pathname.startsWith('/api/v1/auth/register') ||
    pathname.startsWith('/api/v1/setup/') ||
    pathname === '/403' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const accessToken = req.cookies.get('accessToken')?.value;
  const refreshToken = req.cookies.get('refreshToken')?.value;

  // 2. Authentication check
  if (!accessToken && !refreshToken) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHENTICATED', message: 'Sesión no iniciada.' } },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL('/auth/login', req.url));
  }

  // 3. If access token exists, check permissions
  if (accessToken) {
    const decoded = decodeJwt(accessToken);
    if (decoded) {
      const isExpired = decoded.exp ? Date.now() / 1000 > decoded.exp : true;
      
      // Only enforce permissions if the token is still valid (not expired)
      // If expired, let it proceed to backend so verifyAuth handles rotation
      if (!isExpired) {
        const userPermissions: string[] = decoded.permissions || [];
        const userRole = (decoded.role || '').toLowerCase();

        // Admin and Sistemas have override access to operational routes
        const isSistemas = userRole.includes('sistema');
        const isAdmin = userRole.includes('admin');

        // Resolve path to required module
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

            // Check authorization rules
            let isAllowed = false;
            if (isSistemas) {
              isAllowed = true;
            } else if (isAdmin) {
              // Admin has full operational access except write/delete on auditoria & administracion
              if (module === 'auditoria' || module === 'administracion') {
                isAllowed = action === 'read';
              } else {
                isAllowed = true;
              }
            } else {
              isAllowed = userPermissions.includes(requiredPermission);
            }

            if (!isAllowed) {
              // Deny access
              if (pathname.startsWith('/api/')) {
                return NextResponse.json(
                  { success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado.' } },
                  { status: 403 }
                );
              }
              return NextResponse.redirect(new URL('/403', req.url));
            }
            break;
          }
        }
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/v1/:path*'],
};
