import { crudo as crudoCrudo } from './_fuente';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═════════════════ Pruebas-candado desfasadas respecto a P0/P1 ═════════════════
// Tres candados de la suite marcaban en rojo codigo que ya estaba corregido:
//   - permisosRutas no conocia esSistemas/esAdminOSistemas (P0-02), asi que daba por
//     desprotegidas las 4 rutas de admin que P0-01 y P0-03 habian endurecido, y
//     seguia listando company/settings como deuda cuando P1-15 ya le puso
//     enforcePermission.
//   - resolucionCuentas seguia registrando deuda de 4 ficheros que P0-05 migro al
//     resolvedor (hoy en 0 llamadas a getOrCreateAccount).
//   - entornoDgii marcaba company/settings por nombrar msellerApiKeyEncrypted,
//     cuando esa ruta la nombra para lo contrario: desestructurarla FUERA de la
//     respuesta (P1-15). Se exime, y se anade una prueba que vigila el descarte
//     para que la exencion no tape una lectura real si alguien la reintroduce.
// Ninguno de los cuatro fallos senalaba un defecto: los candados iban por detras.

// ─────────── 1. permisosRutas ───────────
{
  const src = crudo('src/tests/permisosRutas.vitest.ts');
  ok('permisosRutas: COMPROBACIONES reconoce esSistemas', src.includes("  'esSistemas',\n"));
  ok('permisosRutas: COMPROBACIONES reconoce esAdminOSistemas', src.includes("  'esAdminOSistemas',\n"));
  ok('permisosRutas: la nota explica por que se anadieron', src.includes('sustituyen a `session.role !=='));
  ok(
    'permisosRutas: PENDIENTES ya no lista company/settings (P1-15 le puso enforcePermission)',
    !src.includes("  'v1/company/settings/route.ts',\n")
  );
}

// ─────────── 2. resolucionCuentas ───────────
{
  const src = crudo('src/tests/resolucionCuentas.vitest.ts');
  ok(
    'resolucionCuentas: PENDIENTES suelta los 4 ficheros migrados y conserva los 2 con deuda real',
    !src.includes("'src/app/api/v1/expenses/route.ts':") &&
      !src.includes("'src/app/api/v1/expenses/[id]/route.ts':") &&
      !src.includes("'src/services/expenseService.ts':") &&
      !src.includes("'src/services/invoice/invoiceDbBooker.ts':") &&
      src.includes("'src/app/api/v1/bank/accounts/[id]/transactions/route.ts':") &&
      src.includes("'src/repositories/arRepository.ts':")
  );
  ok(
    'resolucionCuentas: la nota documenta lo que migro P0-05',
    src.includes('P0-05 (2026-09-03) migró al resolvedor')
  );
}

// ─────────── 3. entornoDgii ───────────
{
  const src = crudo('src/tests/entornoDgii.vitest.ts');
  ok(
    'entornoDgii: exime company/settings del barrido de la clave vieja',
    src.includes(".filter((f) => !f.endsWith('api/v1/company/settings/route.ts'));")
  );
  ok(
    'entornoDgii: la exencion viene con su motivo escrito',
    src.includes('lo desestructura fuera de la respuesta para NO')
  );
  ok(
    'entornoDgii: existe la prueba que justifica la exencion',
    src.includes("it('la ruta de ajustes sigue sin devolver las credenciales al navegador'")
  );
  ok(
    'entornoDgii: esa prueba exige que la unica mencion sea la del descarte',
    src.includes("'Solo puede nombrarse una vez, la del descarte.'")
  );
}

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
