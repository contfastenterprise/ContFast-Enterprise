import { RouteMapping } from '@/types/rbac';

export const DEFAULT_ROUTE_MAPPINGS: RouteMapping[] = [
  // 1. Principal
  { id: '1', routePattern: '/dashboard', module: 'caja', action: 'read', isMenuItem: true, displayName: 'Inicio', groupName: 'Principal', iconName: 'LayoutDashboard', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '35', routePattern: '/dashboard/bi%', module: 'administracion', action: 'read', isMenuItem: true, displayName: 'Inteligencia de Negocios', groupName: 'Principal', iconName: 'PieChart', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  
  // 2. Contactos
  { id: '2', routePattern: '/dashboard/customers%', module: 'clientes', action: 'read', isMenuItem: true, displayName: 'Clientes', groupName: 'Contactos', iconName: 'Users', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '3', routePattern: '/dashboard/suppliers%', module: 'proveedores', action: 'read', isMenuItem: true, displayName: 'Suplidores', groupName: 'Contactos', iconName: 'Truck', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  
  // 3. Inventario
  { id: '4', routePattern: '/dashboard/warehouses%', module: 'catalogo', action: 'read', isMenuItem: true, displayName: 'Almacenes', groupName: 'Inventario', iconName: 'Building2', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '5', routePattern: '/dashboard/inventory/categories%', module: 'catalogo', action: 'read', isMenuItem: true, displayName: 'Categorias', groupName: 'Inventario', iconName: 'Tag', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  { id: '6', routePattern: '/dashboard/products%', module: 'catalogo', action: 'read', isMenuItem: true, displayName: 'Productos', groupName: 'Inventario', iconName: 'Package', orderIndex: 30, createdAt: new Date(), updatedAt: new Date() },
  { id: '7', routePattern: '/dashboard/delivery-notes%', module: 'conduce', action: 'read', isMenuItem: true, displayName: 'Conduces', groupName: 'Inventario', iconName: 'Truck', orderIndex: 40, createdAt: new Date(), updatedAt: new Date() },
  { id: '8', routePattern: '/dashboard/inventory/transfer%', module: 'catalogo', action: 'read', isMenuItem: true, displayName: 'Traslados', groupName: 'Inventario', iconName: 'ArrowRightLeft', orderIndex: 50, createdAt: new Date(), updatedAt: new Date() },
  { id: '9', routePattern: '/dashboard/inventory/adjustments%', module: 'catalogo', action: 'read', isMenuItem: true, displayName: 'Ajustes', groupName: 'Inventario', iconName: 'PackageMinus', orderIndex: 60, createdAt: new Date(), updatedAt: new Date() },
  { id: '10', routePattern: '/dashboard/inventory/movements%', module: 'catalogo', action: 'read', isMenuItem: true, displayName: 'Movimientos', groupName: 'Inventario', iconName: 'HistoryIcon', orderIndex: 70, createdAt: new Date(), updatedAt: new Date() },
  
  // 4. Ingresos
  { id: '11', routePattern: '/dashboard/invoices%', module: 'facturacion', action: 'read', isMenuItem: true, displayName: 'Facturacion e-CF', groupName: 'Ingresos', iconName: 'FileText', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '12', routePattern: '/dashboard/quotes%', module: 'facturacion', action: 'read', isMenuItem: true, displayName: 'Cotizaciones', groupName: 'Ingresos', iconName: 'FileText', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  { id: '13', routePattern: '/dashboard/adjustments%', module: 'facturacion', action: 'read', isMenuItem: true, displayName: 'Credito / Debito', groupName: 'Ingresos', iconName: 'FileMinus', orderIndex: 30, createdAt: new Date(), updatedAt: new Date() },
  { id: '14', routePattern: '/dashboard/cash%', module: 'caja', action: 'read', isMenuItem: true, displayName: 'Modulo de Caja', groupName: 'Ingresos', iconName: 'Wallet', orderIndex: 40, createdAt: new Date(), updatedAt: new Date() },
  { id: '15', routePattern: '/dashboard/receivables%', module: 'cobros', action: 'read', isMenuItem: true, displayName: 'Pagos y Abonos', groupName: 'Ingresos', iconName: 'HandCoins', orderIndex: 50, createdAt: new Date(), updatedAt: new Date() },
  { id: '16', routePattern: '/dashboard/retentions%', module: 'retenciones', action: 'read', isMenuItem: true, displayName: 'Retenciones', groupName: 'Ingresos', iconName: 'ShieldAlert', orderIndex: 60, createdAt: new Date(), updatedAt: new Date() },
  
  // 5. Egresos
  { id: '17', routePattern: '/dashboard/purchases%', module: 'proveedores', action: 'read', isMenuItem: true, displayName: 'Compras y Gastos', groupName: 'Egresos', iconName: 'Banknote', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '18', routePattern: '/dashboard/ap%', module: 'proveedores', action: 'read', isMenuItem: true, displayName: 'Cuentas por Pagar', groupName: 'Egresos', iconName: 'Receipt', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  
  // 6. Finanzas
  { id: '19', routePattern: '/dashboard/bank%', module: 'banco', action: 'read', isMenuItem: true, displayName: 'Cuentas Bancarias', groupName: 'Finanzas', iconName: 'Landmark', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '20', routePattern: '/dashboard/accounting%', module: 'contabilidad', action: 'read', isMenuItem: true, displayName: 'Contabilidad', groupName: 'Finanzas', iconName: 'BookOpen', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  { id: '21', routePattern: '/dashboard/reports%', module: 'reportes', action: 'read', isMenuItem: true, displayName: 'Reportes', groupName: 'Finanzas', iconName: 'PieChart', orderIndex: 30, createdAt: new Date(), updatedAt: new Date() },
  
  // 7. Recursos Humanos
  { id: '22', routePattern: '/dashboard/hr', module: 'nomina', action: 'read', isMenuItem: true, displayName: 'Dashboard RRHH', groupName: 'Recursos Humanos', iconName: 'LayoutDashboard', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '23', routePattern: '/dashboard/hr/employees%', module: 'nomina', action: 'read', isMenuItem: true, displayName: 'Empleados', groupName: 'Recursos Humanos', iconName: 'Users', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  { id: '24', routePattern: '/dashboard/hr/departments%', module: 'nomina', action: 'read', isMenuItem: true, displayName: 'Departamentos', groupName: 'Recursos Humanos', iconName: 'Building2', orderIndex: 30, createdAt: new Date(), updatedAt: new Date() },
  { id: '25', routePattern: '/dashboard/hr/payroll%', module: 'nomina', action: 'read', isMenuItem: true, displayName: 'Nominas', groupName: 'Recursos Humanos', iconName: 'Banknote', orderIndex: 40, createdAt: new Date(), updatedAt: new Date() },
  { id: '26', routePattern: '/dashboard/hr/overtime%', module: 'nomina', action: 'read', isMenuItem: true, displayName: 'Horas Extras y Adicionales', groupName: 'Recursos Humanos', iconName: 'Calculator', orderIndex: 50, createdAt: new Date(), updatedAt: new Date() },
  { id: '27', routePattern: '/dashboard/hr/settlements%', module: 'nomina', action: 'read', isMenuItem: true, displayName: 'Liquidacion y Prestaciones', groupName: 'Recursos Humanos', iconName: 'ShieldAlert', orderIndex: 60, createdAt: new Date(), updatedAt: new Date() },
  { id: '28', routePattern: '/dashboard/hr/config%', module: 'nomina', action: 'read', isMenuItem: true, displayName: 'Configuracion de Ley', groupName: 'Recursos Humanos', iconName: 'Settings', orderIndex: 70, createdAt: new Date(), updatedAt: new Date() },
  
  // 8. Herramientas
  { id: '29', routePattern: '/dashboard/tools/desglose/ventanas%', module: 'facturacion', action: 'read', isMenuItem: true, displayName: 'Desglose Ventanas', groupName: 'Herramientas', iconName: 'Calculator', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '30', routePattern: '/dashboard/tools/glass-cutting%', module: 'facturacion', action: 'read', isMenuItem: true, displayName: 'Corte de Vidrio', groupName: 'Herramientas', iconName: 'Layers', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  
  // 9. Sistema
  { id: '31', routePattern: '/dashboard/settings%', module: 'administracion', action: 'read', isMenuItem: true, displayName: 'Ajustes', groupName: 'Sistema', iconName: 'Settings', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '32', routePattern: '/dashboard/ecf%', module: 'facturacion', action: 'read', isMenuItem: true, displayName: 'Comprobantes Fiscales', groupName: 'Sistema', iconName: 'ShieldCheck', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  { id: '33', routePattern: '/dashboard/admin/companies%', module: 'administracion', action: 'read', isMenuItem: true, displayName: 'Empresas', groupName: 'Sistema', iconName: 'Building2', orderIndex: 30, createdAt: new Date(), updatedAt: new Date() },
  { id: '34', routePattern: '/dashboard/admin', module: 'administracion', action: 'read', isMenuItem: true, displayName: 'Administracion', groupName: 'Sistema', iconName: 'Shield', orderIndex: 40, createdAt: new Date(), updatedAt: new Date() }
];