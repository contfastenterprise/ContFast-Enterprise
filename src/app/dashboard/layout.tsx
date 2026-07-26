import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import ClientLayout from './ClientLayout';
import { UserProfile } from '@/types/rbac';

export const metadata = {
  title: 'Dashboard - ContFast Enterprise',
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('accessToken')?.value;
  let initialUser: UserProfile | null = null;
  
  if (accessToken) {
    try {
      // Decode JWT locally for SSR. Validation is done by Edge proxy.
      const decoded = jwt.decode(accessToken) as any;
      if (decoded && decoded.userId) {
        initialUser = {
          id: decoded.userId,
          companyId: decoded.companyId,
          role: decoded.role,
          permissions: decoded.permissions || [],
          name: '',
          email: '',
          avatarUrl: null,
          avatarPath: null,
        };
      }
    } catch(e) {
      console.warn('Failed to parse accessToken for initialUser', e);
    }
  }
  
  return (
    <ClientLayout initialUser={initialUser}>
      {children}
    </ClientLayout>
  );
}
