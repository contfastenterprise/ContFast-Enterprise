/**
 * P1-20: FK ausente en bank_accounts.chart_account_id.
 *
 * Cambio: migracion 0052 agrega la FK chart_account_id -> chart_of_accounts(id)
 * con ON DELETE RESTRICT, solo si no hay filas huerfanas existentes (si las
 * hay, no crea la FK y avisa -- no se tocan datos). Schema actualizado con
 * .references().
 *
 * Banco de solo-codigo (mas el propio .sql de la migracion).
 */
import { fuente, crudo } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

console.log('\n=== Migracion 0052 ===\n');

const migracion = crudo('drizzle_historico_pre_2026-09-04/0052_fk_bank_accounts_chart_account.sql');

ok('cuenta filas huerfanas (chart_account_id que no existe en chart_of_accounts) antes de crear la FK',
  /SELECT COUNT\(\*\) INTO huerfanas/.test(migracion) &&
  /WHERE ba\.chart_account_id IS NOT NULL\s*\n\s*AND NOT EXISTS \(\s*\n\s*SELECT 1 FROM public\.chart_of_accounts coa WHERE coa\.id = ba\.chart_account_id\s*\n\s*\)/.test(migracion));

ok('si hay huerfanas, NO crea la FK (solo avisa con RAISE NOTICE)',
  /IF huerfanas > 0 THEN\s*\n\s*RAISE NOTICE/.test(migracion));

ok('la creacion de la FK esta en el ELSE (solo corre cuando NO hay huerfanas), guardada por pg_constraint IF NOT EXISTS',
  /IF huerfanas > 0 THEN[\s\S]*?ELSE\s*\n\s*IF NOT EXISTS \(\s*\n\s*SELECT 1 FROM pg_constraint WHERE conname = 'bank_accounts_chart_account_id_chart_of_accounts_id_fk'\s*\n\s*\) THEN\s*\n\s*ALTER TABLE public\.bank_accounts\s*\n\s*ADD CONSTRAINT bank_accounts_chart_account_id_chart_of_accounts_id_fk/.test(migracion));

ok('la FK apunta a chart_of_accounts(id) con ON DELETE RESTRICT',
  /FOREIGN KEY \(chart_account_id\) REFERENCES public\.chart_of_accounts\(id\)\s*\n\s*ON DELETE RESTRICT;/.test(migracion));

ok('no hay ningun UPDATE ni DELETE sobre bank_accounts (no se corrigen filas existentes, solo se cierra el hueco hacia adelante)',
  !/UPDATE public\.bank_accounts/.test(migracion) && !/DELETE FROM public\.bank_accounts/.test(migracion));

console.log('\n=== Esquema Drizzle ===\n');

const schema = fuente('src/db/schema/bank.ts');

ok("importa chartOfAccounts de './accounting'",
  /import\s*\{\s*chartOfAccounts\s*\}\s*from\s*'\.\/accounting';/.test(schema));

//  Estas dos exigian la FK SIMPLE de 0052 (`.references()` en la columna). Esa
//  migracion nunca se aplico: la 0039 ya tenia la FK COMPUESTA
//  (chart_account_id, company_id) -> chart_of_accounts(id, company_id), que
//  ademas impide enlazar la cuenta contable de OTRA empresa. P1-19 lo dejo
//  escrito en bank.ts y lo fija `verificar_p1_19_schema.ts`. Aqui se fija la
//  propiedad de P1-20 -- que la columna no quede sin FK -- sobre la real.
ok('chartAccountId sigue siendo nullable (sin .notNull()) y tiene FK a chartOfAccounts con onDelete restrict (compuesta, 0039)',
  /chartAccountId:\s*uuid\('chart_account_id'\),/.test(schema)
  && /foreignKey\(\{\s*columns: \[table\.chartAccountId, table\.companyId\],\s*foreignColumns: \[chartOfAccounts\.id, chartOfAccounts\.companyId\],\s*name: 'bank_accounts_chart_account_company_fk',\s*\}\)\.onDelete\('restrict'\)/.test(schema));

ok('chartAccountId no queda declarado sin FK (ni simple ni compuesta)',
  /\.references\(\(\) => chartOfAccounts\.id/.test(schema)
  || /columns: \[table\.chartAccountId, table\.companyId\]/.test(schema));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
