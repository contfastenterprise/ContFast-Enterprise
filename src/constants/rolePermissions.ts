/**
 * Default base permissions for each editable role.
 * This file is safe to import in both client and server contexts.
 * Keep in sync with src/middleware/permissions.ts DEFAULT_ROLE_PERMISSIONS.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<string, boolean>> = {
  contabilidad: {
    'contabilidad:read': true,
    'contabilidad:write': true,
    'banco:read': true,
    'banco:write': true,
    'proveedores:read': true,
    'proveedores:write': true,
    'clientes:read': true,
    'cobros:read': true,
    'cobros:write': true,
  },
  facturacion: {
    'facturacion:read': true,
    'facturacion:write': true,
    'clientes:read': true,
    'clientes:write': true,
    'catalogo:read': true,
    'caja:read': true,
    'caja:write': true,
    'cobros:read': true,
    'cobros:write': true,
    'conduce:read': true,
    'conduce:write': true,
  },
  banco: {
    'banco:read': true,
    'banco:write': true,
    'proveedores:read': true,
    'cobros:read': true,
    'cobros:write': true,
  },
  cajero: {
    'caja:read': true,
    'caja:write': true,
    'catalogo:read': true,
    'clientes:read': true,
    'clientes:write': true,
    'facturacion:read': false,
    'facturacion:write': false,
  },
  recursos_humanos: {
    'nomina:read': true,
    'nomina:write': true,
    'clientes:read': true,
    'catalogo:read': true,
  },
  compras: {
    'proveedores:read': true,
    'proveedores:write': true,
    'proveedores:delete': true,
    'contabilidad:read': true,
    'banco:read': true,
    'banco:write': true,
  },
};
