'use client';

import { useRbac } from '@/components/providers/rbacContext';

/**
 * Custom hook to get all permissions and check general access.
 */
export function usePermissions() {
  const { permissions, user, hasPermission, hasRole } = useRbac();
  
  return {
    permissions,
    user,
    role: user?.role || '',
    hasPermission,
    hasRole,
  };
}

/**
 * Custom hook to check if the current user can execute a specific action on a module.
 */
export function useCan(module: string, action: string): boolean {
  const { hasPermission } = useRbac();
  return hasPermission(module, action);
}

/**
 * Custom hook to check if the user has a specific role.
 */
export function useRole(roleName: string): boolean {
  const { hasRole } = useRbac();
  return hasRole(roleName);
}

/**
 * Custom hook to fetch all actions allowed for a specific module.
 */
export function useModulePermissions(module: string) {
  const { permissions } = useRbac();
  const lowerModule = module.toLowerCase();

  return {
    canRead: permissions.includes(`${lowerModule}:read`),
    canWrite: permissions.includes(`${lowerModule}:write`),
    canDelete: permissions.includes(`${lowerModule}:delete`),
    canExecute: permissions.includes(`${lowerModule}:execute`),
  };
}

/**
 * Custom hook to get raw user permissions array.
 */
export function useUserPermissions() {
  const { permissions } = useRbac();
  return permissions;
}
