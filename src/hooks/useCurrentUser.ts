import { useRbac } from '@/components/providers/rbacContext';
import { UserProfile } from '@/types/rbac';

/**
 * Hook centralizado para acceder al perfil del usuario autenticado.
 * Encapsula la fuente de verdad (RbacContext) para asegurar que
 * toda la aplicación consume el estado de usuario tipado correctamente
 * sin desincronizaciones.
 */
export function useCurrentUser(): { user: UserProfile | null; loading: boolean } {
  const { user, loading } = useRbac();
  return { user, loading };
}
