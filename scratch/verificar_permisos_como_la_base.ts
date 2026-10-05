/**
 * Lote 289 -- los PERMISOS de la siembra del menu, iguales a los de `route_mappings`.
 *
 * El lote 286 igualo los nombres de `src/constants/defaultMappings.ts` con la base de
 * PRODUCCION y dejo fuera tres diferencias por ser permisos. El dueño decidio (2026-10-04)
 * igualarlas:
 *   1. /dashboard/financial/accounts-receivable%: `caja` -> `cobros` (como en la base);
 *   2. /dashboard/financial/accounts-payable%:    `caja` -> `proveedores`;
 *   3. /dashboard/antiguedad-saldos%: las DOS filas de la base (cobros y proveedores, lote
 *      190), que la siembra no traia.
 *
 * Y al mirar quien lee dos filas con la misma ruta salio un defecto: `canAccessRoute`
 * (rbacContext) se quedaba con la PRIMERA fila que casaba. Con antiguedad-saldos, a quien
 * solo tiene uno de los dos permisos el menu le ofrecia la pantalla y la guarda de rutas
 * lo mandaba a /403, segun en que orden llegaran las filas. Ahora decide el patron mas
 * especifico con TODAS sus filas (`src/utils/filasDeLaRuta.ts`).
 *
 * Los valores de la base son los congelados en `verificar_menu_como_la_base.ts` (medidos el
 * 2026-10-04, solo lectura). Los permisos de cada rol son los de `DEFAULT_ROLE_PERMISSIONS`
 * (lo que concede un rol sin ajustes en la base); el ayudante `tiene` de abajo es el
 * DECORADO de la prueba, no lo que se prueba: lo que se ejecuta es la siembra, la regla de
 * las filas y `buildSidebar`.
 *
 * Se ejecuta con: npx tsx scratch/verificar_permisos_como_la_base.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean) => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean) => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}`); if (!c) rotas++; };

const raiz = resolve(__dirname, '..');
const leer = (f: string) => readFileSync(resolve(raiz, f), 'utf8');

/** Las filas de la base para estas tres rutas -- medido 2026-10-04 (lote 286). */
const BASE = [
  { routePattern: '/dashboard/financial/accounts-receivable%', module: 'cobros', action: 'read', displayName: 'Cuentas por Cobrar', groupName: 'Finanzas', iconName: 'Banknote', orderIndex: 10, isMenuItem: true },
  { routePattern: '/dashboard/financial/accounts-payable%', module: 'proveedores', action: 'read', displayName: 'Cuentas por Pagar', groupName: 'Finanzas', iconName: 'Receipt', orderIndex: 20, isMenuItem: true },
  { routePattern: '/dashboard/antiguedad-saldos%', module: 'cobros', action: 'read', displayName: 'Antigüedad de Saldos', groupName: 'Finanzas', iconName: 'PieChart', orderIndex: 51, isMenuItem: true },
  { routePattern: '/dashboard/antiguedad-saldos%', module: 'proveedores', action: 'read', displayName: 'Antigüedad de Saldos', groupName: 'Finanzas', iconName: 'PieChart', orderIndex: 51, isMenuItem: true },
];
const CXC = '/dashboard/financial/accounts-receivable';
const CXP = '/dashboard/financial/accounts-payable';
const ANT = '/dashboard/antiguedad-saldos';

interface Fila { id: string; routePattern: string; module: string; action: string | null; isMenuItem: boolean; displayName: string | null; groupName: string | null; iconName: string | null; orderIndex: number | null; createdAt: Date; updatedAt: Date }
type Concede = (path: string, filas: readonly Fila[], tiene: (m: string, a: string) => boolean) => boolean | null;

