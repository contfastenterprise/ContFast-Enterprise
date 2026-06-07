import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const refreshToken = request.cookies.get('refreshToken')?.value;

  // Protected pages
  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/invoices') ||
    pathname.startsWith('/cash');

  if (isProtectedRoute && !refreshToken) {
    // Redirect to login if trying to access protected route without session
    const loginUrl = new URL('/auth/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/auth/login' && refreshToken) {
    // Redirect to dashboard if trying to access login page while already logged in
    const dashboardUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
