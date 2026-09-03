import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import ClientLayout from './ClientLayout';
import { UserProfile } from '@/types/rbac';
import { db, users, roles, companies } from '@/db';
import { eq, count } from 'drizzle-orm';
import { RbacService } from '@/services/auth/rbacService';
import { CompanyRepository } from '@/repositories/companyRepository';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Dashboard - ContFast Enterprise',
};

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // 1. Check Setup Status
  const result = await db.select({ value: count() }).from(companies);
  const totalCompanies = result[0]?.value || 0;
  if (totalCompanies === 0) {
    redirect('/setup');
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get('accessToken')?.value;
  let initialUser: UserProfile | null = null;
  let initialSettings: any = null;
  
  if (accessToken) {
    try {
      // Decode JWT locally for SSR. Validation is done by Edge proxy.
      const decoded = jwt.decode(accessToken) as any;
      if (decoded && decoded.userId) {
        
        // 2. Fetch full user profile instead of just trusting token
        const [user] = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            companyId: users.companyId,
            avatarUrl: users.avatarUrl,
            avatarPath: users.avatarPath,
            role: roles.name,
            roleId: users.roleId,
          })
          .from(users)
          .innerJoin(roles, eq(users.roleId, roles.id))
          .where(eq(users.id, decoded.userId))
          .limit(1);

        if (user) {
          // Bug reportado (2026-09-03): un usuario 'sistemas' que cambia de
          // empresa (switch-company) veia el selector y el header volver
          // siempre a su empresa de origen en cuanto recargaba la pagina.
          //
          // switch-company NUNCA toca `users.company_id` -- ese campo es el
          // HOGAR del usuario, fijo. Lo que cambia es el `companyId` firmado
          // en el JWT de la sesion (ver middleware/auth.ts, createSession).
          // Esta pantalla, en vez de leer ese campo del token, volvia a
          // resolver la empresa desde `users.companyId` -- por eso cada
          // recarga deshacia el cambio, aunque la sesion siguiera apuntando
          // bien a la otra empresa (las rutas /api/* SI leen `auth.companyId`
          // correctamente via verifyAuth, que es por lo que el resto del
          // sistema funcionaba con normalidad tras el cambio).
          //
          // `decoded.companyId` recibe la misma confianza que ya se le da a
          // `decoded.userId` un poco mas arriba: esta ruta no re-verifica la
          // firma porque el proxy de Edge ya la valido antes de dejar pasar
          // la peticion (ver el comentario de mas arriba).
          const companyIdActivo = decoded.companyId || user.companyId;
          const userPermissionsList = await RbacService.getUserPermissions(user.id, user.role, user.roleId, companyIdActivo);
          initialUser = {
            id: user.id,
            companyId: companyIdActivo,
            role: user.role,
            permissions: userPermissionsList,
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl,
            avatarPath: user.avatarPath,
          };
          
          // 3. Fetch company settings
          const settings = await CompanyRepository.getSettings(companyIdActivo);
          const company = await CompanyRepository.getProfile(companyIdActivo);
          if (settings) {
            initialSettings = {
              ...settings,
              companyName: company?.name || null,
              rnc: company?.rnc || null,
              address: company?.address || null,
            };
          }
        }
      }
    } catch(e) {
      console.warn('Failed to parse accessToken for initialUser', e);
    }
  }
  
  if (!initialUser) {
    redirect('/auth/login');
  }

  return (
    <ClientLayout initialUser={initialUser} initialSettings={initialSettings}>
      {children}
    </ClientLayout>
  );
}
