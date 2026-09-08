import { crudo as crudoCrudo } from './_fuente';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═══════════ Los 9 errores de tipos anteriores a mi trabajo ═══════════
// Commits de junio a agosto, tapados todo este tiempo por
// `typescript: { ignoreBuildErrors: true }`. Dos de los nueve NO eran ruido de
// tipos sino defectos de ejecucion: la descripcion del asiento de pago a
// proveedor decia "undefined", y dos comprobaciones de integration.ts no
// llegaban a ejecutarse nunca.

// ─────────── 1-2) or() puede devolver undefined ───────────
{
  const s = crudo('src/repositories/apRepository.ts');
  ok(
    'apRepository: el or() de busqueda se comprueba antes de usarse',
    s.includes('const porTexto = or(') && s.includes('if (porTexto) conditions.push(porTexto);')
  );
  ok(
    'apRepository: ya no se empuja el or() directamente',
    !s.includes('conditions.push(\n        or(\n          ilike(suppliers.name, searchStr),')
  );
}

{
  const s = crudo('src/repositories/supplierRepository.ts');
  ok(
    'supplierRepository: el or() de busqueda se comprueba antes de usarse',
    s.includes('const porTexto = or(') && s.includes('if (porTexto) conditions.push(porTexto);')
  );
  ok(
    'supplierRepository: ya no se empuja el or() directamente',
    !s.includes('conditions.push(\n        or(\n          ilike(suppliers.name, `%${search}%`),')
  );
}

// ─────────── 3) overtimeRecords.type ───────────
{
  const s = crudo('src/db/schema/hr.ts');
  ok(
    'esquema hr: overtimeRecords.type declara sus 4 valores reales',
    s.includes(".$type<'diurna' | 'nocturna' | 'festiva' | 'doble'>()")
  );
  ok('esquema hr: la nota dice quien impone esos valores', s.includes('los impone el esquema Zod'));
}

// ─────────── 4) promotional_price es NOT NULL ───────────
{
  const s = crudo('src/repositories/productRepository.ts');
  ok(
    "productRepository: al limpiar el precio promocional se escribe '0.00', no null",
    s.includes("data.promotionalPrice.toString() : '0.00';")
  );
  ok(
    'productRepository: ya no escribe null en la columna NOT NULL',
    !s.includes('data.promotionalPrice.toString() : null;')
  );
  ok(
    'productRepository: la nota explica que era un fallo contra la base, no solo de tipos',
    s.includes('habria reventado contra la base de datos')
  );
}

// ─────────── 5) apService: "proveedor undefined" en la contabilidad ───────────
{
  const s = crudo('src/services/apService.ts');
  ok('apService: importa suppliers', s.includes(', auditLogs, suppliers }'));
  ok(
    'apService: consulta el nombre real del proveedor dentro de la transaccion',
    s.includes('const [proveedor] = await tx') &&
      s.includes('.select({ name: suppliers.name })') &&
      s.includes('eq(suppliers.id, ap.supplierId)')
  );
  ok(
    'apService: la descripcion del asiento usa ese nombre',
    s.includes("Pago CXP a proveedor ${proveedor?.name ?? 'sin identificar'}")
  );
  ok('apService: ya no usa la propiedad inexistente ap.supplierName', !s.includes('${ap.supplierName}'));
}

// ─────────── 6) el cargo del volante de pago ───────────
{
  const s = crudo('src/repositories/hrRepository.ts');
  ok('hrRepository: findPayrollDetails trae el puesto', s.includes('positionName: positions.name,'));
  ok(
    'hrRepository: lo une por leftJoin (un empleado puede no tener puesto)',
    s.includes('.leftJoin(positions, eq(employees.positionId, positions.id))')
  );
}

// ─────────── 7) codigoFactura nullable ───────────
{
  const s = crudo('src/services/invoiceService.ts');
  ok(
    'invoiceService: codigoFactura nullable se resuelve al imprimir',
    s.includes("dbResult.invoice.codigoFactura ?? '',")
  );
}

// ─────────── 8-9) cashService / integration.ts ───────────
{
  const s = crudo('src/services/cashService.ts');
  ok('cashService: la rama que exige aprobacion usa literal', s.includes('requiresApproval: true as const,'));
  ok(
    'cashService: la rama normal tambien declara requiresApproval',
    s.includes('return { ...movimiento, requiresApproval: false as const };')
  );
  ok(
    'cashService: la nota explica que la prueba no llegaba a ejecutarse',
    s.includes('la prueba existia pero no probaba nada')
  );
}

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
