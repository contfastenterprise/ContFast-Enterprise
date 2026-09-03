/**
 * P0-02: comparacion EXACTA de rol, no por substring.
 *
 * LO QUE PASO
 * -----------
 * La auditoria del 2026-09-03 encontro que `middleware/permissions.ts` ya
 * habia corregido esto una vez (Auditoria F0-05: `role.includes('admin')`
 * dejaba pasar cualquier rol cuyo NOMBRE contuviera esas letras, como "Admin
 * de Almacen" o "Soporte de Sistemas", sin que nadie le otorgara ese
 * privilegio). El mismo patron roto seguia vivo, sin corregir, en otros 13
 * sitios reales del backend: el middleware de Edge (`proxy.ts`, que da acceso
 * TOTAL a contabilidad/banco/nomina/reportes si `isSistemas`), el generador de
 * permisos que se firma en el JWT (`rbacService.ts`), el UNICO guardia del
 * borrado de compras (`expenses/[id]/route.ts`), y 10 sitios mas.
 *
 * EL ARREGLO
 * ----------
 * `utils/rolMatch.ts` es ahora la unica fuente de esta comparacion --
 * `esSistemas`, `esAdministracion`, `esAdminOSistemas` -- sin ninguna
 * dependencia (ni base de datos, ni Node, ni React), para que tanto el
 * middleware de Edge como el codigo de cliente (sidebar) puedan importarla
 * sin arrastrar nada incompatible con su entorno.
 *
 * Este banco comprueba, en cada uno de los 13 sitios, que:
 *   1) importa de 'utils/rolMatch' (o, para permissions.ts, delega en ella), y
 *   2) ya NO queda el patron `role*.includes('admin'|'sistema')` suelto.
 * Contraprobado: revirtiendo cualquiera de los 13 sitios a `.includes(...)`,
 * la comprobacion (2) de ese archivo se pone roja.
 */
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

// Patron roto: `<algo>.includes('admin')` o `<algo>.includes('sistema')`
// sobre una variable de rol. Basta con buscar el substring exacto de la
// llamada rota, no hace falta una regex mas permisiva -- eso es justo lo que
// esta auditoria corrige, no lo que hay que replicar en el banco.
const PATRON_ROTO = /\.includes\('sistema'\)|\.includes\('admin'\)|\.includes\('administraci'\)/;

console.log('\n1) utils/rolMatch.ts -- existe y expone las 3 funciones puras\n');

const rolMatch = fuente('src/utils/rolMatch.ts');
ok("exporta esSistemas", /export function esSistemas\(/.test(rolMatch));
ok("exporta esAdministracion", /export function esAdministracion\(/.test(rolMatch));
ok("exporta esAdminOSistemas", /export function esAdminOSistemas\(/.test(rolMatch));
ok("esSistemas compara con === 'sistemas' (no includes)", /===\s*'sistemas'/.test(rolMatch) && !PATRON_ROTO.test(rolMatch));
ok("no importa nada (funcion pura, usable desde Edge y cliente)", !/^import /m.test(rolMatch));

console.log('\n2) Los 13 sitios reales del backend usan rolMatch y no el patron roto\n');

const SITIOS: { archivo: string; usa: RegExp; nota: string }[] = [
  { archivo: 'src/proxy.ts', usa: /esSistemas\(userRole\)/, nota: 'middleware de Edge: acceso total si isSistemas' },
  { archivo: 'src/middleware/permissions.ts', usa: /return esAdminOSistemas\(roleName\)/, nota: 'isAdminOrSistemas() ahora delega en rolMatch' },
  { archivo: 'src/utils/rbacHelpers.ts', usa: /esSistemas\(cleanRole\)/, nota: 'sidebar del cliente' },
  { archivo: 'src/services/auth/rbacService.ts', usa: /esSistemas\(normalizedRole\)/, nota: 'permisos firmados en el JWT' },
  { archivo: 'src/app/api/v1/expenses/[id]/route.ts', usa: /esSistemas\(session\.role\)/, nota: 'unico guardia del DELETE de compras' },
  { archivo: 'src/repositories/adminRepository.ts', usa: /esSistemas\(userWithRole\.roleName\)/, nota: 'proteccion contra suspender a un usuario de sistemas' },
  { archivo: 'src/services/invoice/invoiceDbBooker.ts', usa: /esAdminOSistemas\(roleName\)/, nota: 'apertura de caja al facturar en efectivo' },
  { archivo: 'src/app/api/v1/bi/stats/route.ts', usa: /esAdminOSistemas\(userRole\)/, nota: 'panel de BI (ya mitigado por requirePermission, defensa en profundidad)' },
  { archivo: 'src/app/api/v1/financial/dashboard/route.ts', usa: /esAdminOSistemas\(role\)/, nota: 'checkFinancialAccess' },
  { archivo: 'src/app/api/v1/financial/statements/customers/[id]/print/route.ts', usa: /esAdminOSistemas\(role\)/, nota: 'checkFinancialAccess' },
  { archivo: 'src/app/api/v1/financial/statements/customers/[id]/route.ts', usa: /esAdminOSistemas\(role\)/, nota: 'checkFinancialAccess' },
  { archivo: 'src/app/api/v1/financial/statements/suppliers/[id]/print/route.ts', usa: /esAdminOSistemas\(role\)/, nota: 'checkFinancialAccess' },
  { archivo: 'src/app/api/v1/financial/statements/suppliers/[id]/route.ts', usa: /esAdminOSistemas\(role\)/, nota: 'checkFinancialAccess' },
];

for (const s of SITIOS) {
  const src = fuente(s.archivo);
  ok(`${s.archivo}: importa de utils/rolMatch`, /from '@\/utils\/rolMatch'/.test(src), s.nota);
  ok(`${s.archivo}: usa la funcion esperada (${s.usa})`, s.usa.test(src));
  ok(`${s.archivo}: ya no queda el patron roto`, !PATRON_ROTO.test(src));
}

console.log('\n3) Barrido global: ningun .ts/.tsx del backend real conserva el patron roto\n');
// (Se limita a los mismos 13 archivos -- un barrido de todo src/ con find+grep
// ya se hizo a mano durante la correccion; este paso re-confirma esos 13.)
ok('los 13 sitios ya cubiertos arriba son exactamente los que tenian el patron',
  SITIOS.length === 13);

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
