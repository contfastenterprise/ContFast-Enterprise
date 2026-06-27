'use client';

import React from 'react';
import { useRbac } from '@/components/providers/rbacContext';

interface PermissionGateProps {
  module: string;
  action: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Gate component that renders its children only if the user has the specified permission.
 * Optional fallback can be provided to display when unauthorized.
 */
export function PermissionGate({
  module,
  action,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { hasPermission } = useRbac();
  const allowed = hasPermission(module, action);

  if (!allowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

interface RoleGateProps {
  role: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Gate component that renders its children only if the user has the specified role.
 * Optional fallback can be provided.
 */
export function RoleGate({
  role,
  children,
  fallback = null,
}: RoleGateProps) {
  const { hasRole } = useRbac();
  const allowed = hasRole(role);

  if (!allowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Semantic wrapper equivalent to PermissionGate.
 */
export const Can = PermissionGate;
export const RequirePermission = PermissionGate;
export const ProtectedRoute = PermissionGate;
