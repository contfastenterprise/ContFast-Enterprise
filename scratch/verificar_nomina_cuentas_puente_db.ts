/**
 * Lote 292, contra una base -- las cuentas de la nomina se siembran y se
 * completan de verdad. Integracion: base DESECHABLE, con candado (`precarga.mts`).
 * NUNCA contra el `.env`.
 *
 * Lo que se ejecuta:
 *  1. Una empresa NUEVA (`crearEmpresaConSuSiembra`, la de Administracion y
 *     del registro) nace con las ocho cuentas de nomina, transaccionales, con
 *     su padre y su nivel, y con las ocho claves enlazadas. 6.1.01.02 nace como
 *     "Aportes Patronales TSS" (D7). Dentro de una transaccion que se deshace.
 *  2. Una empresa EXISTENTE, dejada como estan hoy las de PRODUCCION -- sin
 *     claves de nomina, sin las cinco cuentas nuevas, 6.1.01.02 con el nombre
 *     viejo -- y ademas con la trampa de Latin Doors: 2.1.03 ITBIS por Pagar,
 *     2.1.04 y 2.1.05, transaccionales y con movimientos.
 *     · `completarCuentasDelSistema` (lo que lanza el guion del lote 165)
 *       enlaza 3, crea 5, no toca 2.1.03-2.1.05, no mueve un centimo y no
 *       renombra 6.1.01.02 (eso es del contador);
 *     · `getMappings` (lote 171: enlaza SOLO lo que falta cuando la cuenta ya
 *       existe por codigo) engancha exactamente las tres que existen, y nada
 *       a 2.1.03-2.1.05;
 *     · completar otra vez no hace nada: el guion es idempotente.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'banco-lote-292-jwt';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'banco-lote-292-refresh';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import { AccountingRepository } from '../src/repositories/accountingRepository';
import { crearEmpresaConSuSiembra } from '../src/services/empresas/altaDeEmpresa';
import { motivoDeRechazoUrl } from './bancos_db/candado';

const B = '22222222-2222-2222-2222-222222222222';

let fallos = 0;
let total = 0;
const ok = (t: string, c: boolean, d = '') => { total++; console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
type Fila = Record<string, unknown>;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const filas = async (x: Tx | typeof db, q: ReturnType<typeof sql>) => (await x.execute(q)) as unknown as Fila[];
class Deshacer extends Error {}

const ESPERADAS: [clave: string, codigo: string, nombre: string, tipo: string, naturaleza: string][] = [
  ['payroll_salaries_expense', '6.1.01.01', 'Sueldos y Salarios', 'expense', 'debit'],
  ['payroll_employer_tss_expense', '6.1.01.02', 'Aportes Patronales TSS', 'expense', 'debit'],
  ['payroll_infotep_expense', '6.1.01.03', 'Aporte Infotep', 'expense', 'debit'],
  ['payroll_salaries_payable', '2.1.01.04', 'Sueldos por Pagar', 'liability', 'credit'],
  ['payroll_tss_payable', '2.1.02.04', 'TSS por Pagar (AFP, SFS, SRL)', 'liability', 'credit'],
  ['payroll_isr_payable', '2.1.02.05', 'ISR Retenido a Asalariados por Pagar', 'liability', 'credit'],
  ['payroll_infotep_payable', '2.1.02.06', 'Infotep por Pagar', 'liability', 'credit'],
  ['payroll_other_deductions', '2.1.01.02', 'Otras Cuentas por Pagar', 'liability', 'credit'],
];
const NUEVAS = ['6.1.01.03', '2.1.01.04', '2.1.02.04', '2.1.02.05', '2.1.02.06'];
const VIEJO_D7 = 'Retenciones TSS (SFS/AFP/TSS)';

/** Las claves de nomina de una empresa, con la cuenta a la que apuntan. */
const enlacesDeNomina = (x: Tx | typeof db, empresa: string) => filas(x, sql`
  SELECT am.mapping_key AS clave, ca.code, ca.name, ca.type, ca.nature, ca.is_transactional AS trans, ca.status,
         ca.level, p.code AS padre
  FROM accounting_mappings am JOIN chart_of_accounts ca ON ca.id = am.account_id
  LEFT JOIN chart_of_accounts p ON p.id = ca.parent_id
  WHERE am.company_id = ${empresa}::uuid AND am.mapping_key LIKE 'payroll\\_%'`);

