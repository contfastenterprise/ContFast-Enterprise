import postgres from 'postgres';

try {
  // @ts-ignore
  process.loadEnvFile();
} catch (e) {}

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';

async function run() {
  const sql = postgres(connectionString, { prepare: false });
  try {
    console.log('Altering route_mappings table...');
    
    // Add columns
    await sql`ALTER TABLE route_mappings ADD COLUMN IF NOT EXISTS is_menu_item BOOLEAN DEFAULT false NOT NULL`;
    await sql`ALTER TABLE route_mappings ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)`;
    await sql`ALTER TABLE route_mappings ADD COLUMN IF NOT EXISTS group_name VARCHAR(100)`;
    await sql`ALTER TABLE route_mappings ADD COLUMN IF NOT EXISTS icon_name VARCHAR(100)`;
    await sql`ALTER TABLE route_mappings ADD COLUMN IF NOT EXISTS order_index INTEGER`;
    
    console.log('Table altered successfully.');
    console.log('Truncating existing route mappings...');
    await sql`TRUNCATE TABLE route_mappings`;
    console.log('Table truncated.');
    
    console.log('Seeding route mappings with visual menu metadata...');

    const mappings = [
      // 1. Principal
      { pattern: '/dashboard', module: 'caja', action: 'read', is_menu: true, name: 'Inicio', group: 'Principal', icon: 'LayoutDashboard', order: 10 },
      
      // 2. Contactos
      { pattern: '/dashboard/customers%', module: 'clientes', action: 'read', is_menu: true, name: 'Clientes', group: 'Contactos', icon: 'Users', order: 10 },
      { pattern: '/dashboard/suppliers%', module: 'proveedores', action: 'read', is_menu: true, name: 'Suplidores', group: 'Contactos', icon: 'Truck', order: 20 },
      
      // 3. Inventario
      { pattern: '/dashboard/warehouses%', module: 'catalogo', action: 'read', is_menu: true, name: 'Almacenes', group: 'Inventario', icon: 'Building2', order: 10 },
      { pattern: '/dashboard/inventory/categories%', module: 'catalogo', action: 'read', is_menu: true, name: 'Categorías', group: 'Inventario', icon: 'Tag', order: 20 },
      { pattern: '/dashboard/products%', module: 'catalogo', action: 'read', is_menu: true, name: 'Productos', group: 'Inventario', icon: 'Package', order: 30 },
      { pattern: '/dashboard/delivery-notes%', module: 'conduce', action: 'read', is_menu: true, name: 'Conduces', group: 'Inventario', icon: 'Truck', order: 40 },
      { pattern: '/dashboard/inventory/transfer%', module: 'catalogo', action: 'read', is_menu: true, name: 'Traslados', group: 'Inventario', icon: 'ArrowRightLeft', order: 50 },
      { pattern: '/dashboard/inventory/adjustments%', module: 'catalogo', action: 'read', is_menu: true, name: 'Ajustes', group: 'Inventario', icon: 'PackageMinus', order: 60 },
      { pattern: '/dashboard/inventory/movements%', module: 'catalogo', action: 'read', is_menu: true, name: 'Movimientos', group: 'Inventario', icon: 'HistoryIcon', order: 70 },
      
      // 4. Ingresos
      { pattern: '/dashboard/invoices%', module: 'facturacion', action: 'read', is_menu: true, name: 'Facturación e-CF', group: 'Ingresos', icon: 'FileText', order: 10 },
      { pattern: '/dashboard/quotes%', module: 'facturacion', action: 'read', is_menu: true, name: 'Cotizaciones', group: 'Ingresos', icon: 'FileText', order: 20 },
      { pattern: '/dashboard/adjustments%', module: 'facturacion', action: 'read', is_menu: true, name: 'Crédito / Débito', group: 'Ingresos', icon: 'FileMinus', order: 30 },
      { pattern: '/dashboard/cash%', module: 'caja', action: 'read', is_menu: true, name: 'Módulo de Caja', group: 'Ingresos', icon: 'Wallet', order: 40 },
      { pattern: '/dashboard/receivables%', module: 'cobros', action: 'read', is_menu: true, name: 'Pagos y Abonos', group: 'Ingresos', icon: 'HandCoins', order: 50 },
      { pattern: '/dashboard/retentions%', module: 'retenciones', action: 'read', is_menu: true, name: 'Retenciones', group: 'Ingresos', icon: 'ShieldAlert', order: 60 },
      
      // 5. Egresos
      { pattern: '/dashboard/purchases%', module: 'proveedores', action: 'read', is_menu: true, name: 'Compras y Gastos', group: 'Egresos', icon: 'Banknote', order: 10 },
      { pattern: '/dashboard/ap%', module: 'proveedores', action: 'read', is_menu: true, name: 'Cuentas por Pagar', group: 'Egresos', icon: 'Receipt', order: 20 },
      
      // 6. Finanzas
      { pattern: '/dashboard/bank%', module: 'banco', action: 'read', is_menu: true, name: 'Cuentas Bancarias', group: 'Finanzas', icon: 'Landmark', order: 10 },
      { pattern: '/dashboard/accounting%', module: 'contabilidad', action: 'read', is_menu: true, name: 'Contabilidad', group: 'Finanzas', icon: 'BookOpen', order: 20 },
      { pattern: '/dashboard/reports%', module: 'reportes', action: 'read', is_menu: true, name: 'Reportes', group: 'Finanzas', icon: 'PieChart', order: 30 },
      
      // 7. Recursos Humanos
      { pattern: '/dashboard/hr', module: 'nomina', action: 'read', is_menu: true, name: 'Dashboard RRHH', group: 'Recursos Humanos', icon: 'LayoutDashboard', order: 10 },
      { pattern: '/dashboard/hr/employees%', module: 'nomina', action: 'read', is_menu: true, name: 'Empleados', group: 'Recursos Humanos', icon: 'Users', order: 20 },
      { pattern: '/dashboard/hr/departments%', module: 'nomina', action: 'read', is_menu: true, name: 'Departamentos', group: 'Recursos Humanos', icon: 'Building2', order: 30 },
      { pattern: '/dashboard/hr/payroll%', module: 'nomina', action: 'read', is_menu: true, name: 'Nóminas', group: 'Recursos Humanos', icon: 'Banknote', order: 40 },
      { pattern: '/dashboard/hr/overtime%', module: 'nomina', action: 'read', is_menu: true, name: 'Horas Extras y Adicionales', group: 'Recursos Humanos', icon: 'Calculator', order: 50 },
      { pattern: '/dashboard/hr/settlements%', module: 'nomina', action: 'read', is_menu: true, name: 'Liquidación y Prestaciones', group: 'Recursos Humanos', icon: 'ShieldAlert', order: 60 },
      { pattern: '/dashboard/hr/config%', module: 'nomina', action: 'read', is_menu: true, name: 'Configuración de Ley', group: 'Recursos Humanos', icon: 'Settings', order: 70 },
      
      // 8. Herramientas
      { pattern: '/dashboard/tools/desglose/ventanas%', module: 'facturacion', action: 'read', is_menu: true, name: 'Desglose Ventanas', group: 'Herramientas', icon: 'Calculator', order: 10 },
      { pattern: '/dashboard/tools/glass-cutting%', module: 'facturacion', action: 'read', is_menu: true, name: 'Corte de Vidrio', group: 'Herramientas', icon: 'Layers', order: 20 },
      
      // 9. Sistema
      { pattern: '/dashboard/settings%', module: 'administracion', action: 'read', is_menu: true, name: 'Ajustes', group: 'Sistema', icon: 'Settings', order: 10 },
      { pattern: '/dashboard/ecf%', module: 'facturacion', action: 'read', is_menu: true, name: 'Comprobantes Fiscales', group: 'Sistema', icon: 'ShieldCheck', order: 20 },
      { pattern: '/dashboard/admin/companies%', module: 'administracion', action: 'read', is_menu: true, name: 'Empresas', group: 'Sistema', icon: 'Building2', order: 30 },
      { pattern: '/dashboard/admin', module: 'administracion', action: 'read', is_menu: true, name: 'Administración', group: 'Sistema', icon: 'Shield', order: 40 },

      // ─── APIs (is_menu = false) ───
      { pattern: '/api/v1/accounting%', module: 'contabilidad', action: null, is_menu: false, name: null, group: null, icon: null, order: null },
      { pattern: '/api/v1/invoices%', module: 'facturacion', action: null, is_menu: false, name: null, group: null, icon: null, order: null },
      { pattern: '/api/v1/cash%', module: 'caja', action: null, is_menu: false, name: null, group: null, icon: null, order: null },
      { pattern: '/api/v1/bank%', module: 'banco', action: null, is_menu: false, name: null, group: null, icon: null, order: null },
      { pattern: '/api/v1/customers%', module: 'clientes', action: null, is_menu: false, name: null, group: null, icon: null, order: null },
      { pattern: '/api/v1/suppliers%', module: 'proveedores', action: null, is_menu: false, name: null, group: null, icon: null, order: null },
      { pattern: '/api/v1/products%', module: 'catalogo', action: null, is_menu: false, name: null, group: null, icon: null, order: null },
      { pattern: '/api/v1/categories%', module: 'catalogo', action: null, is_menu: false, name: null, group: null, icon: null, order: null },
      { pattern: '/api/v1/inventory%', module: 'catalogo', action: null, is_menu: false, name: null, group: null, icon: null, order: null },
      { pattern: '/api/v1/reports%', module: 'reportes', action: null, is_menu: false, name: null, group: null, icon: null, order: null },
      { pattern: '/api/v1/admin%', module: 'administracion', action: null, is_menu: false, name: null, group: null, icon: null, order: null },
      { pattern: '/api/v1/hr%', module: 'nomina', action: null, is_menu: false, name: null, group: null, icon: null, order: null },
      { pattern: '/api/v1/retentions%', module: 'retenciones', action: null, is_menu: false, name: null, group: null, icon: null, order: null },
      { pattern: '/api/v1/delivery-notes%', module: 'conduce', action: null, is_menu: false, name: null, group: null, icon: null, order: null },
    ];

    for (const m of mappings) {
      await sql`
        INSERT INTO route_mappings (route_pattern, module, action, is_menu_item, display_name, group_name, icon_name, order_index)
        VALUES (${m.pattern}, ${m.module}, ${m.action}, ${m.is_menu}, ${m.name}, ${m.group}, ${m.icon}, ${m.order})
      `;
    }

    console.log('Route mappings seeded successfully.');
  } catch (err) {
    console.error('Error running migration 0021:', err);
  } finally {
    await sql.end();
  }
}

run();
