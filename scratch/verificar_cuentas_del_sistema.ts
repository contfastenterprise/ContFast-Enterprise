/**
 * Lote 165 -- las cuentas que el sistema busca existen en toda empresa.
 *
 * EL HUECO
 * --------
 * El sembrador traia 9 claves de cuenta; compras y facturas pedian 7 mas, con
 * un codigo por defecto que no existia en el catalogo sembrado (1.1.08, 2.1.04,
 * 2.1.05, 1.1.05, 5.1.02) o era una cuenta de agrupacion (1.1.03 Inventarios,
 * 1.1.04). Cuatro empresas no podian registrar una compra con ITBIS. Lo
 * destapo el banco de integracion `verificar_modo_obligatorio.ts` en la base
 * desechable, sembrada con el mismo sembrador que una empresa nueva.
 *
 * LO QUE SE COMPRUEBA
 * -------------------
 * 1. El plan (`planParaCompletar`), EJECUTANDOLO: empresa nueva, empresa como
 *    Latin Doors (cuentas antiguas en uso), casos que se niegan.
 * 2. El codigo: el sembrador y `getMappings` salen de la tabla; los codigos por
 *    defecto de las llamadas son los de la tabla; `completarCuentasDelSistema`
 *    cuenta bien los renglones (la columna calificada).
 *
 * Solo codigo. La guarda permanente de que tabla y llamadas no se separen esta
 * en `src/tests/cuentasDelSistema.vitest.ts`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const RAIZ = join(__dirname, '..');
const leer = (r: string) => (existsSync(join(RAIZ, r)) ? fuente(r) : '');
type Mod = typeof import('../src/services/accounting/cuentasDelSistema');
type Cta = Parameters<Mod['planParaCompletar']>[0][number];

const cta = (code: string, type: string, trans = true, renglones = 0): Cta =>
  ({ id: `id-${code}`, code, type, isTransactional: trans, status: 'active', renglones });
const BASE: Cta[] = [
  // `2.1.01` esta desde el lote 171 (padre de la cuenta de tarjeta). No es un
  // apaño: el sembrador la crea desde siempre y las SEIS empresas la tienen
  // (medido el 2026-09-19). El ejemplo estaba incompleto respecto a la realidad.
  cta('1.1', 'asset', false), cta('1.1.04', 'asset', false), cta('2.1.01', 'liability', false),
  cta('2.1.02', 'liability', false), cta('5.1', 'expense', false),
  cta('1.1.01.01', 'asset'), cta('1.1.01.02', 'asset'), cta('1.1.02.01', 'asset'), cta('1.1.03.01', 'asset'),
  cta('1.1.04.01', 'asset'), cta('1.1.04.02', 'asset'), cta('2.1.01.01', 'liability'), cta('2.1.02.01', 'liability'),
  cta('2.1.02.02', 'liability'), cta('2.1.02.03', 'liability'), cta('4.1.01', 'revenue'), cta('5.1.01', 'expense'),
];
const VIEJAS = new Set(['sales_revenue', 'accounts_receivable', 'cash', 'bank', 'itbis_sales', 'itbis_purchases',
  'cost_of_goods_sold', 'inventory', 'supplier_payable']);

async function main() {
  let m: Mod | null = null;
  try { m = await import('../src/services/accounting/cuentasDelSistema'); } catch { m = null; }

  console.log('\n1) El plan, ejecutandolo\n');
  const destino = (plan: ReturnType<Mod['planParaCompletar']>, clave: string) => {
    for (const p of plan) {
      if (p.accion === 'enlazar' && p.clave === clave) return p.codigo;
      if (p.accion === 'crear_y_enlazar' && p.claves.includes(clave)) return `nueva ${p.cuenta.codigo}`;
    }
    return undefined;
  };
  const nueva = m ? m.planParaCompletar(BASE, VIEJAS) : null;
  ok('empresa sembrada antes del lote: el ITBIS de compras va a la 1.1.04.01 que ya tenia', !!nueva && destino(nueva, 'purchase_itbis_paid') === '1.1.04.01');
  ok('  las retenciones por pagar, a las estandar 2.1.02.02 (ITBIS) y 2.1.02.03 (ISR)',
    !!nueva && destino(nueva, 'itbis_withholding_payable') === '2.1.02.02' && destino(nueva, 'isr_withholding_payable') === '2.1.02.03');
  ok('  el ISR que retiene el cliente, a Anticipos de ISR (1.1.04.02), no a Inventarios',
    !!nueva && destino(nueva, 'isr_retention_receivable') === '1.1.04.02');
  ok('  y crea las tres que faltan: 1.1.04.03, 1.1.04.04 y 5.1.02',
    !!nueva && destino(nueva, 'itbis_retention_receivable') === 'nueva 1.1.04.03' && destino(nueva, 'other_retention_receivable') === 'nueva 1.1.04.04'
    && destino(nueva, 'purchase_other_taxes') === 'nueva 5.1.02');
  ok('  no toca las 9 claves que ya estaban', !!nueva && [...VIEJAS].every((k) => nueva.some((p) => p.accion === 'nada' && p.clave === k)));

  const ld = m ? m.planParaCompletar([...BASE, cta('1.1.08', 'asset', true, 90), cta('2.1.04', 'liability', true, 1),
    cta('2.1.05', 'liability', true, 2), cta('5.1.02', 'expense', true, 3)], VIEJAS) : null;
  ok('como Latin Doors: el ITBIS de compras se queda en la 1.1.08 que lleva sus movimientos', !!ld && destino(ld, 'purchase_itbis_paid') === '1.1.08');
  ok('  y las retenciones en 2.1.04 y 2.1.05 (no se mueve ningun saldo)',
    !!ld && destino(ld, 'isr_withholding_payable') === '2.1.04' && destino(ld, 'itbis_withholding_payable') === '2.1.05');
  ok('  la 5.1.02 que ya tiene se usa, no se crea otra', !!ld && destino(ld, 'purchase_other_taxes') === '5.1.02');
  const sinUso = m ? m.planParaCompletar([...BASE, cta('1.1.08', 'asset', true, 0)], VIEJAS) : null;
  ok('una cuenta antigua SIN movimientos no manda: va la estandar', !!sinUso && destino(sinUso, 'purchase_itbis_paid') === '1.1.04.01');
  const niega = (cat: Cta[]) => { if (!m) return false; try { m.planParaCompletar(cat, VIEJAS); return false; } catch { return true; } };
  ok('si la estandar es de agrupacion, se niega', niega([...BASE.filter((c) => c.code !== '1.1.04.02'), cta('1.1.04.02', 'asset', false)]));
  ok('si falta el padre para crear, se niega', niega(BASE.filter((c) => c.code !== '1.1.04')));
  // Un mutante que solo miraba que el padre EXISTIERA sobrevivio: tambien
  // tiene que ser de agrupacion y del mismo tipo.
  ok('si el padre existe pero es transaccional, se niega', niega([...BASE.filter((c) => c.code !== '1.1.04'), cta('1.1.04', 'asset', true)]));
  ok('si el padre es de otro tipo, se niega', niega([...BASE.filter((c) => c.code !== '5.1'), cta('5.1', 'revenue', false)]));
  ok('si la estandar es de otro tipo, se niega', niega([...BASE.filter((c) => c.code !== '2.1.02.02'), cta('2.1.02.02', 'asset')]));

  console.log('\n2) El codigo\n');
  const REPO = leer('src/repositories/accountingRepository.ts');
  const sembrador = REPO.slice(REPO.indexOf('public static async seedDefaultChartOfAccounts('));
  ok('el sembrador enlaza las claves desde la tabla', /const defaultMappings = CUENTAS_DEL_SISTEMA\.map\(\(c\) => \(\{ key: c\.clave, code: c\.codigo \}\)\);/.test(sembrador));
  ok('  y crea las tres cuentas nuevas',
    ["code: '1.1.04.03', name: 'ITBIS Retenido por Clientes'", "code: '1.1.04.04', name: 'Otras Retenciones por Clientes'",
      "code: '5.1.02', name: 'Otros Impuestos y Tasas'"].every((s) => sembrador.includes(s)));
  const getMappings = REPO.slice(REPO.indexOf('static async getMappings('), REPO.indexOf('// Auto-seed mappings'));
  ok('getMappings nunca enlaza por su cuenta una clave con cuenta antigua',
    /CUENTAS_DEL_SISTEMA\s*\.filter\(\(c\) => !\(c\.clave in CODIGOS_ANTIGUOS\)\)/.test(getMappings));
  const completar = REPO.slice(REPO.indexOf('public static async completarCuentasDelSistema('), REPO.indexOf('// REPORTS: LEDGER'));
  ok('completarCuentasDelSistema cuenta los renglones con la columna calificada',
    /jel\.account_id = "chart_of_accounts"\."id"/.test(completar) && !/jel\.account_id = \$\{chartOfAccounts\.id\}/.test(completar));
  ok('  y aplica el plan: enlaza, o crea bajo el padre y enlaza todas sus claves',
    /planParaCompletar\(/.test(completar) && /parentId: paso\.padreId/.test(completar) && /for \(const clave of paso\.claves\)/.test(completar));

  // Los codigos por defecto de cada llamada = los de la tabla.
  const tabla = m ? new Map(m.CUENTAS_DEL_SISTEMA.map((c) => [c.clave, c.codigo])) : new Map<string, string>();
  const llamadas: string[] = [];
  const recorrer = (d: string) => { for (const e of readdirSync(d)) { const p = join(d, e);
    if (statSync(p).isDirectory()) { if (e !== 'tests') recorrer(p); } else if (/\.tsx?$/.test(e)) {
      for (const x of readFileSync(p, 'utf8').matchAll(/resolverCuentaPorMapeo\(\s*[\w.]+,\s*[\w.]+,\s*'([a-z_]+)',\s*'([0-9.]+)'/g)) {
        if (tabla.get(x[1]) !== x[2]) llamadas.push(`${e}: ${x[1]} ${x[2]}`);
      } } } };
  recorrer(join(RAIZ, 'src'));
  ok('cada llamada busca su clave con el codigo de la tabla', tabla.size > 0 && llamadas.length === 0, llamadas.join(' | '));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
