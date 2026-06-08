import { redirect } from 'next/navigation';

/**
 * Root page — redirects to the dashboard.
 * The middleware handles auth-guard and redirects to /auth/login if unauthenticated.
 */
export default function RootPage() {
  redirect('/dashboard');
}
