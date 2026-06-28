/**
 * Los 6 roles estándar que se crean automáticamente al registrar una nueva empresa.
 * Esta lista es la fuente única de verdad para todos los flujos de creación de empresa
 * (setup, admin, register).
 */
export const DEFAULT_COMPANY_ROLES = [
  { name: 'sistemas', description: 'Ingeniero de sistemas - Acceso Total técnico', isFixed: true },
  { name: 'administracion', description: 'Administración - Acceso completo operativo', isFixed: true },
  { name: 'contabilidad', description: 'Contabilidad y Finanzas', isFixed: false },
  { name: 'facturacion', description: 'Facturación y Ventas', isFixed: false },
  { name: 'banco', description: 'Gestión Bancaria', isFixed: false },
  { name: 'cajero', description: 'Cajero Operador de Terminal', isFixed: false },
  { name: 'recursos_humanos', description: 'Rol de Gestión de Recursos Humanos y Nómina', isFixed: true },
] as const;
