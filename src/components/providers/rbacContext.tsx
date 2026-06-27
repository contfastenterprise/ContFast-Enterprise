'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

import { UserProfile, RouteMapping } from '@/types/rbac';
import { DEFAULT_ROLE_PERMISSIONS } from '@/constants/rolePermissions';
import { DEFAULT_ROUTE_MAPPINGS } from '@/constants/defaultMappings';

export interface RbacContextType {
  user: UserProfile | null;
  permissions: string[];
  routeMappings: RouteMapping[];
  loading: boolean;
  hasPermission: (module: string, action: string) => boolean;
  hasRole: (roleName: string) => boolean;
  canAccessRoute: (path: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

const RbacContext = createContext<RbacContextType | undefined>(undefined);

export function RbacProvider({ 
  children,
  initialUser = null
}: { 
  children: React.ReactNode;
  initialUser?: UserProfile | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserProfile | null>(initialUser);
  const [permissions, setPermissions] = useState<string[]>(initialUser?.permissions || []);
  const [routeMappings, setRouteMappings] = useState<RouteMapping[]>(DEFAULT_ROUTE_MAPPINGS);
  const [loading, setLoading] = useState(!initialUser);

  const fetchSessionData = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch user session and permissions
      const meRes = await fetch('/api/v1/auth/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.success && meData.data?.user) {
          setUser(meData.data.user);
          setPermissions(meData.data.user.permissions || []);
        }
      }

      // 2. Fetch route mappings independently
      try {
        const mappingsRes = await fetch('/api/v1/auth/route-mappings');
        if (mappingsRes.ok) {
          const mappingsData = await mappingsRes.json();
          if (mappingsData.success && mappingsData.data && mappingsData.data.length > 0) {
            setRouteMappings(mappingsData.data);
          }
        }
      } catch (mappingErr) {
        console.error('[RBAC Provider] Failed to fetch route mappings, using fallbacks:', mappingErr);
      }
    } catch (err) {
      console.error('[RBAC Provider Error]: Failed to fetch permissions data.', err);
    } finally {
      setLoading(false);
    }
  };

  // Sync reactive updates of initialUser prop from layout down to provider state
  useEffect(() => {
    if (initialUser) {
      setUser(initialUser);
      setPermissions(initialUser.permissions || []);
      setLoading(false);
    }
  }, [initialUser]);

  useEffect(() => {
    fetchSessionData();
  }, []);

  const hasPermission = (module: string, action: string): boolean => {
    if (!user) return false;
    const userRole = (user.role || '').toLowerCase();
    const permissionKey = `${module.toLowerCase()}:${action.toLowerCase()}`;

    // 1. Fixed roles: sistemas tiene acceso total
    if (userRole.includes('sistema')) return true;

    // 2. Administración tiene acceso a todo excepto auditoria/administracion que es solo lectura
    if (userRole.includes('admin') || userRole === 'administracion') {
      if (module === 'auditoria' || module === 'administracion') {
        return action === 'read';
      }
      return true;
    }

    // 3. Check permissions list from server (resolved from DB role_permissions + user_permissions)
    if (permissions.includes(permissionKey)) return true;

    // 4. Fallback to DEFAULT_ROLE_PERMISSIONS for roles not fully seeded in DB yet
    const roleDefaults = DEFAULT_ROLE_PERMISSIONS[userRole];
    if (roleDefaults && roleDefaults[permissionKey] === true) return true;

    return false;
  };

  const hasRole = (roleName: string): boolean => {
    if (!user) return false;
    const userRole = (user.role || '').toLowerCase();
    const target = roleName.toLowerCase();
    
    // Homologate systems/sistema
    if (target === 'sistemas' || target === 'sistema') {
      return userRole === 'sistemas';
    }
    
    return userRole === target || userRole.includes(target);
  };

  const canAccessRoute = (path: string): boolean => {
    if (!user) return false;
    const userRole = (user.role || '').toLowerCase();

    if (userRole.includes('sistema')) return true;

    // Sort by pattern length descending to match most specific route first
    const sortedMappings = [...routeMappings].sort(
      (a, b) => b.routePattern.length - a.routePattern.length
    );

    for (const mapping of sortedMappings) {
      const pattern = mapping.routePattern;
      
      // SQL LIKE to regex translation
      const regexPattern = '^' + pattern
        .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
        .replace(/%/g, '.*') + '$';
        
      const regex = new RegExp(regexPattern, 'i');
      if (regex.test(path)) {
        const module = mapping.module;
        // Default action is read for views
        const action = mapping.action || 'read';

        return hasPermission(module, action);
      }
    }

    // If no route mapping exists in database, fallback to allow access
    return true;
  };

  // Perform client-side route protection checking in real-time
  useEffect(() => {
    if (!loading && user && pathname) {
      if (pathname === '/403') return;
      
      const allowed = canAccessRoute(pathname);
      if (!allowed) {
        // Log access denied attempt in backend for auditing
        fetch('/api/v1/auth/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            route: pathname,
            method: 'GET',
            allowed: false,
            reason: 'Acceso bloqueado en cliente (RBAC).',
          }),
        }).finally(() => {
          router.replace('/403');
        });
      }
    }
  }, [pathname, user, loading]);

  return (
    <RbacContext.Provider
      value={{
        user,
        permissions,
        routeMappings,
        loading,
        hasPermission,
        hasRole,
        canAccessRoute,
        refreshPermissions: fetchSessionData,
      }}
    >
      {loading ? (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-medium animate-pulse">Cargando autorizaciones...</p>
        </div>
      ) : (
        children
      )}
    </RbacContext.Provider>
  );
}

export function useRbac() {
  const context = useContext(RbacContext);
  if (context === undefined) {
    throw new Error('useRbac must be used within an RbacProvider');
  }
  return context;
}
