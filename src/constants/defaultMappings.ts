import { RouteMapping } from '@/types/rbac';

//  LOTE 208: `/dashboard/bi` y `/dashboard/proposals` dejan de ser ELEMENTOS DE MENU
//  (`isMenuItem: false`), a peticion del dueño: se ven ahora como pestañas del inicio.
//
//  LAS FILAS NO SE BORRAN, Y ESO ES DELIBERADO. Cada fila de `route_mappings` no solo
//  pone un enlace en el menu: lleva el `module` y la `action` con los que
//  `canAccessRoute` decide QUIEN puede entrar en esa ruta. Sin fila, la ruta se queda sin
//  permiso asignado. Ademas la tabla no tiene `company_id`, asi que un borrado afectaria
//  a las SEIS empresas a la vez -- es exactamente el error que el lote 190 estuvo a punto
//  de cometer con `antiguedad-saldos`.
//
//  LOTE 286: los NOMBRES de esta siembra son los de `route_mappings` en PRODUCCION
//  (medido el 2026-10-04, solo lectura). Los cuatro renombres del lote 190 ya estaban en la
//  base y aqui no: "Pagos a Suplidores" (/dashboard/ap), "Ajustes de Inventario",
//  "Configuración" (/dashboard/settings) y "Cuenta por Cobrar" (/dashboard/receivables-report,
//  en singular, como en la base). Esta lista es lo que ve el menu antes de que llegue la
//  respuesta de la base (`rbacContext`) y lo que nace en una base nueva (`seed-routes`), asi
//  que tiene que decir lo mismo que la base. Lo que NO se toco, a proposito, porque es
//  permiso y no nombre: el `module` de /dashboard/financial/accounts-receivable y
//  accounts-payable (aqui `caja`; en la base `cobros` y `proveedores`) y las dos filas de
//  /dashboard/antiguedad-saldos, que estan en la base y no aqui. Lo vigila
//  `scratch/verificar_menu_como_la_base.ts`.
export const DEFAULT_ROUTE_MAPPINGS: RouteMapping[] = [
  // 1. Principal
  { id: '1', routePattern: '/dashboard', module: 'caja', action: 'read', isMenuItem: true, displayName: 'Inicio', groupName: 'Principal', iconName: 'LayoutDashboard', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '35', routePattern: '/dashboard/bi%', module: 'administracion', action: 'read', isMenuItem: false, displayName: 'Inteligencia de Negocios', groupName: 'Principal', iconName: 'PieChart', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  { id: '35b', routePattern: '/dashboard/proposals%', module: 'administracion', action: 'read', isMenuItem: false, displayName: 'Agente Empresarial (IA)', groupName: 'Principal', iconName: 'BrainCircuit', orderIndex: 25, createdAt: new Date(), updatedAt: new Date() },
  
  // 2. Contactos
  { id: '2', routePattern: '/dashboard/customers%', module: 'clientes', action: 'read', isMenuItem: true, displayName: 'Clientes', groupName: 'Contactos', iconName: 'Users', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '3', routePattern: '/dashboard/suppliers%', module: 'proveedores', action: 'read', isMenuItem: true, displayName: 'Suplidores', groupName: 'Contactos', iconName: 'Truck', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  
  // 3. Inventario
  { id: '4', routePattern: '/dashboard/warehouses%', module: 'catalogo', action: 'read', isMenuItem: true, displayName: 'Almacenes', groupName: 'Inventario', iconName: 'Building2', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '5', routePattern: '/dashboard/inventory/categories%', module: 'catalogo', action: 'read', isMenuItem: true, displayName: 'Categorias', groupName: 'Inventario', iconName: 'Tag', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  { id: '6', routePattern: '/dashboard/products%', module: 'catalogo', action: 'read', isMenuItem: true, displayName: 'Productos', groupName: 'Inventario', iconName: 'Package', orderIndex: 30, createdAt: new Date(), updatedAt: new Date() },
  { id: '6b', routePattern: '/dashboard/products/barcodes%', module: 'catalogo', action: 'read', isMenuItem: true, displayName: 'Códigos de Barra', groupName: 'Inventario', iconName: 'Printer', orderIndex: 35, createdAt: new Date(), updatedAt: new Date() },
  { id: '7', routePattern: '/dashboard/delivery-notes%', module: 'conduce', action: 'read', isMenuItem: true, displayName: 'Conduces', groupName: 'Inventario', iconName: 'Truck', orderIndex: 40, createdAt: new Date(), updatedAt: new Date() },
  { id: '8', routePattern: '/dashboard/inventory/transfer%', module: 'catalogo', action: 'read', isMenuItem: true, displayName: 'Traslados', groupName: 'Inventario', iconName: 'ArrowRightLeft', orderIndex: 50, createdAt: new Date(), updatedAt: new Date() },
  { id: '9', routePattern: '/dashboard/inventory/adjustments%', module: 'catalogo', action: 'read', isMenuItem: true, displayName: 'Ajustes de Inventario', groupName: 'Inventario', iconName: 'PackageMinus', orderIndex: 60, createdAt: new Date(), updatedAt: new Date() },
  { id: '10', routePattern: '/dashboard/inventory/movements%', module: 'catalogo', action: 'read', isMenuItem: true, displayName: 'Movimientos', groupName: 'Inventario', iconName: 'HistoryIcon', orderIndex: 70, createdAt: new Date(), updatedAt: new Date() },
  { id: '10b', routePattern: '/dashboard/inventory/reorder%', module: 'catalogo', action: 'read', isMenuItem: true, displayName: 'Sugerencias de Reorden', groupName: 'Inventario', iconName: 'AlertTriangle', orderIndex: 80, createdAt: new Date(), updatedAt: new Date() },
  
  // 4. Ingresos
  { id: '11', routePattern: '/dashboard/invoices%', module: 'facturacion', action: 'read', isMenuItem: true, displayName: 'Facturacion e-CF', groupName: 'Ingresos', iconName: 'FileText', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '12', routePattern: '/dashboard/quotes%', module: 'facturacion', action: 'read', isMenuItem: true, displayName: 'Cotizaciones', groupName: 'Ingresos', iconName: 'FileText', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  { id: '13', routePattern: '/dashboard/adjustments%', module: 'facturacion', action: 'read', isMenuItem: true, displayName: 'Credito / Debito', groupName: 'Ingresos', iconName: 'FileMinus', orderIndex: 30, createdAt: new Date(), updatedAt: new Date() },
  { id: '14', routePattern: '/dashboard/cash%', module: 'caja', action: 'read', isMenuItem: true, displayName: 'Modulo de Caja', groupName: 'Ingresos', iconName: 'Wallet', orderIndex: 40, createdAt: new Date(), updatedAt: new Date() },
  { id: '15', routePattern: '/dashboard/receivables%', module: 'cobros', action: 'read', isMenuItem: true, displayName: 'Pagos y Abonos', groupName: 'Ingresos', iconName: 'HandCoins', orderIndex: 50, createdAt: new Date(), updatedAt: new Date() },
  { id: '15b', routePattern: '/dashboard/receivables-report%', module: 'cobros', action: 'read', isMenuItem: true, displayName: 'Cuenta por Cobrar', groupName: 'Ingresos', iconName: 'FileText', orderIndex: 60, createdAt: new Date(), updatedAt: new Date() },
  { id: '16', routePattern: '/dashboard/retentions%', module: 'retenciones', action: 'read', isMenuItem: true, displayName: 'Retenciones', groupName: 'Sistema', iconName: 'ShieldAlert', orderIndex: 25, createdAt: new Date(), updatedAt: new Date() },
  
  // 5. Egresos
  { id: '17', routePattern: '/dashboard/purchases%', module: 'proveedores', action: 'read', isMenuItem: true, displayName: 'Compras y Gastos', groupName: 'Egresos', iconName: 'Banknote', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '18b', routePattern: '/dashboard/purchases/orders%', module: 'proveedores', action: 'read', isMenuItem: true, displayName: 'Pedidos a Suplidores', groupName: 'Egresos', iconName: 'FileText', orderIndex: 15, createdAt: new Date(), updatedAt: new Date() },
  { id: '18', routePattern: '/dashboard/ap%', module: 'proveedores', action: 'read', isMenuItem: true, displayName: 'Pagos a Suplidores', groupName: 'Egresos', iconName: 'Receipt', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },

  
  // 6. Finanzas
  { id: '36', routePattern: '/dashboard/financial%', module: 'contabilidad', action: 'read', isMenuItem: true, displayName: 'Dashboard Financiero', groupName: 'Finanzas', iconName: 'PieChart', orderIndex: 5, createdAt: new Date(), updatedAt: new Date() },
  { id: '37a', routePattern: '/dashboard/financial/accounts-receivable%', module: 'caja', action: 'read', isMenuItem: true, displayName: 'Cuentas por Cobrar', groupName: 'Finanzas', iconName: 'Banknote', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '37', routePattern: '/dashboard/financial/customers%', module: 'contabilidad', action: 'read', isMenuItem: true, displayName: 'E.C. Clientes (CxC)', groupName: 'Finanzas', iconName: 'HandCoins', orderIndex: 15, createdAt: new Date(), updatedAt: new Date() },
  { id: '38a', routePattern: '/dashboard/financial/accounts-payable%', module: 'caja', action: 'read', isMenuItem: true, displayName: 'Cuentas por Pagar', groupName: 'Finanzas', iconName: 'Receipt', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  { id: '38', routePattern: '/dashboard/financial/suppliers%', module: 'contabilidad', action: 'read', isMenuItem: true, displayName: 'E.C. Suplidores (CxP)', groupName: 'Finanzas', iconName: 'Receipt', orderIndex: 25, createdAt: new Date(), updatedAt: new Date() },
  { id: '19', routePattern: '/dashboard/bank%', module: 'banco', action: 'read', isMenuItem: true, displayName: 'Cuentas Bancarias', groupName: 'Finanzas', iconName: 'Landmark', orderIndex: 30, createdAt: new Date(), updatedAt: new Date() },
  { id: '20', routePattern: '/dashboard/accounting%', module: 'contabilidad', action: 'read', isMenuItem: true, displayName: 'Contabilidad', groupName: 'Finanzas', iconName: 'BookOpen', orderIndex: 40, createdAt: new Date(), updatedAt: new Date() },
  { id: '21', routePattern: '/dashboard/reports%', module: 'reportes', action: 'read', isMenuItem: true, displayName: 'Reportes', groupName: 'Finanzas', iconName: 'PieChart', orderIndex: 50, createdAt: new Date(), updatedAt: new Date() },
  
  // 7. Recursos Humanos
  { id: '22', routePattern: '/dashboard/hr', module: 'nomina', action: 'read', isMenuItem: true, displayName: 'Dashboard RRHH', groupName: 'Recursos Humanos', iconName: 'LayoutDashboard', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '23', routePattern: '/dashboard/hr/employees%', module: 'nomina', action: 'read', isMenuItem: true, displayName: 'Empleados', groupName: 'Recursos Humanos', iconName: 'Users', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  { id: '24', routePattern: '/dashboard/hr/departments%', module: 'nomina', action: 'read', isMenuItem: true, displayName: 'Departamentos', groupName: 'Recursos Humanos', iconName: 'Building2', orderIndex: 30, createdAt: new Date(), updatedAt: new Date() },
  { id: '25', routePattern: '/dashboard/hr/payroll%', module: 'nomina', action: 'read', isMenuItem: true, displayName: 'Nominas', groupName: 'Recursos Humanos', iconName: 'Banknote', orderIndex: 40, createdAt: new Date(), updatedAt: new Date() },
  { id: '26', routePattern: '/dashboard/hr/overtime%', module: 'nomina', action: 'read', isMenuItem: true, displayName: 'Horas Extras y Adicionales', groupName: 'Recursos Humanos', iconName: 'Calculator', orderIndex: 50, createdAt: new Date(), updatedAt: new Date() },
  { id: '39', routePattern: '/dashboard/hr/vacations%', module: 'nomina', action: 'read', isMenuItem: true, displayName: 'Vacaciones', groupName: 'Recursos Humanos', iconName: 'Palmtree', orderIndex: 55, createdAt: new Date(), updatedAt: new Date() },
  { id: '27', routePattern: '/dashboard/hr/settlements%', module: 'nomina', action: 'read', isMenuItem: true, displayName: 'Liquidacion y Prestaciones', groupName: 'Recursos Humanos', iconName: 'ShieldAlert', orderIndex: 60, createdAt: new Date(), updatedAt: new Date() },
  { id: '28', routePattern: '/dashboard/hr/config%', module: 'nomina', action: 'read', isMenuItem: true, displayName: 'Configuracion de Ley', groupName: 'Recursos Humanos', iconName: 'Settings', orderIndex: 70, createdAt: new Date(), updatedAt: new Date() },
  
  // 8. Herramientas
  { id: '29', routePattern: '/dashboard/tools/desglose/ventanas%', module: 'facturacion', action: 'read', isMenuItem: true, displayName: 'Desglose Ventanas', groupName: 'Herramientas', iconName: 'Calculator', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '30', routePattern: '/dashboard/tools/glass-cutting%', module: 'facturacion', action: 'read', isMenuItem: true, displayName: 'Corte de Vidrio', groupName: 'Herramientas', iconName: 'Layers', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  { id: '35', routePattern: '/dashboard/tools/desglose/puertas%', module: 'facturacion', action: 'read', isMenuItem: true, displayName: 'Desglose Puertas Comerciales', groupName: 'Herramientas', iconName: 'DoorOpen', orderIndex: 15, createdAt: new Date(), updatedAt: new Date() },
  { id: '35c', routePattern: '/dashboard/tools/qr-store%', module: 'catalogo', action: 'read', isMenuItem: true, displayName: 'QR Tienda Online', groupName: 'Herramientas', iconName: 'QrCode', orderIndex: 25, createdAt: new Date(), updatedAt: new Date() },
  
  // 9. Sistema
  { id: '31', routePattern: '/dashboard/settings%', module: 'administracion', action: 'read', isMenuItem: true, displayName: 'Configuración', groupName: 'Sistema', iconName: 'Settings', orderIndex: 10, createdAt: new Date(), updatedAt: new Date() },
  { id: '32', routePattern: '/dashboard/ecf%', module: 'facturacion', action: 'read', isMenuItem: true, displayName: 'Comprobantes Fiscales', groupName: 'Sistema', iconName: 'ShieldCheck', orderIndex: 20, createdAt: new Date(), updatedAt: new Date() },
  { id: '33', routePattern: '/dashboard/admin/companies%', module: 'administracion', action: 'read', isMenuItem: true, displayName: 'Empresas', groupName: 'Sistema', iconName: 'Building2', orderIndex: 30, createdAt: new Date(), updatedAt: new Date() },
  { id: '34', routePattern: '/dashboard/admin', module: 'administracion', action: 'read', isMenuItem: true, displayName: 'Administracion', groupName: 'Sistema', iconName: 'Shield', orderIndex: 40, createdAt: new Date(), updatedAt: new Date() }
];