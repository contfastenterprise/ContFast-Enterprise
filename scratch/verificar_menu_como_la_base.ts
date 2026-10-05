/**
 * Lote 286 -- la siembra del menu dice lo mismo que `route_mappings` en PRODUCCION.
 *
 * `src/constants/defaultMappings.ts` es la siembra de `route_mappings`: lo que el menu
 * pinta antes de que llegue la respuesta de la base (`rbacContext`), lo que
 * `scratch/seed-routes.ts` mete en una base nueva y lo que la ruta `auth/route-mappings`
 * inserta si falta una ruta. El manual del lote 283 copio los nombres de ahi, y la base ya
 * tenia los renombres del lote 190 (`renombrar_menu_ambiguo.ts`) que la siembra no.
 *
 * LA MEDICION ESTA CONGELADA AQUI ABAJO (2026-10-04, PRODUCCION, solo lectura, con
 * `scratch/_to_delete/medir_menu_286.ts` dentro de una transaccion `read only`). La tabla
 * no tiene `company_id`: es la misma para las seis empresas. Si el dueño renombra algo en
 * la base, este banco no lo sabra hasta que se vuelva a medir y se actualice `MEDIDA`.
 *
 * Lo que se alinea: NOMBRE, GRUPO e `is_menu_item`. Lo que NO (y va de invariante, para
 * que nadie lo "arregle" de pasada): el `module` de dos rutas y las dos filas de
 * `antiguedad-saldos`, que son PERMISOS, no nombres.
 *
 * Se ejecuta con: npx tsx scratch/verificar_menu_como_la_base.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

/** [ruta, nombre, grupo, modulo, accion, is_menu_item, icono, orden] -- medido 2026-10-04. */
type Fila = [string, string, string, string, string, boolean, string, number];
const MEDIDA: Fila[] = [
  ['/dashboard/customers%', 'Clientes', 'Contactos', 'clientes', 'read', true, 'Users', 10],
  ['/dashboard/suppliers%', 'Suplidores', 'Contactos', 'proveedores', 'read', true, 'Truck', 20],
  ['/dashboard/purchases%', 'Compras y Gastos', 'Egresos', 'proveedores', 'read', true, 'Banknote', 10],
  ['/dashboard/purchases/orders%', 'Pedidos a Suplidores', 'Egresos', 'proveedores', 'read', true, 'FileText', 15],
  ['/dashboard/ap%', 'Pagos a Suplidores', 'Egresos', 'proveedores', 'read', true, 'Receipt', 20],
  ['/dashboard/financial%', 'Dashboard Financiero', 'Finanzas', 'contabilidad', 'read', true, 'PieChart', 5],
  ['/dashboard/financial/accounts-receivable%', 'Cuentas por Cobrar', 'Finanzas', 'cobros', 'read', true, 'Banknote', 10],
  ['/dashboard/financial/customers%', 'E.C. Clientes (CxC)', 'Finanzas', 'contabilidad', 'read', true, 'HandCoins', 15],
  ['/dashboard/financial/accounts-payable%', 'Cuentas por Pagar', 'Finanzas', 'proveedores', 'read', true, 'Receipt', 20],
  ['/dashboard/financial/suppliers%', 'E.C. Suplidores (CxP)', 'Finanzas', 'contabilidad', 'read', true, 'Receipt', 25],
  ['/dashboard/bank%', 'Cuentas Bancarias', 'Finanzas', 'banco', 'read', true, 'Landmark', 30],
  ['/dashboard/accounting%', 'Contabilidad', 'Finanzas', 'contabilidad', 'read', true, 'BookOpen', 40],
  ['/dashboard/reports%', 'Reportes', 'Finanzas', 'reportes', 'read', true, 'PieChart', 50],
  ['/dashboard/antiguedad-saldos%', 'Antigüedad de Saldos', 'Finanzas', 'cobros', 'read', true, 'PieChart', 51],
  ['/dashboard/antiguedad-saldos%', 'Antigüedad de Saldos', 'Finanzas', 'proveedores', 'read', true, 'PieChart', 51],
  ['/dashboard/tools/desglose/ventanas%', 'Desglose Ventanas', 'Herramientas', 'facturacion', 'read', true, 'Calculator', 10],
  ['/dashboard/tools/desglose/puertas%', 'Desglose Puertas Comerciales', 'Herramientas', 'facturacion', 'read', true, 'DoorOpen', 15],
  ['/dashboard/tools/glass-cutting%', 'Corte de Vidrio', 'Herramientas', 'facturacion', 'read', true, 'Layers', 20],
  ['/dashboard/tools/qr-store%', 'QR Tienda Online', 'Herramientas', 'catalogo', 'read', true, 'QrCode', 25],
  ['/dashboard/invoices%', 'Facturacion e-CF', 'Ingresos', 'facturacion', 'read', true, 'FileText', 10],
  ['/dashboard/quotes%', 'Cotizaciones', 'Ingresos', 'facturacion', 'read', true, 'FileText', 20],
  ['/dashboard/adjustments%', 'Credito / Debito', 'Ingresos', 'facturacion', 'read', true, 'FileMinus', 30],
  ['/dashboard/cash%', 'Modulo de Caja', 'Ingresos', 'caja', 'read', true, 'Wallet', 40],
  ['/dashboard/receivables%', 'Pagos y Abonos', 'Ingresos', 'cobros', 'read', true, 'HandCoins', 50],
  ['/dashboard/receivables-report%', 'Cuenta por Cobrar', 'Ingresos', 'cobros', 'read', true, 'FileText', 60],
  ['/dashboard/warehouses%', 'Almacenes', 'Inventario', 'catalogo', 'read', true, 'Building2', 10],
  ['/dashboard/inventory/categories%', 'Categorias', 'Inventario', 'catalogo', 'read', true, 'Tag', 20],
  ['/dashboard/products%', 'Productos', 'Inventario', 'catalogo', 'read', true, 'Package', 30],
  ['/dashboard/products/barcodes%', 'Códigos de Barra', 'Inventario', 'catalogo', 'read', true, 'Printer', 35],
  ['/dashboard/delivery-notes%', 'Conduces', 'Inventario', 'conduce', 'read', true, 'Truck', 40],
  ['/dashboard/inventory/transfer%', 'Traslados', 'Inventario', 'catalogo', 'read', true, 'ArrowRightLeft', 50],
  ['/dashboard/inventory/adjustments%', 'Ajustes de Inventario', 'Inventario', 'catalogo', 'read', true, 'PackageMinus', 60],
  ['/dashboard/inventory/movements%', 'Movimientos', 'Inventario', 'catalogo', 'read', true, 'HistoryIcon', 70],
  ['/dashboard/inventory/reorder%', 'Sugerencias de Reorden', 'Inventario', 'catalogo', 'read', true, 'AlertTriangle', 80],
  ['/dashboard', 'Inicio', 'Principal', 'caja', 'read', true, 'LayoutDashboard', 10],
  ['/dashboard/bi%', 'Inteligencia de Negocios', 'Principal', 'administracion', 'read', false, 'PieChart', 20],
  ['/dashboard/proposals%', 'Agente Empresarial (IA)', 'Principal', 'administracion', 'read', false, 'BrainCircuit', 25],
  ['/dashboard/hr', 'Dashboard RRHH', 'Recursos Humanos', 'nomina', 'read', true, 'LayoutDashboard', 10],
  ['/dashboard/hr/employees%', 'Empleados', 'Recursos Humanos', 'nomina', 'read', true, 'Users', 20],
  ['/dashboard/hr/departments%', 'Departamentos', 'Recursos Humanos', 'nomina', 'read', true, 'Building2', 30],
  ['/dashboard/hr/payroll%', 'Nominas', 'Recursos Humanos', 'nomina', 'read', true, 'Banknote', 40],
  ['/dashboard/hr/overtime%', 'Horas Extras y Adicionales', 'Recursos Humanos', 'nomina', 'read', true, 'Calculator', 50],
  ['/dashboard/hr/vacations%', 'Vacaciones', 'Recursos Humanos', 'nomina', 'read', true, 'Palmtree', 55],
  ['/dashboard/hr/settlements%', 'Liquidacion y Prestaciones', 'Recursos Humanos', 'nomina', 'read', true, 'ShieldAlert', 60],
  ['/dashboard/hr/config%', 'Configuracion de Ley', 'Recursos Humanos', 'nomina', 'read', true, 'Settings', 70],
  ['/dashboard/settings%', 'Configuración', 'Sistema', 'administracion', 'read', true, 'Settings', 10],
  ['/dashboard/ecf%', 'Comprobantes Fiscales', 'Sistema', 'facturacion', 'read', true, 'ShieldCheck', 20],
  ['/dashboard/retentions%', 'Retenciones', 'Sistema', 'retenciones', 'read', true, 'ShieldAlert', 25],
  ['/dashboard/admin/companies%', 'Empresas', 'Sistema', 'administracion', 'read', true, 'Building2', 30],
  ['/dashboard/admin', 'Administracion', 'Sistema', 'administracion', 'read', true, 'Shield', 40],
];

