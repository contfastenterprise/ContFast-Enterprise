/**
 * P1-11: sin idempotencia en asientos/movimientos financieros.
 *
 * Cambio (parcial, ver alcance en los comentarios del propio codigo):
 * indice unico PARCIAL (status='active') sobre financial_movements
 * (company_id, modo, movement_type, document_id) -- migracion 0050 +
 * schema. Antes de crearlo, la migracion verifica que no haya
 * duplicados activos ya existentes; si los hay, NO crea el indice (para
 * no romper el despliegue) y deja un aviso.
 *
 * Fuera de alcance a proposito (idempotency-key en rutas POST criticas
 * para el caso de un documentId NUEVO en cada reintento) -- ver
 * auditoria P1-11 y el comentario en el schema.
 *
 * Banco de solo-codigo (mas el propio .sql de la migracion).
 */
import { fuente, crudo } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

console.log('\n=== Migracion 0050 ===\n');

const migracion = crudo('drizzle/0050_idempotencia_movimientos_financieros.sql');

ok('cuenta combinaciones duplicadas activas antes de crear el indice',
  /SELECT COUNT\(\*\) INTO duplicados_activos/.test(migracion) &&
  /GROUP BY company_id, modo, movement_type, document_id\s*\n\s*HAVING COUNT\(\*\) > 1/.test(migracion));

ok('si hay duplicados activos, NO crea el indice (solo avisa con RAISE NOTICE)',
  /IF duplicados_activos > 0 THEN\s*\n\s*RAISE NOTICE/.test(migracion));

ok('la creacion del indice esta en el ELSE (solo corre cuando NO hay duplicados)',
  /IF duplicados_activos > 0 THEN[\s\S]*?ELSE\s*\n\s*IF NOT EXISTS \(SELECT 1 FROM pg_indexes WHERE indexname = 'fin_mov_company_modo_type_doc_uniq'\) THEN\s*\n\s*CREATE UNIQUE INDEX fin_mov_company_modo_type_doc_uniq/.test(migracion));

ok('el CREATE UNIQUE INDEX es idempotente (guardado por pg_indexes IF NOT EXISTS, no CREATE INDEX IF NOT EXISTS directo)',
  /IF NOT EXISTS \(SELECT 1 FROM pg_indexes WHERE indexname = 'fin_mov_company_modo_type_doc_uniq'\) THEN/.test(migracion));

ok('el indice cubre exactamente (company_id, modo, movement_type, document_id)',
  /CREATE UNIQUE INDEX fin_mov_company_modo_type_doc_uniq\s*\n\s*ON public\.financial_movements \(company_id, modo, movement_type, document_id\)/.test(migracion));

ok("el indice es parcial (WHERE status = 'active') -- un movimiento anulado no bloquea reprocesar el mismo documento",
  /ON public\.financial_movements \(company_id, modo, movement_type, document_id\)\s*\n\s*WHERE status = 'active';/.test(migracion));

ok('no hay ningun UPDATE ni DELETE sobre financial_movements (no se tocan datos existentes, solo se cierra el hueco hacia adelante)',
  !/UPDATE public\.financial_movements/.test(migracion) && !/DELETE FROM public\.financial_movements/.test(migracion));

console.log('\n=== Esquema Drizzle ===\n');

const schema = fuente('src/db/schema/accounting.ts');

ok("importa sql de 'drizzle-orm' (lo necesita el .where() del indice parcial)",
  /import\s*\{\s*sql\s*\}\s*from\s*'drizzle-orm';/.test(schema));

ok('financialMovements define companyModoTypeDocUniqueIdx',
  /companyModoTypeDocUniqueIdx:\s*uniqueIndex\('fin_mov_company_modo_type_doc_uniq'\)/.test(schema));

ok('el indice cubre companyId, modo, movementType, documentId en ese orden',
  /uniqueIndex\('fin_mov_company_modo_type_doc_uniq'\)\s*\n\s*\.on\(table\.companyId, table\.modo, table\.movementType, table\.documentId\)/.test(schema));

ok("el indice es parcial en el schema tambien (.where(sql`status = 'active'`))",
  /\.on\(table\.companyId, table\.modo, table\.movementType, table\.documentId\)\s*\n\s*\.where\(sql`status = 'active'`\)/.test(schema));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