/** Por cuenta: renglones y sumas. Lo que "no mover saldos" quiere decir. */
const saldos = async (x: Tx | typeof db, empresa: string) => JSON.stringify(await filas(x, sql`
  SELECT ca.code, count(l.id)::int AS n, coalesce(sum(l.debit), 0)::text AS d, coalesce(sum(l.credit), 0)::text AS c
  FROM chart_of_accounts ca LEFT JOIN journal_entry_lines l ON l.account_id = ca.id
  WHERE ca.company_id = ${empresa}::uuid GROUP BY ca.code ORDER BY ca.code`));

/** Que cada clave apunte a SU cuenta, bien formada (con el nombre admitido). */
function revisarEnlaces(enl: Fila[], nombre6102: string): string[] {
  const mal: string[] = [];
  for (const [clave, codigo, nombre, tipo, naturaleza] of ESPERADAS) {
    const e = enl.filter((x) => x.clave === clave);
    if (e.length !== 1) { mal.push(`${clave}: ${e.length} enlaces`); continue; }
    const f = e[0];
    const nom = codigo === '6.1.01.02' ? nombre6102 : nombre;
    const padre = codigo.slice(0, codigo.lastIndexOf('.'));
    if (f.code !== codigo || f.name !== nom || f.type !== tipo || f.nature !== naturaleza || f.trans !== true
      || f.status !== 'active' || Number(f.level) !== codigo.split('.').length || f.padre !== padre) {
      mal.push(`${clave} -> ${f.code} "${f.name}" ${f.type}/${f.nature} nivel ${f.level} bajo ${f.padre}`);
    }
  }
  return mal;
}

