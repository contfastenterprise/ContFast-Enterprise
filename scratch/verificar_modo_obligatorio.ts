/**
 * `modo` deja de ser opcional en los tipos de entrada.
 *
 * QUE ERA ESTO
 * ------------
 * La columna `modo` tiene DEFAULT 'PRODUCCION': por eso omitirla en una
 * consulta nunca falla, simplemente escribe en el entorno real. Ese mismo
 * mecanismo estaba reproducido en TypeScript. Diecisiete tipos de entrada
 * declaraban `modo?:` y su implementacion remataba con `data.modo ||
 * 'PRODUCCION'`. Quien no pasaba el entorno no recibia ningun error del
 * compilador ni de la base: escribia en produccion.
 *
 * No es teorico. Al terminar el grupo de caja, la base del banco de pruebas
 * habia quedado asi despues de UN cobro registrado en PRUEBA:
 *
 *     journal_entries     modo = PRUEBA        <- correcto
 *     financial_movements modo = PRODUCCION    <- el recibo de practicas
 *
 * `arRepository` no le pasaba el entorno a `registerMovement`, y como era
 * opcional, el movimiento se sello como real. Es decir: un cobro de practicas
 * de RD$300 aparecia en el estado de cuenta REAL del cliente, el que se
 * imprime y se le entrega, rebajandole la deuda que si debe.
 *
 * QUE SE HACE
 * -----------
 * `modo` pasa a ser obligatorio en los 17 sitios. Eso convierte al compilador
 * en el escaner: senalo 14 llamadas que lo omitian, ni una mas ni una menos, y
 * ninguna se puede volver a colar sin que `tsc` la pare. Los 36 `||
 * 'PRODUCCION'` que quedaron muertos se retiran: dejarlos ahi le dice al
 * siguiente que lea el fichero que el entorno puede faltar.
 *
 * LOS CUATRO QUE SOBREVIVEN, Y POR QUE
 * ------------------------------------
 * Tres leen una cabecera o una cookie HTTP, que de verdad puede no venir
 * (auth.ts, proxy.ts x2). El cuarto lee el payload de trabajos ya encolados,
 * que no lo lleva, y anadirselo como obligatorio romperia los que esten en
 * cola ahora mismo (jobRunners). Son decisiones, no descuidos, y van
 * comentadas en el codigo.
 *
 * Eran cinco. El quinto estaba en la rama `?token=` de la ruta del PDF, que se
 * retiro entera por saltarse el control de permisos: al desaparecer la rama
 * desaparecio su valor por defecto. Este banco lo detecto solo.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { ArRepository } from '../src/repositories/arRepository';
import { createExpense } from '../src/services/expenseService';
import { readFileSync } from 'fs';
import { join } from 'path';
import { limpiar as limpiarTodo } from './_limpieza';
import { fuente, crudo } from './_fuente';

const A = '11111111-1111-1111-1111-111111111111';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';
const CAJA = 'eeeeeeee-0000-0000-0000-0000000000c2';
const CLIENTE = 'ffffffff-0000-0000-0000-00000000cb01';
const SUPLIDOR = 'ffffffff-0000-0000-0000-00000000cb02';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};


async function limpiar() {
  // Orden de borrado derivado del esquema, no copiado a mano. Ver _limpieza.ts.
  await limpiarTodo(['cash_registers', 'accounting_periods']);
  await db.execute(sql`DELETE FROM customers WHERE id = ${CLIENTE}::uuid`);
  await db.execute(sql`DELETE FROM suppliers WHERE id = ${SUPLIDOR}::uuid`);

  await db.execute(sql`
    INSERT INTO cash_registers (id, company_id, name, code, status)
    VALUES (${CAJA}::uuid, ${A}::uuid, 'Caja obligatoria', 'C2', 'active')`);
  await db.execute(sql`
    INSERT INTO customers (id, company_id, name) VALUES (${CLIENTE}::uuid, ${A}::uuid, 'Cliente')`);
  await db.execute(sql`
    INSERT INTO suppliers (id, company_id, name) VALUES (${SUPLIDOR}::uuid, ${A}::uuid, 'Suplidor')`);

  // Los periodos contables tambien son por entorno. Hacen falta los DOS
  // abiertos: si solo se abre el real, la compra de practicas se rechaza y el
  // banco pasaria por la razon equivocada.
  //
  // El periodo se saca del ANO EN CURSO, no fijo a 2026. Las compras se siembran
  // con la fecha de hoy y tienen que caer dentro; con '2026-01-01'..'2026-12-31'
  // escrito a mano, este banco habria empezado a fallar solo el 1 de enero de
  // 2027, sin que nadie tocara nada. Ya paso algo asi en `verificar_modo_fiscal`,
  // que sembraba la factura con `now()` y la buscaba en una ventana fija de
  // agosto: paso todo agosto y fallo el dia 1 de septiembre.
  await db.execute(sql`
    INSERT INTO accounting_periods (company_id, modo, name, start_date, end_date, status)
    VALUES (${A}::uuid, 'PRODUCCION', 'Periodo real',      date_trunc('year', current_date)::date, (date_trunc('year', current_date) + interval '1 year - 1 day')::date, 'open'),
           (${A}::uuid, 'PRUEBA',     'Periodo practicas', date_trunc('year', current_date)::date, (date_trunc('year', current_date) + interval '1 year - 1 day')::date, 'open')`);
}

const modos = async (tabla: string) => {
  const r = (await db.execute(sql`
    SELECT modo, count(*)::int AS n FROM ${sql.raw(tabla)} GROUP BY modo ORDER BY modo`
  )) as unknown as { modo: string; n: number }[];
  return r.map((x) => `${x.modo}:${x.n}`).join(' ') || '(vacia)';
};

async function main() {
  await limpiar();
  const hoy = new Date().toISOString().slice(0, 10);

  console.log('\n1) LA REGRESION: un cobro de practicas en el estado de cuenta real\n');
  await db.execute(sql`
    INSERT INTO cash_sessions (company_id, modo, cash_register_id, user_id, initial_balance, expected_balance, status)
    VALUES (${A}::uuid, 'PRUEBA', ${CAJA}::uuid, ${USER}::uuid, 0, 0, 'open')`);

  const fac = (await db.execute(sql`
    INSERT INTO invoices (company_id, modo, user_id, customer_id, ncf, ecf_type, total, codigo_factura, status)
    VALUES (${A}::uuid, 'PRUEBA', ${USER}::uuid, ${CLIENTE}::uuid, 'E310000000777', '31', 300, 'FAC-P', 'accepted')
    RETURNING id`)) as unknown as { id: string }[];
  const ar = (await db.execute(sql`
    INSERT INTO accounts_receivable (company_id, modo, invoice_id, customer_id, amount, balance, due_date)
    VALUES (${A}::uuid, 'PRUEBA', ${fac[0].id}::uuid, ${CLIENTE}::uuid, 300, 300, ${hoy})
    RETURNING id`)) as unknown as { id: string }[];

  await ArRepository.registerReceipt({
    companyId: A, modo: 'PRUEBA', customerId: CLIENTE, userId: USER, date: hoy,
    paymentMethod: 'cash', amount: 300,
    invoicesApplied: [{ arId: ar[0].id, amountApplied: 300 }],
  });

  ok('el movimiento financiero del recibo queda en PRUEBA',
    (await modos('financial_movements')) === 'PRUEBA:1', await modos('financial_movements'));
  ok('y su asiento contable tambien', (await modos('journal_entries')) === 'PRUEBA:1',
    await modos('journal_entries'));
  ok('y el recibo', (await modos('customer_receipts')) === 'PRUEBA:1',
    await modos('customer_receipts'));

  const enReal = (await db.execute(sql`
    SELECT count(*)::int AS n FROM financial_movements
    WHERE company_id = ${A}::uuid AND customer_id = ${CLIENTE}::uuid AND modo = 'PRODUCCION'`
  )) as unknown as { n: number }[];
  ok('el estado de cuenta REAL del cliente no tiene nada dentro', enReal[0].n === 0,
    String(enReal[0].n));

  console.log('\n2) Una compra entera en PRUEBA: nada se escapa a PRODUCCION\n');
  await createExpense({
    companyId: A, modo: 'PRUEBA', supplierId: SUPLIDOR, expenseType: '01',
    ncf: 'B0100000001', issueDate: hoy, amount: 1000, itbis: 180,
    paymentMethod: '02', userId: USER,
  });

  ok('la compra', (await modos('expenses')) === 'PRUEBA:1', await modos('expenses'));
  ok('su cuenta por pagar', (await modos('accounts_payable')) === 'PRUEBA:1',
    await modos('accounts_payable'));
  ok('su asiento', (await modos('journal_entries')) === 'PRUEBA:2', await modos('journal_entries'));
  // Tres, no dos: el cobro de arriba, mas los DOS de la compra. Al no ser a
  // credito (paymentMethod '04'), createExpense escribe el movimiento de la
  // compra y ademas el del pago inmediato. Los dos pasaban por el mismo
  // `registerMovement` que sellaba PRODUCCION.
  ok('y sus dos movimientos financieros', (await modos('financial_movements')) === 'PRUEBA:3',
    await modos('financial_movements'));

  console.log('\n3) CONTROL: la misma compra en PRODUCCION si va a PRODUCCION\n');
  await createExpense({
    companyId: A, modo: 'PRODUCCION', supplierId: SUPLIDOR, expenseType: '01',
    ncf: 'B0100000002', issueDate: hoy, amount: 500, itbis: 90,
    paymentMethod: '02', userId: USER,
  });
  ok('la compra real se separa de la de practicas',
    (await modos('expenses')) === 'PRODUCCION:1 PRUEBA:1', await modos('expenses'));
  ok('y su cuenta por pagar', (await modos('accounts_payable')) === 'PRODUCCION:1 PRUEBA:1',
    await modos('accounts_payable'));

  console.log('\n4) El compilador ya no deja omitirlo\n');
  const raices = [
    'src/services/invoice/types.ts',
    'src/services/financialMovementService.ts',
    'src/services/apService.ts',
    'src/services/documents/documentService.ts',
    'src/services/documents/emailService.ts',
    'src/repositories/accountingRepository.ts',
    'src/repositories/apRepository.ts',
    'src/repositories/invoiceRepository.ts',
    'src/components/documents/templates/InvoiceTemplate.tsx',
  ];
  for (const r of raices) {
    ok(`sin \`modo?:\` en ${r.replace('src/', '')}`, !/modo\?: 'PRODUCCION' \| 'PRUEBA'/.test(fuente(r)));
  }

  console.log('\n5) Los cuatro `|| \'PRODUCCION\'` que sobreviven estan justificados\n');
  const supervivientes: [string, RegExp][] = [
    ['auth.ts (cabecera HTTP)', /src\/middleware\/auth\.ts/],
  ];
  void supervivientes;
  const conMotivo: [string, string][] = [
    ['src/middleware/auth.ts', 'La cabecera puede no venir'],
    ['src/proxy.ts', 'La cookie puede no venir'],
    ['src/infrastructure/jobRunners.ts', 'El payload de los trabajos ya encolados no lo lleva'],
  ];
  for (const [f, motivo] of conMotivo) {
    // `crudo`, no `fuente`: aqui lo que se comprueba ES el comentario. Son los
    // tres sitios donde `modo` sigue siendo opcional a proposito, y la
    // condicion para dejarlo asi fue que quedara escrito POR QUE. Si se leyera
    // sin comentarios, esta comprobacion no podria existir.
    const s = crudo(f);
    ok(`${f.replace('src/', '')} explica por que`, s.includes(motivo), motivo);
  }
  // Y el quinto ya no esta: la ruta del PDF no tiene ningun valor por defecto
  // porque no tiene ninguna rama que lo necesite.
  ok('la ruta del PDF ya no necesita ningun valor por defecto',
    !/\|\| 'PRODUCCION'/.test(fuente('src/app/api/v1/invoices/[id]/pdf/route.ts')));

  console.log('\n6) El enlace publico de 30 dias\n');
  const ds = fuente('src/services/documents/documentService.ts');
  ok('createShareToken ya no sella \'PRODUCCION\' fijo',
    !/modo: 'PRODUCCION' \/\/ Or dynamically passed/.test(ds));
  ok('lo recibe como parametro obligatorio',
    /modo: 'PRODUCCION' \| 'PRUEBA',\n    documentId: string,/.test(ds));
  const acc = fuente('src/actions/documents.ts');
  ok('y la factura se busca dentro del entorno', /eq\(invoices\.modo, modo\)/.test(acc));

  console.log('\n7) La marca de agua de la factura de practicas\n');
  const plantilla = fuente('src/components/documents/templates/InvoiceTemplate.tsx');
  ok('el entorno es obligatorio en la plantilla',
    /modo: 'PRODUCCION' \| 'PRUEBA';/.test(plantilla));
  ok('y sigue siendo lo que decide la marca de agua',
    /data\.modo === 'PRUEBA'/.test(plantilla));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
