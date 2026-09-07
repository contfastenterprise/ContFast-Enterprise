import { crudo as crudoCrudo } from './_fuente';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

const contar = (s: string, sub: string): number => s.split(sub).length - 1;

// ═══════════════ Gating de UI por nombre de rol (extension de P0-02 al frontend) ═══════════════
// Los 11 sitios de frontend seguian usando .includes('sistema')/.includes('admin') -- el mismo
// patron que P0-02 cerro en el backend -- de modo que un rol creado de buena fe como
// "Admin de Almacen" o "Soporte de Sistemas" veia menus y controles de privilegio elevado.
// Se pasa a comparacion exacta con los helpers de @/utils/rolMatch, y en retenciones al
// sistema de permisos real (hasPermission), que ya cubre sistemas/administracion/contabilidad
// y ademas respeta cualquier rol al que se le haya otorgado contabilidad:read en la BD.

// ─────────────────── 1. accounting/page.tsx ───────────────────
{
  const src = crudo('src/app/dashboard/accounting/page.tsx');
  ok('accounting: importa esAdminOSistemas de rolMatch', src.includes("import { esAdminOSistemas } from '@/utils/rolMatch';"));
  ok(
    'accounting: los 2 guardias usan esAdminOSistemas + contabilidad exacto',
    contar(src, "const isAuth = esAdminOSistemas(role) || role === 'contabilidad';") === 2
  );
  ok('accounting: sin ningun role.includes( remanente', !src.includes('role.includes('));
}

// ─────────────────── 2. bi/page.tsx ───────────────────
{
  const src = crudo('src/app/dashboard/bi/page.tsx');
  ok('bi: importa esAdminOSistemas de rolMatch', src.includes("import { esAdminOSistemas } from '@/utils/rolMatch';"));
  ok('bi: el guardia usa esAdminOSistemas', src.includes('const isAuth = esAdminOSistemas(role);'));
  ok('bi: sin ningun role.includes( remanente', !src.includes('role.includes('));
}

// ─────────────────── 3. ClientLayout.tsx ───────────────────
{
  const src = crudo('src/app/dashboard/ClientLayout.tsx');
  ok('ClientLayout: importa esAdminOSistemas de rolMatch', src.includes("import { esAdminOSistemas } from '@/utils/rolMatch';"));
  ok(
    'ClientLayout: la redireccion desde /dashboard usa esAdminOSistemas',
    src.includes('const isAdminOrSys = esAdminOSistemas(normalized);')
  );
  ok("ClientLayout: sin normalized.includes('admin')", !src.includes("normalized.includes('admin')"));
  ok("ClientLayout: sin normalized.includes('sistema')", !src.includes("normalized.includes('sistema')"));
}

// ─────────────────── 4. admin/page.tsx ───────────────────
{
  const src = crudo('src/app/dashboard/admin/page.tsx');
  ok(
    'admin: importa esAdminOSistemas y esSistemas de rolMatch',
    src.includes("import { esAdminOSistemas, esSistemas } from '@/utils/rolMatch';")
  );
  ok('admin: la pestana de planes usa esAdminOSistemas', src.includes('{esAdminOSistemas(currentUserRole) && ('));
  ok("admin: 'No suspendible' usa esSistemas exacto", src.includes('{esSistemas(user.roleName) ? ('));
  ok(
    "admin: sin currentUserRole?.toLowerCase().includes('admin')",
    !src.includes("currentUserRole?.toLowerCase().includes('admin')")
  );
  ok(
    "admin: sin user.roleName?.toLowerCase().includes('sistema')",
    !src.includes("user.roleName?.toLowerCase().includes('sistema')")
  );
}

// ─────────────────── 5. invoices/page.tsx ───────────────────
{
  const src = crudo('src/app/dashboard/invoices/page.tsx');
  ok('invoices: importa esAdminOSistemas de rolMatch', src.includes("import { esAdminOSistemas } from '@/utils/rolMatch';"));
  ok('invoices: el permiso de descuento usa esAdminOSistemas', src.includes('const canEditDiscount = esAdminOSistemas(userRole);'));
  ok(
    'invoices: sin el OR de substring del descuento',
    !src.includes("userRole.includes('sistema') || userRole.includes('admin')")
  );
}