async function main() {
  // El candado ya lo exige la precarga; se repite porque este banco ESCRIBE.
  const motivo = motivoDeRechazoUrl(process.env.DATABASE_URL);
  if (motivo) throw new Error(`CANDADO: ${motivo}`);
  const [b] = await filas(db, sql`SELECT count(*)::int AS n FROM chart_of_accounts WHERE company_id = ${B}::uuid`);
  if (!b || Number(b.n) < 40) throw new Error('Precondicion: la empresa B de la semilla no tiene catalogo');

  console.log('\n1) Una empresa nueva nace con las ocho cuentas enlazadas\n');
  try {
    await db.transaction(async (tx) => {
      const { empresa } = await crearEmpresaConSuSiembra(tx, { name: 'Empresa del lote 292', rnc: '292292292' });
      const id = empresa.id;
      const enl = await enlacesDeNomina(tx, id);
      const mal = revisarEnlaces(enl, 'Aportes Patronales TSS');
      ok('las ocho claves de nomina, cada una a su cuenta: codigo, nombre, tipo, naturaleza, nivel y padre',
        enl.length === 8 && mal.length === 0, mal.join('; ') || `${enl.length} enlaces`);
      const [d7] = await filas(tx, sql`SELECT name FROM chart_of_accounts WHERE company_id = ${id}::uuid AND code = '6.1.01.02'`);
      ok('D7: 6.1.01.02 nace como "Aportes Patronales TSS"', d7?.name === 'Aportes Patronales TSS', String(d7?.name));
      const plan = await AccountingRepository.completarCuentasDelSistema(id, tx);
      ok('  y completarla despues no hace nada (ya nace completa)',
        plan.length > 0 && plan.every((p) => p.accion === 'nada') && plan.some((p) => 'clave' in p && p.clave === 'payroll_salaries_payable'),
        plan.filter((p) => p.accion !== 'nada').map((p) => p.accion).join(' '));
      throw new Deshacer();
    });
  } catch (e) {
    if (!(e instanceof Deshacer)) ok('la empresa nueva se pudo crear', false, (e as Error).message);
  }

  console.log('\n2) Una empresa existente, como las de PRODUCCION (y con la trampa de Latin Doors)\n');
  // Se deja B como esta hoy una empresa de produccion, y con 2.1.03-2.1.05.
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM accounting_mappings WHERE company_id = ${B}::uuid AND mapping_key LIKE 'payroll\\_%'`);
    await tx.execute(sql`DELETE FROM journal_entry_lines WHERE company_id = ${B}::uuid AND journal_entry_id IN
      (SELECT id FROM journal_entries WHERE company_id = ${B}::uuid AND reference = 'banco-292')`);
    await tx.execute(sql`DELETE FROM journal_entries WHERE company_id = ${B}::uuid AND reference = 'banco-292'`);
    await tx.execute(sql`DELETE FROM chart_of_accounts WHERE company_id = ${B}::uuid
      AND code IN ('6.1.01.03', '2.1.01.04', '2.1.02.04', '2.1.02.05', '2.1.02.06', '2.1.03', '2.1.04', '2.1.05')`);
    await tx.execute(sql`UPDATE chart_of_accounts SET name = ${VIEJO_D7} WHERE company_id = ${B}::uuid AND code = '6.1.01.02'`);
    const [p21] = await filas(tx, sql`SELECT id FROM chart_of_accounts WHERE company_id = ${B}::uuid AND code = '2.1'`);
    for (const [code, name] of [['2.1.03', 'ITBIS por Pagar'], ['2.1.04', 'ISR Retenido por Pagar'], ['2.1.05', 'ITBIS Retenido por Pagar']]) {
      await tx.execute(sql`INSERT INTO chart_of_accounts (company_id, code, name, type, nature, level, is_transactional, parent_id, status)
        VALUES (${B}::uuid, ${code}, ${name}, 'liability', 'credit', 3, true, ${p21.id as string}::uuid, 'active')`);
    }
    // Movimientos en las cuentas que no se pueden tocar, y en una que se enlaza.
    const [asiento] = await filas(tx, sql`INSERT INTO journal_entries (company_id, modo, reference, date, description)
      VALUES (${B}::uuid, 'PRODUCCION', 'banco-292', '2026-09-15', 'Banco 292: saldos que no se pueden mover') RETURNING id`);
    const cuenta = async (code: string) => (await filas(tx, sql`SELECT id FROM chart_of_accounts WHERE company_id = ${B}::uuid AND code = ${code}`))[0].id as string;
    for (const [code, debit, credit] of [['1.1.01.01', '1500.00', '0'], ['2.1.03', '0', '1000.00'], ['2.1.04', '0', '250.00'],
      ['2.1.05', '0', '150.00'], ['2.1.01.02', '0', '100.00']] as const) {
      await tx.execute(sql`INSERT INTO journal_entry_lines (company_id, modo, journal_entry_id, account_id, debit, credit)
        VALUES (${B}::uuid, 'PRODUCCION', ${asiento.id as string}::uuid, ${await cuenta(code)}::uuid, ${debit}, ${credit})`);
    }
  });
  const enlAntes = await enlacesDeNomina(db, B);
  if (enlAntes.length !== 0) throw new Error('Precondicion: B deberia quedar sin claves de nomina');
  const saldosAntes = await saldos(db, B);

  // 2a. Lo que hace el guion (completar), sin que getMappings haya pasado antes.
  try {
    await db.transaction(async (tx) => {
      const plan = await AccountingRepository.completarCuentasDelSistema(B, tx);
      const enl = await enlacesDeNomina(tx, B);
      const mal = revisarEnlaces(enl, VIEJO_D7);
      const creadas = plan.filter((p) => p.accion === 'crear_y_enlazar').map((p) => (p as { cuenta: { codigo: string } }).cuenta.codigo).sort();
      const enlazadas = plan.filter((p) => p.accion === 'enlazar').map((p) => (p as { codigo: string }).codigo).sort();
      ok('completar: enlaza las tres que existen y crea las cinco que faltan, bajo su padre',
        enl.length === 8 && mal.length === 0 && JSON.stringify(creadas) === JSON.stringify([...NUEVAS].sort())
        && JSON.stringify(enlazadas) === JSON.stringify(['2.1.01.02', '6.1.01.01', '6.1.01.02']),
        mal.join('; ') || `crea ${creadas.join(' ')}; enlaza ${enlazadas.join(' ')}`);
      const ajenas = enl.filter((x) => ['2.1.03', '2.1.04', '2.1.05'].includes(String(x.code)));
      ok('  ninguna clave de nomina cae en 2.1.03, 2.1.04 ni 2.1.05 (ITBIS e ISR, con movimientos)',
        enl.length === 8 && ajenas.length === 0, ajenas.map((x) => `${x.clave}->${x.code}`).join(' '));
      ok('  no mueve un centimo: cada cuenta con los mismos renglones y las mismas sumas',
        enl.length === 8 && JSON.stringify(JSON.parse(await saldos(tx, B))
          .filter((f: Fila) => !NUEVAS.includes(String(f.code)))) === saldosAntes);
      const [d7] = await filas(tx, sql`SELECT name FROM chart_of_accounts WHERE company_id = ${B}::uuid AND code = '6.1.01.02'`);
      ok('  y no renombra 6.1.01.02: el nombre de una empresa existente es del contador (D7)',
        enl.length === 8 && d7?.name === VIEJO_D7, String(d7?.name));
      throw new Deshacer();
    });
  } catch (e) {
    if (!(e instanceof Deshacer)) ok('completar la empresa existente', false, (e as Error).message);
  }

  // 2b. getMappings (lote 171) enlaza solo lo que falta cuando la cuenta ya existe.
  await AccountingRepository.getMappings(B);
  const tras = await enlacesDeNomina(db, B);
  ok('getMappings engancha exactamente las tres que ya existen, a la suya, y nada a 2.1.03-2.1.05',
    JSON.stringify(tras.map((x) => `${x.clave}=${x.code}`).sort()) === JSON.stringify([
      'payroll_employer_tss_expense=6.1.01.02', 'payroll_other_deductions=2.1.01.02', 'payroll_salaries_expense=6.1.01.01']),
    tras.map((x) => `${x.clave}=${x.code}`).join(' '));

  // 2c. El guion despues de getMappings, y otra vez: idempotente.
  const primera = await db.transaction((tx) => AccountingRepository.completarCuentasDelSistema(B, tx));
  const enl1 = await enlacesDeNomina(db, B);
  const [cuenta1] = await filas(db, sql`SELECT (SELECT count(*) FROM chart_of_accounts WHERE company_id = ${B}::uuid)::int AS c,
    (SELECT count(*) FROM accounting_mappings WHERE company_id = ${B}::uuid)::int AS m`);
  ok('tras getMappings, completar crea las cinco que faltan y deja las ocho bien',
    primera.filter((p) => p.accion === 'crear_y_enlazar').length === 5 && revisarEnlaces(enl1, VIEJO_D7).length === 0 && enl1.length === 8,
    revisarEnlaces(enl1, VIEJO_D7).join('; '));
  const segunda = await db.transaction((tx) => AccountingRepository.completarCuentasDelSistema(B, tx));
  const [cuenta2] = await filas(db, sql`SELECT (SELECT count(*) FROM chart_of_accounts WHERE company_id = ${B}::uuid)::int AS c,
    (SELECT count(*) FROM accounting_mappings WHERE company_id = ${B}::uuid)::int AS m`);
  ok('completar otra vez no hace nada: ni una cuenta ni un enlace mas (idempotente)',
    enl1.length === 8 && segunda.every((p) => p.accion === 'nada') && cuenta1.c === cuenta2.c && cuenta1.m === cuenta2.m,
    `${cuenta1.c}/${cuenta1.m} -> ${cuenta2.c}/${cuenta2.m}`);
  ok('  y al final los saldos siguen donde estaban',
    enl1.length === 8 && JSON.stringify(JSON.parse(await saldos(db, B)).filter((f: Fila) => !NUEVAS.includes(String(f.code)))) === saldosAntes);

  console.log(`\n${fallos === 0 ? `TODO CORRECTO (${total})` : `${fallos} FALLA(S) de ${total}`}`);
  setTimeout(() => process.exit(fallos === 0 ? 0 : 1), 300);
}

main().catch((e) => { console.error(e); setTimeout(() => process.exit(1), 300); });
