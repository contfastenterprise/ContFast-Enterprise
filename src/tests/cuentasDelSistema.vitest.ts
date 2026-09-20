/**
 * Lote 165 -- las claves de cuenta que busca el codigo y las que siembra el
 * catalogo no pueden volver a separarse.
 *
 * Estaban separadas: el sembrador traia 9 claves y compras y facturas pedian 7
 * mas, con un codigo "por defecto" escrito en cada llamada que no existia en
 * el catalogo sembrado (o era una cuenta de agrupacion). Cuatro empresas no
 * podian registrar una compra con ITBIS. Esta guarda recorre `src/` y falla si
 * alguna llamada pide una clave que no esta en `CUENTAS_DEL_SISTEMA`, o con un
 * codigo por defecto distinto del de la tabla, o si el sembrador no crea una
 * cuenta de la tabla.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { CUENTAS_DEL_SISTEMA, planParaCompletar, type CuentaExistente } from '@/services/accounting/cuentasDelSistema';

const RAIZ = join(__dirname, '..', '..');
const SRC = join(RAIZ, 'src');

function ficheros(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== 'tests') ficheros(p, acc); }
    else if (/\.tsx?$/.test(e)) acc.push(p);
  }
  return acc;
}

const tabla = new Map(CUENTAS_DEL_SISTEMA.map((c) => [c.clave, c.codigo]));

describe('lote 165 · cuentas del sistema', () => {
  const llamadas: { donde: string; clave: string; codigo: string }[] = [];
  for (const f of ficheros(SRC)) {
    const t = readFileSync(f, 'utf8');
    for (const m of t.matchAll(/resolverCuentaPorMapeo\(\s*[\w.]+,\s*[\w.]+,\s*'([a-z_]+)',\s*'([0-9.]+)'/g)) {
      llamadas.push({ donde: `${relative(RAIZ, f)}`, clave: m[1], codigo: m[2] });
    }
  }

  it('el codigo busca cuentas (la guarda ve las llamadas)', () => {
    expect(llamadas.length).toBeGreaterThan(20);
  });

  it('toda clave que busca el codigo esta en la tabla, con el mismo codigo por defecto', () => {
    const malas = llamadas
      .filter((l) => tabla.get(l.clave) !== l.codigo)
      .map((l) => `${l.donde}: '${l.clave}' con '${l.codigo}' (la tabla dice ${tabla.get(l.clave) ?? 'NADA'})`);
    expect(malas, malas.join('\n')).toEqual([]);
  });

  it('el sembrador crea todas las cuentas de la tabla y enlaza todas sus claves desde ella', () => {
    const repo = readFileSync(join(SRC, 'repositories', 'accountingRepository.ts'), 'utf8');
    const sembrador = repo.slice(repo.indexOf('public static async seedDefaultChartOfAccounts('));
    const faltan = CUENTAS_DEL_SISTEMA.filter((c) => !sembrador.includes(`code: '${c.codigo}', name: '${c.nombre}'`))
      .map((c) => `${c.codigo} ${c.nombre}`);
    expect(faltan, `el sembrador no crea: ${faltan.join(', ')}`).toEqual([]);
    expect(sembrador).toMatch(/const defaultMappings = CUENTAS_DEL_SISTEMA\.map\(/);
  });

  describe('el plan para completar una empresa que ya existe', () => {
    // Una empresa sembrada ANTES del lote 165: el catalogo estandar de entonces.
    const base: CuentaExistente[] = [
      ['1.1.01.01', 'asset'], ['1.1.01.02', 'asset'], ['1.1.02.01', 'asset'], ['1.1.03.01', 'asset'],
      ['1.1.04.01', 'asset'], ['1.1.04.02', 'asset'], ['2.1.01.01', 'liability'], ['2.1.02.01', 'liability'],
      ['2.1.02.02', 'liability'], ['2.1.02.03', 'liability'], ['4.1.01', 'revenue'], ['5.1.01', 'expense'],
    ].map(([code, type]) => ({ id: `id-${code}`, code, type, isTransactional: true, status: 'active', renglones: 0 }));
    // `2.1.01` esta desde el lote 171, que anade 2.1.01.03 y necesita su padre.
    // No es un apaño para la prueba: el sembrador crea 2.1.01 desde siempre, y
    // medido el 2026-09-19 las SEIS empresas la tienen (pasivo, acreedora, de
    // agrupacion). El ejemplo estaba incompleto respecto a la realidad.
    const grupos: CuentaExistente[] = [['1.1.04', 'asset'], ['2.1.01', 'liability'], ['5.1', 'expense']]
      .map(([code, type]) => ({ id: `id-${code}`, code, type, isTransactional: false, status: 'active', renglones: 0 }));
    const clavesViejas = new Set(['sales_revenue', 'accounts_receivable', 'cash', 'bank', 'itbis_sales',
      'itbis_purchases', 'cost_of_goods_sold', 'inventory', 'supplier_payable']);

    it('empresa sin cuentas antiguas: enlaza las estandar y crea las que faltan', () => {
      const plan = planParaCompletar([...base, ...grupos], clavesViejas);
      const enlaza = Object.fromEntries(plan.filter((p) => p.accion === 'enlazar').map((p) => [p.clave, (p as { codigo: string }).codigo]));
      expect(enlaza).toEqual({
        purchase_itbis_paid: '1.1.04.01', isr_retention_receivable: '1.1.04.02',
        itbis_withholding_payable: '2.1.02.02', isr_withholding_payable: '2.1.02.03',
      });
      const crea = plan.filter((p) => p.accion === 'crear_y_enlazar').map((p) => (p as { cuenta: { codigo: string } }).cuenta.codigo).sort();
      // 2.1.01.03 la anade el lote 171 (tarjeta de credito).
      expect(crea).toEqual(['1.1.04.03', '1.1.04.04', '2.1.01.03', '5.1.02']);
    });

    it('como Latin Doors: una cuenta antigua CON movimientos se respeta; sin movimientos, no', () => {
      const antiguas: CuentaExistente[] = [
        { id: 'id-1.1.08', code: '1.1.08', type: 'asset', isTransactional: true, status: 'active', renglones: 90 },
        { id: 'id-2.1.04', code: '2.1.04', type: 'liability', isTransactional: true, status: 'active', renglones: 1 },
        { id: 'id-2.1.05', code: '2.1.05', type: 'liability', isTransactional: true, status: 'active', renglones: 0 },
      ];
      const plan = planParaCompletar([...base, ...grupos, ...antiguas], clavesViejas);
      const a = (clave: string) => plan.find((p) => 'clave' in p && p.clave === clave) as { codigo?: string } | undefined;
      expect(a('purchase_itbis_paid')?.codigo).toBe('1.1.08');
      expect(a('isr_withholding_payable')?.codigo).toBe('2.1.04');
      expect(a('itbis_withholding_payable')?.codigo).toBe('2.1.02.02'); // la antigua sin movimientos no manda
    });

    it('no toca lo que ya esta enlazado', () => {
      const todas = new Set(CUENTAS_DEL_SISTEMA.map((c) => c.clave));
      expect(planParaCompletar([...base, ...grupos], todas).every((p) => p.accion === 'nada')).toBe(true);
    });

    it('si la estandar existe pero es de agrupacion, o falta el padre, se niega en vez de adivinar', () => {
      const conGrupo = [...base.filter((c) => c.code !== '1.1.04.02'),
        { id: 'x', code: '1.1.04.02', type: 'asset', isTransactional: false, status: 'active', renglones: 0 }, ...grupos];
      expect(() => planParaCompletar(conGrupo, clavesViejas)).toThrow(/1\.1\.04\.02 existe pero no sirve/);
      expect(() => planParaCompletar(base, clavesViejas)).toThrow(/falta su cuenta padre/);
    });
  });
});
