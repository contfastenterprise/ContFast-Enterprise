/**
 * El codigo interno de factura: unicidad y carrera.
 *
 * QUE HABIA
 * ---------
 * Tres sitios generaban `codigo_factura` contando filas:
 *
 *     SELECT count(*) FROM invoices WHERE codigo_factura LIKE 'FAC-2026-%'
 *     -> nextNum = count + 1
 *
 * COUNT(*) no bloquea nada, y la columna no tenia restriccion de unicidad. Dos
 * facturas emitidas a la vez leian el mismo total y las dos escribian
 * FAC-2026-000123. En `invoices/draft` el conteo iba ademas FUERA de la
 * transaccion y sin filtrar `modo`, asi que un borrador de PRUEBA consumia un
 * numero del correlativo real.
 *
 * La prueba de la carrera necesita concurrencia de verdad: dos conexiones
 * distintas, cada una con su transaccion abierta a la vez. Con una sola
 * conexion las transacciones se serializan solas y el fallo no aparece.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { siguienteCodigoFactura, prefijoDe } from '../src/services/invoice/codigoFactura';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const USER_A = 'bbbbbbbb-0000-0000-0000-000000000001';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

async function limpiar() {
  await db.execute(sql`DELETE FROM invoice_sequences`);
  await db.execute(sql`DELETE FROM accounts_receivable`);
  await db.execute(sql`DELETE FROM invoices`);
}

async function main() {
  await limpiar();

  console.log('\n1) Prefijos: FAC, NC y ND son series distintas\n');
  ok('e-31 -> FAC', prefijoDe('31') === 'FAC');
  ok('e-34 (nota de credito) -> NC', prefijoDe('34') === 'NC');
  ok('e-33 (nota de debito) -> ND', prefijoDe('33') === 'ND');
  ok('sin tipo -> FAC', prefijoDe(undefined) === 'FAC');

  console.log('\n2) La numeracion avanza de uno en uno\n');
  const c1 = await siguienteCodigoFactura(db, A, 'PRODUCCION', '31', 2026);
  const c2 = await siguienteCodigoFactura(db, A, 'PRODUCCION', '31', 2026);
  const c3 = await siguienteCodigoFactura(db, A, 'PRODUCCION', '31', 2026);
  ok('arranca en 000001', c1 === 'FAC-2026-000001', c1);
  ok('sigue en 000002', c2 === 'FAC-2026-000002', c2);
  ok('y en 000003', c3 === 'FAC-2026-000003', c3);

  console.log('\n3) Cada serie lleva su cuenta\n');
  const nc = await siguienteCodigoFactura(db, A, 'PRODUCCION', '34', 2026);
  ok('la nota de credito empieza por su cuenta', nc === 'NC-2026-000001', nc);
  const otroAnio = await siguienteCodigoFactura(db, A, 'PRODUCCION', '31', 2027);
  ok('y cada anio tambien', otroAnio === 'FAC-2027-000001', otroAnio);

  console.log('\n4) Aislamiento: empresa y entorno\n');
  const enPrueba = await siguienteCodigoFactura(db, A, 'PRUEBA', '31', 2026);
  ok('PRUEBA no consume el correlativo real', enPrueba === 'FAC-2026-000001', enPrueba);
  const deB = await siguienteCodigoFactura(db, B, 'PRODUCCION', '31', 2026);
  ok('otra empresa tampoco', deB === 'FAC-2026-000001', deB);
  const siguienteReal = await siguienteCodigoFactura(db, A, 'PRODUCCION', '31', 2026);
  ok('el correlativo real sigue donde estaba', siguienteReal === 'FAC-2026-000004', siguienteReal);

  console.log('\n5) La carrera: dos transacciones a la vez, conexiones distintas\n');
  await limpiar();
  const url = process.env.DATABASE_URL!;
  const c = [postgres(url, { max: 1 }), postgres(url, { max: 1 })];
  try {
    // Las dos abren transaccion, las dos piden numero, y solo despues confirman.
    // Con el COUNT(*) de antes las dos se llevaban el 1.
    const pedir = (cx: postgres.Sql) => cx.begin(async (tx) => {
      const r = await tx`
        INSERT INTO invoice_sequences (company_id, modo, prefix, current_year, current_sequence)
        VALUES (${A}::uuid, 'PRODUCCION', 'FAC', 2026, 1)
        ON CONFLICT (company_id, prefix, current_year, modo)
        DO UPDATE SET current_sequence = invoice_sequences.current_sequence + 1
        RETURNING current_sequence`;
      await new Promise((r2) => setTimeout(r2, 120)); // mantiene la transaccion abierta
      return Number(r[0].current_sequence);
    });

    const [n1, n2] = await Promise.all([pedir(c[0]), pedir(c[1])]);
    ok('los dos numeros son distintos', n1 !== n2, `${n1} y ${n2}`);
    ok('y consecutivos', Math.abs(n1 - n2) === 1, `${n1} y ${n2}`);

    // Veinte a la vez, para que no sea casualidad.
    const cs = Array.from({ length: 20 }, () => postgres(url, { max: 1 }));
    try {
      const nums = await Promise.all(cs.map((cx) => pedir(cx)));
      ok('veinte simultaneas dan veinte numeros distintos',
        new Set(nums).size === 20, `unicos: ${new Set(nums).size}`);
      ok('sin huecos ni repetidos', Math.max(...nums) - Math.min(...nums) === 19,
        `de ${Math.min(...nums)} a ${Math.max(...nums)}`);
    } finally {
      await Promise.all(cs.map((cx) => cx.end()));
    }
  } finally {
    await Promise.all(c.map((cx) => cx.end()));
  }

  const inserta = (codigo: string, modo = 'PRODUCCION', empresa = A) => db.execute(sql`
    INSERT INTO invoices (company_id, modo, user_id, ncf, ecf_type, total, codigo_factura)
    VALUES (${empresa}::uuid, ${modo}, ${USER_A}::uuid, ${'E31' + Math.random().toString().slice(2, 12)},
            '31', 100, ${codigo})`);

  console.log('\n6) La base impide el duplicado, no solo el codigo\n');
  await limpiar();

  await inserta('FAC-2026-000001');
  let choco = false;
  try { await inserta('FAC-2026-000001'); } catch { choco = true; }
  ok('rechaza el mismo codigo en la misma empresa y entorno', choco);

  let okPrueba = true;
  try { await inserta('FAC-2026-000001', 'PRUEBA'); } catch { okPrueba = false; }
  ok('pero el mismo codigo en PRUEBA si entra', okPrueba);

  let okOtraEmpresa = true;
  try { await inserta('FAC-2026-000001', 'PRODUCCION', B); } catch { okOtraEmpresa = false; }
  ok('y en otra empresa tambien (la unicidad NO es global)', okOtraEmpresa);

  console.log('\n7) El trigger huerfano de la 0011 ya no existe\n');
  const trg = (await db.execute(sql`
    SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'trg_assign_codigo_factura'`)) as unknown as { n: number }[];
  ok('sin trigger', trg[0].n === 0);
  const fn = (await db.execute(sql`
    SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'obtener_siguiente_codigo_factura'`)) as unknown as { n: number }[];
  ok('sin la funcion que buscaba una tabla inexistente', fn[0].n === 0);

  console.log('\n8) La regresion: con el indice de la 0026 la segunda empresa no podia facturar\n');
  // (codigo_factura, modo) sin company_id. Como cada empresa arranca su
  // numeracion en FAC-AAAA-000001, la segunda que emitiera su primera factura
  // del anio chocaba contra la primera. Se reproduce y se deshace.
  await limpiar();
  await db.execute(sql`DROP INDEX IF EXISTS invoices_company_codigo_factura_modo_idx`);
  await db.execute(sql`CREATE UNIQUE INDEX invoices_codigo_factura_modo_idx ON invoices (codigo_factura, modo)`);
  await inserta('FAC-2026-000001');
  let bloqueada = false;
  try { await inserta('FAC-2026-000001', 'PRODUCCION', B); } catch { bloqueada = true; }
  ok('con el indice viejo, la empresa B queda bloqueada', bloqueada);

  await db.execute(sql`DROP INDEX IF EXISTS invoices_codigo_factura_modo_idx`);
  await db.execute(sql`CREATE UNIQUE INDEX invoices_company_codigo_factura_modo_idx ON invoices (company_id, codigo_factura, modo)`);
  await limpiar();
  await inserta('FAC-2026-000001');
  let libre = true;
  try { await inserta('FAC-2026-000001', 'PRODUCCION', B); } catch { libre = false; }
  ok('con el indice correcto, ya no', libre);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
