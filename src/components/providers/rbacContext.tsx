'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export interface RouteMapping {
  id: string;
  routePattern: string;
  module: string;
  action: string | null;
}

export interface RbacContextType {
  user: any;
  permissions: string[];
  routeMappings: RouteMapping[];
  loading: boolean;
  hasPermission: (module: string, action: string) => boolean;
  hasRole: (roleName: string) => boolean;
  canAccessRoute: (path: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

const RbacContext = createContext<RbacContextType | undefined>(undefined);

export function RbacProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [routeMappings, setRouteMappings] = useState<RouteMapping[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessionData = async () => {
    try {
      setLoading(true);
      const [meRes, mappingsRes] = await Promise.all([
        fetch('/api/v1/auth/me'),
        fetch('/api/v1/auth/route-mappings'),
      ]);

      if (meRes.ok && mappingsRes.ok) {
        const meData = await meRes.json();
        const mappingsData = await mappingsRes.json();

        if (meData.success && meData.data?.user) {
          setUser(meData.data.user);
          setPermissions(meData.data.user.permissions || []);
        }
        if (mappingsData.success && mappingsData.data) {
          setRouteMappings(mappingsData.data);
        }
      }
    } catch (err) {
      console.error('[RBAC Provider Error]: Failed to fetch permissions data.', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionData();
  }, []);

  const hasPermission = (module: string, action: string): boolean => {
    if (!user) return false;
    const userRole = (user.role || '').toLowerCase();

    // Technical override for systems & admin roles
    if (userRole.includes('sistema')) return true;
    if (userRole.includes('admin')) {
      if (module === 'auditoria' || module === 'administracion') {
        return action === 'read';
      }
      return true;
    }

    return permissions.includes(`${module.toLowerCase()}:${action.toLowerCase()}`);
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