async function main() {
  const { DEFAULT_ROUTE_MAPPINGS } = (await import('../src/constants/defaultMappings')) as unknown as { DEFAULT_ROUTE_MAPPINGS: Fila[] };
  const { DEFAULT_ROLE_PERMISSIONS } = await import('../src/constants/rolePermissions');
  const { buildSidebar } = (await import('../src/utils/rbacHelpers')) as unknown as { buildSidebar: (f: Fila[], h: (m: string, a: string) => boolean, r: string) => { title: string; items: { name: string; href: string }[] }[] };
  const siembra = DEFAULT_ROUTE_MAPPINGS;
  //  Precondiciones, ciertas en los dos estados.
  if (siembra.length < 40) throw new Error('Precondicion: la siembra no se pudo leer');
  if (DEFAULT_ROLE_PERMISSIONS.compras?.['cobros:read'] || !DEFAULT_ROLE_PERMISSIONS.compras?.['proveedores:read']) throw new Error('Precondicion: compras tiene proveedores y no cobros');
  if (DEFAULT_ROLE_PERMISSIONS.cajero?.['cobros:read'] || DEFAULT_ROLE_PERMISSIONS.cajero?.['proveedores:read'] || !DEFAULT_ROLE_PERMISSIONS.cajero?.['caja:read']) throw new Error('Precondicion: cajero tiene caja y no cobros ni proveedores');
  if (DEFAULT_ROLE_PERMISSIONS.banco?.['caja:read'] || !DEFAULT_ROLE_PERMISSIONS.banco?.['cobros:read']) throw new Error('Precondicion: banco tiene cobros y no caja');

  //  Perezoso: el modulo nace en este lote; sin el, cada comprobacion que lo usa da FALLA.
  let F: typeof import('../src/utils/filasDeLaRuta') | null = null;
  try { F = await import('../src/utils/filasDeLaRuta'); } catch { F = null; }
  const concede: Concede | null = F ? (F.algunaFilaConcede as unknown as Concede) : null;

  /** Permisos de un rol sin ajustes en la base (decorado de la prueba). */
  const tiene = (rol: string) => (m: string, a: string) => {
    if (rol === 'sistemas' || rol === 'administracion') return true;
    return DEFAULT_ROLE_PERMISSIONS[rol]?.[`${m}:${a}`] === true;
  };
  const entra = (rol: string, path: string, filas: readonly Fila[] = siembra) => {
    if (!concede) return 'SIN MODULO';
    return concede(path, filas, tiene(rol)) ?? true;
  };
  const enElMenu = (rol: string, href: string) => buildSidebar(siembra, tiene(rol), rol).flatMap((g) => g.items).filter((i) => i.href === href).length;
  const filasDe = (ruta: string) => siembra.filter((s) => s.routePattern === ruta);
  const igual = (s: Fila, b: (typeof BASE)[number]) =>
    s.routePattern === b.routePattern && s.module === b.module && s.action === b.action && s.displayName === b.displayName
    && s.groupName === b.groupName && s.iconName === b.iconName && s.orderIndex === b.orderIndex && s.isMenuItem === b.isMenuItem;

  //  1. Los modulos de las dos rutas de Finanzas.
  ok('CxC de Finanzas: una fila, modulo `cobros`, igual a la base', filasDe(`${CXC}%`).length === 1 && igual(filasDe(`${CXC}%`)[0], BASE[0]));
  ok('CxP de Finanzas: una fila, modulo `proveedores`, igual a la base', filasDe(`${CXP}%`).length === 1 && igual(filasDe(`${CXP}%`)[0], BASE[1]));

  //  2. Las dos filas de antiguedad-saldos, enteras.
  const ant = filasDe(`${ANT}%`);
  ok('antiguedad-saldos: DOS filas, una `cobros` y otra `proveedores`, iguales a la base',
    ant.length === 2 && igual(ant.find((f) => f.module === 'cobros') ?? ant[0], BASE[2]) && igual(ant.find((f) => f.module === 'proveedores') ?? ant[0], BASE[3]));

  //  3. Los ids de la siembra no se repiten (el 286 vio un '35' doble).
  const ids = siembra.map((s) => s.id);
  const idsRepetidos = ids.filter((x, i) => ids.indexOf(x) !== i);
  ok(`ningun id repetido en la siembra${idsRepetidos.length ? ` (${idsRepetidos.join(', ')})` : ''}`, idsRepetidos.length === 0);

  //  4. La regla de las filas: cuentan TODAS las del patron mas especifico.
  const deciden = F ? F.filasDeLaRuta(`${ANT}/x`, siembra) : null;
  ok('filasDeLaRuta devuelve las dos filas de antiguedad-saldos', !!deciden && deciden.length === 2 && new Set(deciden.map((f) => f.module)).size === 2);
  //  En los dos ordenes: el patron mas especifico gana por su LONGITUD, no por llegar el
  //  primero o el ultimo (un mutante que se quedaba con el ultimo que casa sobrevivia con
  //  solo el orden de la siembra).
  const subCxc = F ? [F.filasDeLaRuta(`${CXC}/detalle`, siembra), F.filasDeLaRuta(`${CXC}/detalle`, [...siembra].reverse())] : [];
  ok('una subruta de CxC la decide su fila, no /dashboard/financial% (el patron mas especifico), en los dos ordenes',
    subCxc.length === 2 && subCxc.every((d) => !!d && d.length === 1 && d[0].routePattern === `${CXC}%`));

  //  5. Quien entra (canAccessRoute con la siembra), y que no dependa del orden de las filas.
  const alReves = [...siembra].reverse();
  ok('compras (solo proveedores) entra en antiguedad-saldos, en los dos ordenes', entra('compras', ANT) === true && entra('compras', ANT, alReves) === true);
  ok('facturacion (solo cobros) entra en antiguedad-saldos, en los dos ordenes', entra('facturacion', ANT) === true && entra('facturacion', ANT, alReves) === true);
  ok('cajero (ni cobros ni proveedores) NO entra en antiguedad-saldos', entra('cajero', ANT) === false && entra('cajero', ANT, alReves) === false);
  ok('banco (cobros, sin caja) entra en CxC de Finanzas', entra('banco', CXC) === true);
  ok('cajero (caja, sin cobros ni proveedores) ya NO entra en CxC ni en CxP de Finanzas', entra('cajero', CXC) === false && entra('cajero', CXP) === false);
  ok('compras (proveedores) entra en CxP y no en CxC de Finanzas', entra('compras', CXP) === true && entra('compras', CXC) === false);

  //  6. Quien lo ve en el menu (buildSidebar con la siembra, ejecutado).
  ok('el menu de contabilidad trae CxC y CxP de Finanzas (tiene cobros y proveedores, no caja)', enElMenu('contabilidad', CXC) === 1 && enElMenu('contabilidad', CXP) === 1);
  ok('el menu de compras y el de facturacion traen Antigüedad de Saldos', enElMenu('compras', ANT) === 1 && enElMenu('facturacion', ANT) === 1);
  ok('el menu de cajero no trae Antigüedad de Saldos', enElMenu('cajero', ANT) === 0 && filasDe(`${ANT}%`).length > 0);

  //  7. El cableado: canAccessRoute usa la regla, importada por su especificador completo,
  //     y ya no decide con la primera fila (`return hasPermission(moduleName, ...)`).
  const ctx = leer('src/components/providers/rbacContext.tsx');
  const bloque = ctx.slice(ctx.indexOf('const canAccessRoute'), ctx.indexOf('}, [user,', ctx.indexOf('const canAccessRoute')));
  if (ctx.indexOf('const canAccessRoute') < 0) throw new Error('Precondicion: rbacContext no tiene canAccessRoute');
  ok("rbacContext importa algunaFilaConcede de '@/utils/filasDeLaRuta'", /import\s*\{[^}]*\balgunaFilaConcede\b[^}]*\}\s*from\s*'@\/utils\/filasDeLaRuta'/.test(ctx));
  ok('canAccessRoute decide con algunaFilaConcede sobre las filas de la ruta', /\balgunaFilaConcede\(\s*path\s*,\s*routeMappings\s*,\s*hasPermission\s*\)/.test(bloque));
  ok('canAccessRoute ya no devuelve el permiso de la primera fila que casa', !/return\s+hasPermission\(\s*moduleName/.test(bloque) && /algunaFilaConcede/.test(bloque));

  //  INVARIANTES (ciertos antes y despues).
  const ruta = leer('src/app/api/v1/auth/route-mappings/route.ts');
  invariante('la reparacion de faltantes sigue comparando por RUTA (no añade permisos si la base discrepa)',
    /!mappings\.some\(\(m\)\s*=>\s*m\.routePattern\s*===\s*def\.routePattern\)/.test(ruta));
  invariante('cajero sigue sin entrar en /dashboard/bank y compras tampoco (otras rutas no cambian)',
    !tiene('cajero')('banco', 'read') && /userRole === 'compras' && path\.startsWith\('\/dashboard\/bank'\)/.test(ctx));
  invariante('BI y el Agente siguen fuera del menu (lote 208)',
    siembra.find((s) => s.routePattern === '/dashboard/bi%')?.isMenuItem === false && siembra.find((s) => s.routePattern === '/dashboard/proposals%')?.isMenuItem === false);

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