// ─────────────────── 6. retentions/page.tsx ───────────────────
{
  const src = crudo('src/app/dashboard/retentions/page.tsx');
  ok('retentions: importa useRbac', src.includes("import { useRbac } from '@/components/providers/rbacContext';"));
  ok(
    'retentions: consume loading y hasPermission del contexto RBAC',
    src.includes('const { loading: rbacLoading, hasPermission } = useRbac();')
  );
  ok(
    'retentions: el acceso se decide por permiso, no por nombre de rol',
    src.includes("const hasAccess = hasPermission('contabilidad', 'read');")
  );
  ok("retentions: sin userRole.includes('conta')", !src.includes("userRole.includes('conta')"));
  ok("retentions: sin userRole.includes('auditor')", !src.includes("userRole.includes('auditor')"));
  ok('retentions: ya no hace su propio fetch a /api/v1/auth/me', !src.includes("fetch('/api/v1/auth/me')"));
  ok('retentions: el spinner depende de rbacLoading', src.includes('if (rbacLoading) {'));
  ok('retentions: sin el estado local authLoaded', !src.includes('authLoaded'));
  ok('retentions: sin el estado local currentUser', !src.includes('currentUser'));
  ok(
    'retentions: el texto de acceso restringido habla del permiso, no de roles',
    src.includes('Necesitas permiso de lectura sobre <strong>Contabilidad</strong>')
  );
}

// ─────────────────── 7. settings/page.tsx ───────────────────
{
  const src = crudo('src/app/dashboard/settings/page.tsx');
  ok(
    'settings: importa esAdministracion y esSistemas de rolMatch',
    src.includes("import { esAdministracion, esSistemas } from '@/utils/rolMatch';")
  );
  ok('settings: isSistemas usa comparacion exacta', src.includes('const isSistemas = esSistemas(userRole);'));
  ok('settings: isAdministracion usa comparacion exacta', src.includes('const isAdministracion = esAdministracion(userRole);'));
  ok("settings: sin userRole?.toLowerCase().includes('sistema')", !src.includes("userRole?.toLowerCase().includes('sistema')"));
  ok("settings: sin userRole?.toLowerCase().includes('admin')", !src.includes("userRole?.toLowerCase().includes('admin')"));
}

// ─────────────────── 8. rbacContext.tsx ───────────────────
{
  const src = crudo('src/components/providers/rbacContext.tsx');
  ok(
    'rbacContext: importa esAdministracion y esSistemas de rolMatch',
    src.includes("import { esAdministracion, esSistemas } from '@/utils/rolMatch';")
  );
  ok('rbacContext: los 2 atajos de sistemas usan esSistemas', contar(src, 'if (esSistemas(userRole)) return true;') === 2);
  ok('rbacContext: el atajo de administracion usa esAdministracion', src.includes('if (esAdministracion(userRole)) {'));
  ok("rbacContext: sin userRole.includes('sistema')", !src.includes("userRole.includes('sistema')"));
  ok("rbacContext: sin userRole.includes('admin')", !src.includes("userRole.includes('admin')"));
  ok("rbacContext: sin userRole.includes('administraci')", !src.includes("userRole.includes('administraci')"));
}

// ─────────────────── 9. barrido global de los 8 archivos ───────────────────
{
  const ARCHIVOS = [
    'src/app/dashboard/accounting/page.tsx',
    'src/app/dashboard/bi/page.tsx',
    'src/app/dashboard/ClientLayout.tsx',
    'src/app/dashboard/admin/page.tsx',
    'src/app/dashboard/invoices/page.tsx',
    'src/app/dashboard/retentions/page.tsx',
    'src/app/dashboard/settings/page.tsx',
    'src/components/providers/rbacContext.tsx',
  ];
  let restos = 0;
  for (const a of ARCHIVOS) {
    const s = crudo(a);
    restos += contar(s, ".includes('sistema')");
    restos += contar(s, ".includes('admin')");
    restos += contar(s, ".includes('administraci')");
  }
  ok(
    `barrido: 0 usos de .includes('sistema'|'admin'|'administraci') en los 8 archivos (hallados ${restos})`,
    restos === 0
  );
}

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
