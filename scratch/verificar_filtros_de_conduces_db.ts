/**
 * Lote 245 (INTEGRACION, base desechable) -- los filtros de la lista de
 * conduces, contra una base de verdad.
 *
 * Lo que no se ve leyendo: que la base filtre lo que se pide, que los dos
 * extremos del rango entren, que el TOTAL sea el de lo filtrado (y no el de
 * todos), y que el filtro no se salte ni la empresa ni el modo.
 *
 *   powershell -ExecutionPolicy Bypass -File scratch\bancos_db\base_desechable.ps1 -Accion correr -Bancos verificar_filtros_de_conduces_db.ts
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { DeliveryRepository } from '../src/repositories/deliveryRepository';

const A = '11111111-1111-1111-1111-111111111111';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const CLIENTE = 'ffffffff-0000-0000-0000-00000000d245';
const ALM = 'cccccccc-0000-0000-0000-000000000001';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
type Fila = Record<string, unknown>;
const q = async (s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as Fila[];

/** numero, estado, dia de entrega, modo, borrado */
const CONDUCES: Array<[string, string, string, 'PRODUCCION' | 'PRUEBA', boolean]> = [
  ['C-01', 'draft', '2026-09-01', 'PRODUCCION', false],
  ['C-02', 'approved', '2026-09-01', 'PRODUCCION', false],
  ['C-03', 'approved', '2026-09-15', 'PRODUCCION', false],
  ['C-04', 'approved', '2026-09-30', 'PRODUCCION', false],
  ['C-05', 'voided', '2026-09-30', 'PRODUCCION', false],
  ['C-06', 'draft', '2026-10-01', 'PRODUCCION', false],
  ['C-07', 'approved', '2026-08-31', 'PRODUCCION', false],
  ['C-08', 'approved', '2026-09-15', 'PRUEBA', false],     // otro modo
  ['C-09', 'approved', '2026-09-15', 'PRODUCCION', true],  // borrado
];

async function sembrar() {
  await limpiarTodo();
  await db.execute(sql`DELETE FROM customers WHERE id = ${CLIENTE}::uuid`);
  await db.execute(sql`INSERT INTO customers (id, company_id, name) VALUES (${CLIENTE}::uuid, ${A}::uuid, 'Cliente 245')`);
  const [f] = await q(sql`
    INSERT INTO invoices (company_id, modo, user_id, customer_id, warehouse_id, ncf, ecf_type, total, codigo_factura, status)
    VALUES (${A}::uuid, 'PRODUCCION', ${USER}::uuid, ${CLIENTE}::uuid, ${ALM}::uuid, 'E310000245001', '31', 1000, 'FAC-245-1', 'accepted')
    RETURNING id`);
  for (const [numero, estado, dia, modo, borrado] of CONDUCES) {
    await db.execute(sql`
      INSERT INTO delivery_notes (company_id, modo, invoice_id, user_id, delivery_number, status, delivery_date, deleted_at)
      VALUES (${A}::uuid, ${modo}::environment_mode, ${f.id as string}::uuid, ${USER}::uuid, ${numero}, ${estado}, ${dia}::date, ${borrado ? sql`now()` : sql`NULL`})`);
  }
}

const ETIQUETAS = ['sin filtros salen los siete vivos de PRODUCCION', 'por estado: solo los despachados (4), y el total es 4',
  'por rango: septiembre entero, con el dia 1 y el dia 30 DENTRO (5)', 'estado y rango a la vez: los despachados de septiembre (3)',
  'solo "desde" o solo "hasta" tambien filtran', 'un rango sin conduces da una lista vacia y total 0',
  'el total y las paginas son los de lo filtrado, no los de todos', 'el filtro no se salta el modo ni resucita un borrado'];

async function main() {
  await sembrar();
  //  Precondicion (vale en los dos estados): la siembra esta, y el listado sin filtros la ve.
  const base = await DeliveryRepository.list(A, 'PRODUCCION', 1, 50);
  if (base.meta.total !== 7) throw new Error(`Precondicion: se esperaban 7 conduces vivos en PRODUCCION, hay ${base.meta.total}`);

  console.log('\nLos filtros de la lista de conduces, contra la base\n');
  type Lista = (f: object, pagina?: number, porPagina?: number) => Promise<{ numeros: string; total: number; paginas: number }>;
  const lista: Lista = async (f, pagina = 1, porPagina = 50) => {
    const r = await (DeliveryRepository.list as (...a: unknown[]) => Promise<{ data: Fila[]; meta: { total: number; total_pages: number } }>)(A, 'PRODUCCION', pagina, porPagina, f);
    return { numeros: r.data.map((d) => String(d.deliveryNumber)).sort().join(','), total: r.meta.total, paginas: r.meta.total_pages };
  };
  const intenta = async (t: string, f: () => Promise<[boolean, string]>) => {
    try { const [c, d] = await f(); ok(t, c, d); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); }
  };

  //  ETIQUETAS[0] es la precondicion de arriba: cierta antes y despues, no cuenta como comprobacion.
  console.log(`  inv   ${ETIQUETAS[0]}`);
  await intenta(ETIQUETAS[1], async () => { const r = await lista({ estado: 'approved' }); return [r.numeros === 'C-02,C-03,C-04,C-07' && r.total === 4, `${r.numeros} (total ${r.total})`]; });
  await intenta(ETIQUETAS[2], async () => { const r = await lista({ desde: '2026-09-01', hasta: '2026-09-30' }); return [r.numeros === 'C-01,C-02,C-03,C-04,C-05' && r.total === 5, `${r.numeros} (total ${r.total})`]; });
  await intenta(ETIQUETAS[3], async () => { const r = await lista({ estado: 'approved', desde: '2026-09-01', hasta: '2026-09-30' }); return [r.numeros === 'C-02,C-03,C-04' && r.total === 3, `${r.numeros} (total ${r.total})`]; });
  await intenta(ETIQUETAS[4], async () => {
    const d = await lista({ desde: '2026-09-30' }); const h = await lista({ hasta: '2026-09-01' });
    return [d.numeros === 'C-04,C-05,C-06' && h.numeros === 'C-01,C-02,C-07', `desde: ${d.numeros} ; hasta: ${h.numeros}`];
  });
  await intenta(ETIQUETAS[5], async () => { const r = await lista({ estado: 'voided', desde: '2026-10-01', hasta: '2026-10-31' }); return [r.numeros === '' && r.total === 0, `${r.numeros} (total ${r.total})`]; });
  await intenta(ETIQUETAS[6], async () => {
    const p1 = await lista({ estado: 'approved' }, 1, 3); const p2 = await lista({ estado: 'approved' }, 2, 3);
    return [p1.total === 4 && p1.paginas === 2 && p1.numeros.split(',').length === 3 && p2.numeros.split(',').length === 1, `pag 1: ${p1.numeros} ; pag 2: ${p2.numeros} ; paginas ${p1.paginas}`];
  });
  await intenta(ETIQUETAS[7], async () => { const r = await lista({ estado: 'approved', desde: '2026-09-15', hasta: '2026-09-15' }); return [r.numeros === 'C-03' && r.total === 1, `${r.numeros} (total ${r.total})`]; });

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