/** Diferencias de PERMISO conocidas y dejadas a proposito (no son de este lote). */
const MODULO_DISTINTO_A_PROPOSITO: Record<string, [siembra: string, base: string]> = {
  '/dashboard/financial/accounts-receivable%': ['caja', 'cobros'],
  '/dashboard/financial/accounts-payable%': ['caja', 'proveedores'],
};
/** Rutas que estan en la base y no en la siembra (dos filas, una por modulo: lote 190). */
const SOLO_EN_LA_BASE = ['/dashboard/antiguedad-saldos%'];

let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean) => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean) => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}`); if (!c) rotas++; };

const raiz = resolve(__dirname, '..');
const leer = (f: string) => readFileSync(resolve(raiz, f), 'utf8');

interface Siembra { routePattern: string; displayName: string; groupName: string; module: string; action: string; isMenuItem: boolean; iconName: string; orderIndex: number }

async function main() {
  //  Precondiciones (ciertas en los dos estados).
  if (MEDIDA.length !== 50) throw new Error('Precondicion: la medicion congelada tiene 50 filas');

  //  Perezoso: el fichero existe en los dos estados, pero asi un fallo al cargar se ve.
  const { DEFAULT_ROUTE_MAPPINGS } = (await import('../src/constants/defaultMappings')) as { DEFAULT_ROUTE_MAPPINGS: Siembra[] };
  const siembra = DEFAULT_ROUTE_MAPPINGS;
  if (siembra.length < 40) throw new Error('Precondicion: la siembra no se pudo leer');

  const enLaBase = (ruta: string) => MEDIDA.filter((f) => f[0] === ruta);
  const deLaSiembra = (ruta: string) => siembra.find((s) => s.routePattern === ruta);
  const nombreEnSiembra = (ruta: string) => deLaSiembra(ruta)?.displayName;

  //  1. Los cuatro renombres que ya estaban en la base.
  ok('/dashboard/ap se llama "Pagos a Suplidores", como en la base', nombreEnSiembra('/dashboard/ap%') === 'Pagos a Suplidores');
  ok('/dashboard/inventory/adjustments se llama "Ajustes de Inventario"', nombreEnSiembra('/dashboard/inventory/adjustments%') === 'Ajustes de Inventario');
  ok('/dashboard/settings se llama "Configuración"', nombreEnSiembra('/dashboard/settings%') === 'Configuración');
  ok('/dashboard/receivables-report se llama "Cuenta por Cobrar" (singular, como en la base)', nombreEnSiembra('/dashboard/receivables-report%') === 'Cuenta por Cobrar');

  //  2. Fila a fila: nombre, grupo, is_menu_item, icono y orden iguales a la base.
  const distintas = siembra.filter((s) => {
    const b = enLaBase(s.routePattern)[0];
    return !b || b[1] !== s.displayName || b[2] !== s.groupName || b[5] !== s.isMenuItem || b[6] !== s.iconName || b[7] !== s.orderIndex;
  }).map((s) => s.routePattern);
  ok(`toda fila de la siembra coincide con la base en nombre, grupo, menu, icono y orden${distintas.length ? ` (distintas: ${distintas.join(', ')})` : ''}`, distintas.length === 0);

  //  3. Ningun nombre del menu repetido en la siembra (el defecto que el lote 190 cerro en la base).
  const delMenu = siembra.filter((s) => s.isMenuItem).map((s) => s.displayName);
  const repetidos = delMenu.filter((n, i) => delMenu.indexOf(n) !== i);
  ok(`ningun nombre del menu repetido en la siembra${repetidos.length ? ` (${repetidos.join(', ')})` : ''}`, repetidos.length === 0);

  //  4. El manual nombra el menu con los nombres de la base (grupo y nombre, par a par).
  const manual = leer('scripts/generate-manual.js');
  const rutasDelManual = [...manual.matchAll(/ruta\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map((m) => [m[1], m[2]] as const);
  if (rutasDelManual.length < 15) throw new Error('Precondicion: el manual no tiene sus ruta(grupo, nombre)');
  const delMenuMedido = MEDIDA.filter((f) => f[5]);
  const sinPareja = rutasDelManual.filter(([g, n]) => !delMenuMedido.some((f) => f[2] === g && f[1] === n)).map(([g, n]) => `${g} > ${n}`);
  ok(`el manual solo nombra entradas que existen en el menu de la base${sinPareja.length ? ` (no existen: ${[...new Set(sinPareja)].join(', ')})` : ''}`, sinPareja.length === 0);

  //  5. La alerta de BI que lleva a los ajustes de inventario dice el nombre del menu.
  const alertas = leer('src/components/bi/bi-alerts.tsx');
  const bloqueAjuste = alertas.match(/actionText:\s*'([^']*)',\s*\r?\n\s*actionLink:\s*'\/dashboard\/inventory\/adjustments'/);
  if (!bloqueAjuste) throw new Error('Precondicion: no esta la alerta que lleva a /dashboard/inventory/adjustments');
  ok('la alerta de BI dice "Ver Ajustes de Inventario"', bloqueAjuste[1] === 'Ver Ajustes de Inventario');

  //  6. La prueba del menu lateral dice que usa "el menu real": Comprobantes Fiscales es de Sistema.
  const prueba = leer('src/tests/menuLateral.vitest.ts');
  const ecf = prueba.match(/menu\('\/dashboard\/ecf%',\s*'[^']+',\s*'([^']+)',\s*'([^']+)'\)/);
  if (!ecf) throw new Error('Precondicion: menuLateral.vitest.ts no trae /dashboard/ecf');
  const ecfBase = enLaBase('/dashboard/ecf%')[0];
  ok('menuLateral.vitest.ts pone Comprobantes Fiscales en su grupo de la base', ecf[1] === ecfBase[1] && ecf[2] === ecfBase[2]);

  //  INVARIANTES: lo que el lote NO toca. Ciertos antes y despues.
  const modulosDistintos = siembra.filter((s) => {
    const b = enLaBase(s.routePattern);
    return b.length > 0 && !b.some((f) => f[3] === s.module && f[4] === s.action);
  }).map((s) => s.routePattern).sort();
  invariante('el modulo y la accion de la siembra no cambian: solo difieren las dos rutas conocidas',
    JSON.stringify(modulosDistintos) === JSON.stringify(Object.keys(MODULO_DISTINTO_A_PROPOSITO).sort())
    && Object.entries(MODULO_DISTINTO_A_PROPOSITO).every(([r, [s, b]]) => deLaSiembra(r)?.module === s && enLaBase(r)[0][3] === b));
  const soloBase = [...new Set(MEDIDA.map((f) => f[0]).filter((r) => !deLaSiembra(r)))];
  const soloSiembra = siembra.map((s) => s.routePattern).filter((r) => enLaBase(r).length === 0);
  invariante('las mismas rutas en los dos lados, salvo antiguedad-saldos (solo en la base)',
    JSON.stringify(soloBase) === JSON.stringify(SOLO_EN_LA_BASE) && soloSiembra.length === 0);
  invariante('BI y el Agente siguen fuera del menu (lote 208)',
    deLaSiembra('/dashboard/bi%')?.isMenuItem === false && deLaSiembra('/dashboard/proposals%')?.isMenuItem === false);

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
