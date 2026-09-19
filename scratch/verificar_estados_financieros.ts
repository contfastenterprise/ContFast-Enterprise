/**
 * Lote 164 -- los totales del balance general y del estado de resultados.
 *
 * EL HUECO
 * --------
 * `getFinancials` sumaba solo las cuentas de NIVEL 1 y la balanza da cada
 * cuenta con lo suyo: con los asientos en cuentas transaccionales (obligatorio
 * desde el lote 136) los totales salian en cero. Latin Doors 2026 (medido el
 * 2026-09-19): "Total ingresos 0,00" con 3.521.728,32 asentados. Y debajo: el
 * signo salia de la naturaleza de cada cuenta (tres pasivos de ITBIS/ISR estan
 * marcados deudores y salian negativos), y el estado "del periodo" usaba el
 * saldo acumulado.
 *
 * LO QUE SE COMPRUEBA
 * -------------------
 * 1. `armarEstadosFinancieros`, EJECUTANDOLA sobre un catalogo con varios
 *    niveles, una cuenta correctora, un pasivo mal marcado y movimientos antes
 *    y dentro del rango.
 * 2. `getFinancials` la usa y la balanza le da el `parentId`.
 * 3. La pantalla: sangria por nivel, la etiqueta del resultado y el aviso de
 *    descuadre.
 *
 * Solo codigo. Contra una base: `verificar_contabilidad.ts` (deuda de bancos
 * de integracion), que pedia estas cifras y fallaba.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { fuente, bloque } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const RAIZ = join(__dirname, '..');
const leer = (r: string) => (existsSync(join(RAIZ, r)) ? fuente(r) : '');

type Mod = typeof import('../src/services/accounting/estadosFinancieros');
type Fila = Parameters<Mod['armarEstadosFinancieros']>[0][number];

// Un catalogo de prueba. `antes` y `rango` son debe/haber; el saldo inicial se
// construye como lo hace la balanza: con el signo de la NATURALEZA de la cuenta.
const cuenta = (id: string, code: string, type: string, nature: string, level: number, parentId: string | null,
  antes: [number, number] = [0, 0], rango: [number, number] = [0, 0]): Fila => ({
  id, code, name: id, type, nature, level, parentId,
  beginningBalance: nature === 'credit' ? antes[1] - antes[0] : antes[0] - antes[1],
  debit: rango[0], credit: rango[1],
});

const CATALOGO: Fila[] = [
  cuenta('ACT', '1', 'asset', 'debit', 1, null),
  cuenta('ACT-CTE', '1.1', 'asset', 'debit', 2, 'ACT'),
  cuenta('EFECTIVO', '1.1.01', 'asset', 'debit', 3, 'ACT-CTE'),
  cuenta('CAJA', '1.1.01.01', 'asset', 'debit', 4, 'EFECTIVO', [1300, 0], [5000, 700]),       // 5.600
  cuenta('BANCO', '1.1.01.02', 'asset', 'debit', 4, 'EFECTIVO', [0, 0], [2000, 0]),           // 2.000
  cuenta('EQUIPO', '1.2.01', 'asset', 'debit', 3, 'ACT', [0, 0], [3000, 0]),                   // 3.000
  cuenta('DEPREC', '1.2.02', 'asset', 'credit', 3, 'ACT', [0, 0], [0, 500]),                   // -500 (correctora)
  cuenta('PAS', '2', 'liability', 'credit', 1, null),
  cuenta('CXP', '2.1.01.01', 'liability', 'credit', 4, 'PAS', [0, 0], [0, 3200]),             // 3.200
  cuenta('ITBIS', '2.1.03', 'liability', 'debit', 1, null, [0, 0], [100, 1100]),              // 1.000 (mal marcada)
  cuenta('CAP', '3.1.01', 'equity', 'credit', 3, null, [0, 1000], [0, 0]),                    // 1.000
  cuenta('ING', '4', 'revenue', 'credit', 1, null),
  cuenta('VENTAS', '4.1.01', 'revenue', 'credit', 3, 'ING', [0, 0], [0, 9000]),               // 9.000 en el rango
  cuenta('SERV', '4.1.02', 'revenue', 'credit', 3, 'ING', [0, 400], [0, 600]),                // 400 antes + 600 rango
  cuenta('GAS', '5', 'expense', 'debit', 1, null),
  cuenta('COSTO', '5.1.01', 'expense', 'debit', 3, 'GAS', [100, 0], [5000, 0]),               // 100 antes + 5.000 rango
];
// Cuadre del catalogo (debe = haber, antes y dentro del rango):
//   antes: caja 1.300 + costo 100 = 1.400 | capital 1.000 + servicios 400 = 1.400
//   rango: 5.000 + 2.000 + 3.000 + 100 + 5.000 = 15.100 | 700 + 500 + 3.200 + 1.100 + 9.000 + 600 = 15.100
// Balance: activos 10.100 = pasivos 4.200 + capital 1.000 + resultado ACUMULADO 4.900
// (ingresos 10.000 - gastos 5.100). El del rango es otro: 9.600 - 5.000 = 4.600.

async function main() {
  let m: Mod | null = null;
  try { m = await import('../src/services/accounting/estadosFinancieros'); } catch { m = null; }
  const e = m ? m.armarEstadosFinancieros(CATALOGO) : null;
  const fila = (id: string, lado: 'b' | 'r') => (lado === 'b' ? e?.balanceSheet.rows : e?.incomeStatement.rows)?.find((f) => f.id === id);
  const bt = e?.balanceSheet.totals;
  const rt = e?.incomeStatement.totals;

  console.log('\n1) La cuenta, ejecutandola\n');
  // Activos: 5.600 + 2.000 + 3.000 - 500 = 10.100
  ok('los activos suman TODAS sus cuentas, sin mirar el nivel (10.100)', bt?.assets === 10100, String(bt?.assets));
  ok('la cuenta correctora (depreciacion) resta', fila('DEPREC', 'b')?.endingBalance === -500, String(fila('DEPREC', 'b')?.endingBalance));
  ok('un pasivo marcado DEUDOR sale con el signo de su tipo: +1.000, no -1.000',
    fila('ITBIS', 'b')?.endingBalance === 1000, String(fila('ITBIS', 'b')?.endingBalance));
  ok('pasivos: 3.200 + 1.000 = 4.200', bt?.liabilities === 4200, String(bt?.liabilities));
  ok('capital 1.000', bt?.equity === 1000, String(bt?.equity));
  ok('estado de resultados: SOLO el rango (ingresos 9.600, gastos 5.000)', rt?.revenues === 9600 && rt?.expenses === 5000, JSON.stringify(rt));
  ok('  utilidad del rango 4.600', rt?.netIncome === 4600, String(rt?.netIncome));
  ok('balance: el resultado es el ACUMULADO, no el del rango (10.000 - 5.100 = 4.900, no 4.600)',
    bt?.netIncome === 4900, String(bt?.netIncome));
  ok('y el balance cuadra: diferencia 0', bt?.diferencia === 0, String(bt?.diferencia));
  ok('cada grupo suma sus hijas: 1.1.01 = caja + banco = 7.600', fila('EFECTIVO', 'b')?.endingBalance === 7600, String(fila('EFECTIVO', 'b')?.endingBalance));
  ok('  y la raiz 1 = todo el activo (10.100)', fila('ACT', 'b')?.endingBalance === 10100, String(fila('ACT', 'b')?.endingBalance));
  ok('  el grupo de ingresos 4 = 9.600 (del rango)', fila('ING', 'r')?.endingBalance === 9600, String(fila('ING', 'r')?.endingBalance));
  ok('  y cada fila dice tambien lo suyo (el grupo 1.1.01 no tiene nada propio)', fila('EFECTIVO', 'b')?.propio === 0 && fila('CAJA', 'b')?.propio === 5600);
  ok('el balance lleva activos, pasivos y capital; los resultados, ingresos y gastos',
    !!e && e.balanceSheet.rows.every((f) => ['asset', 'liability', 'equity'].includes(f.type))
    && e.incomeStatement.rows.every((f) => ['revenue', 'expense'].includes(f.type)));

  if (m) {
    // Un catalogo que NO cuadra: la diferencia se dice.
    const roto = m.armarEstadosFinancieros([cuenta('X', '1.1.01.01', 'asset', 'debit', 4, null, [0, 0], [100, 0])]);
    ok('un libro descuadrado da diferencia distinta de 0 (100)', roto.balanceSheet.totals.diferencia === 100, String(roto.balanceSheet.totals.diferencia));
    // En centavos: 0,1 + 0,2 en dos cuentas frente a 0,3.
    const cent = m.armarEstadosFinancieros([
      cuenta('A1', '1.1', 'asset', 'debit', 2, null, [0, 0], [0.1, 0]),
      cuenta('A2', '1.2', 'asset', 'debit', 2, null, [0, 0], [0.2, 0]),
      cuenta('P', '2.1', 'liability', 'credit', 2, null, [0, 0], [0, 0.3]),
    ]);
    ok('en centavos: 0,10 + 0,20 de activo cuadran con 0,30 de pasivo', cent.balanceSheet.totals.assets === 0.3 && cent.balanceSheet.totals.diferencia === 0,
      JSON.stringify(cent.balanceSheet.totals));
    // El caso anterior arrastra el mismo error por los dos lados y un mutante
    // sin redondeo sobrevivio. El ruido real nace en la balanza, que calcula
    // el saldo inicial RESTANDO: 1000,1 - 999,9 = 0,20000000000004547.
    const ruido = m.armarEstadosFinancieros([
      { ...cuenta('A', '1.1', 'asset', 'debit', 2, null), beginningBalance: 1000.1 - 999.9 },
      cuenta('P', '2.1', 'liability', 'credit', 2, null, [0, 0.2]),
    ]);
    ok('en centavos: un saldo inicial con ruido de coma flotante (1000,1 - 999,9) cuadra con 0,20',
      ruido.balanceSheet.totals.diferencia === 0 && ruido.balanceSheet.totals.assets === 0.2, JSON.stringify(ruido.balanceSheet.totals));
    // Un ciclo en el catalogo no cuelga el calculo.
    const ciclo = m.armarEstadosFinancieros([
      cuenta('C1', '1', 'asset', 'debit', 1, 'C2', [0, 0], [10, 0]),
      cuenta('C2', '1.1', 'asset', 'debit', 2, 'C1', [0, 0], [5, 0]),
    ]);
    ok('un ciclo padre-hija en el catalogo no cuelga ni duplica el total', ciclo.balanceSheet.totals.assets === 15, String(ciclo.balanceSheet.totals.assets));
  } else {
    ok('un libro descuadrado da diferencia distinta de 0 (100)', false, 'sin modulo');
    ok('en centavos: 0,10 + 0,20 de activo cuadran con 0,30 de pasivo', false, 'sin modulo');
    ok('en centavos: un saldo inicial con ruido de coma flotante (1000,1 - 999,9) cuadra con 0,20', false, 'sin modulo');
    ok('un ciclo padre-hija en el catalogo no cuelga ni duplica el total', false, 'sin modulo');
  }

  console.log('\n2) El repositorio\n');
  const REPO = leer('src/repositories/accountingRepository.ts');
  const fin = bloque(REPO, 'static async getFinancials(');
  ok('getFinancials arma los estados con la funcion', /return armarEstadosFinancieros\(trialBalance\);/.test(fin)
    && /import \{ armarEstadosFinancieros \} from '@\/services\/accounting\/estadosFinancieros'/.test(REPO));
  ok('  y ya no suma solo el nivel 1', !/row\.level === 1/.test(fin) && !/calculateHierarchyTotal/.test(fin));
  ok('la balanza da el padre de cada cuenta', /parentId: acc\.parentId,/.test(bloque(REPO, 'static async getTrialBalance(')));

  console.log('\n3) La pantalla\n');
  const PAG = leer('src/app/dashboard/accounting/page.tsx');
  const resultados = PAG.slice(PAG.indexOf('Estado de Resultados</h3>'), PAG.indexOf('UTILIDAD NETA DEL PERIODO'));
  ok('las filas de resultados llevan sangria por nivel (grupo e hija no parecen contarse dos veces)',
    (resultados.match(/row\.level === 2 && "pl-4", row\.level === 3 && "pl-8", row\.level >= 4 && "pl-12"/g) || []).length === 2);
  ok('el resultado del balance dice que es acumulado', /Resultados Acumulados \(sin cierre\)/.test(PAG) && !/Utilidad del Periodo Actual/.test(PAG));
  ok('si el balance no cuadra, se dice', /financialsData\.balanceSheet\.totals\.diferencia/.test(PAG) && /El balance no cuadra/.test(PAG));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
