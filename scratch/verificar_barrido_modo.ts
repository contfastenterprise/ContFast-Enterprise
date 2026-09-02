/**
 * Ultima tanda del barrido de entorno: nueve rutas y dos raices.
 *
 * LO IMPORTANTE, que no estaba en la lista
 * ----------------------------------------
 * `InvoiceRepository.getById(id, companyId, modo = 'PRODUCCION')` tenia el
 * entorno con VALOR POR DEFECTO, y cuatro llamadores lo omitian. Es el mismo
 * patron silencioso de la columna: no falla, simplemente busca en el entorno
 * equivocado. Uno de los cuatro, `POST /api/v1/delivery-notes`, es camino de
 * escritura: crear un conduce en PRUEBA resolvia la factura de PRODUCCION.
 *
 * Ahora `modo` es obligatorio y el compilador localiza cualquier llamada nueva.
 *
 * EL CASO DE LA COLA
 * ------------------
 * `jobRunners` no puede recibir el entorno: el payload de los trabajos ya
 * encolados no lo lleva, y anadirlo los romperia. Se deduce de la propia
 * factura -- el id es clave primaria, asi que id + empresa la localiza sin
 * ambiguedad -- y con eso se resuelve tambien su secuencia e-CF, que hasta
 * ahora podia avanzar la de pruebas en un envio real.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { InvoiceRepository } from '../src/repositories/invoiceRepository';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fuente } from './_fuente';

const A = '11111111-1111-1111-1111-111111111111';
const USER_A = 'bbbbbbbb-0000-0000-0000-000000000001';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};


async function main() {
  // Orden de borrado derivado del esquema. Ver _limpieza.ts.
  await limpiarTodo([]);

  const fac = (await db.execute(sql`
    INSERT INTO invoices (company_id, modo, user_id, ncf, ecf_type, total, codigo_factura, status)
    VALUES (${A}::uuid, 'PRODUCCION', ${USER_A}::uuid, 'E310000000001', '31', 100, 'FAC-REAL', 'accepted'),
           (${A}::uuid, 'PRUEBA',     ${USER_A}::uuid, 'E310000000999', '31',  50, 'FAC-PRUEBA', 'accepted')
    RETURNING id, modo`)) as unknown as { id: string; modo: string }[];
  const real = fac.find((f) => f.modo === 'PRODUCCION')!.id;
  const prueba = fac.find((f) => f.modo === 'PRUEBA')!.id;

  console.log('\n1) getById ya no puede confundir de entorno\n');
  const r1 = await InvoiceRepository.getById(real, A, 'PRODUCCION');
  ok('la factura real se encuentra en PRODUCCION', r1?.codigoFactura === 'FAC-REAL', String(r1?.codigoFactura));
  const r2 = await InvoiceRepository.getById(real, A, 'PRUEBA');
  ok('y NO desde PRUEBA', r2 === undefined || r2 === null, JSON.stringify(r2 && r2.codigoFactura));
  const r3 = await InvoiceRepository.getById(prueba, A, 'PRUEBA');
  ok('la de practicas se encuentra en PRUEBA', r3?.codigoFactura === 'FAC-PRUEBA', String(r3?.codigoFactura));
  const r4 = await InvoiceRepository.getById(prueba, A, 'PRODUCCION');
  ok('y NO desde PRODUCCION', r4 === undefined || r4 === null, JSON.stringify(r4 && r4.codigoFactura));

  console.log('\n2) Los cuatro llamadores pasan el entorno\n');
  ok('invoices/[id]/xml', /getById\(id, auth\.companyId, auth\.modo\)/.test(fuente('src/app/api/v1/invoices/[id]/xml/route.ts')));
  ok('ecf/[id]/dgii-status', /getById\(id, auth\.companyId, auth\.modo\)/.test(fuente('src/app/api/v1/ecf/[id]/dgii-status/route.ts')));
  ok('delivery-notes (camino de escritura)',
    /getById\(invoiceId, auth\.companyId, auth\.modo\)/.test(fuente('src/app/api/v1/delivery-notes/route.ts')));
  ok('el parametro ya no tiene valor por defecto',
    /getById\(id: string, companyId: string, modo: 'PRODUCCION' \| 'PRUEBA'\)/.test(
      fuente('src/repositories/invoiceRepository.ts')));

  console.log('\n3) La cola deduce el entorno de la factura\n');
  const jr = fuente('src/infrastructure/jobRunners.ts');
  ok('lo resuelve antes de cargar la factura', /select\(\{ modo: invoices\.modo \}\)/.test(jr));
  ok('y se lo pasa a getById', /getById\(invoiceId, companyId, modo\)/.test(jr));
  ok('su secuencia e-CF tambien lo filtra', /eq\(ecfSequences\.modo, modo\)/.test(jr));

  // La deduccion tiene que funcionar para las dos.
  for (const [id, esperado] of [[real, 'PRODUCCION'], [prueba, 'PRUEBA']] as const) {
    const d = (await db.execute(sql`
      SELECT modo FROM invoices WHERE id = ${id}::uuid AND company_id = ${A}::uuid LIMIT 1`
    )) as unknown as { modo: string }[];
    ok(`deduce ${esperado} correctamente`, d[0].modo === esperado, d[0].modo);
  }

  console.log('\n4) Las nueve rutas de la tanda\n');
  const rutas: [string, string, RegExp][] = [
    ['ecf/route (listado y conteo)', 'src/app/api/v1/ecf/route.ts', /eq\(invoices\.modo, auth\.modo\)/],
    ['ecf/stats', 'src/app/api/v1/ecf/stats/route.ts', /eq\(invoices\.modo, auth\.modo\)/],
    ['ecf/queue', 'src/app/api/v1/ecf/queue/route.ts', /eq\(dgiiSubmissions\.modo, auth\.modo\)/],
    ['inventory/movements', 'src/app/api/v1/inventory/movements/route.ts', /eq\(inventoryMovements\.modo, session\.modo\)/],
    ['ap/print', 'src/app/api/v1/ap/print/route.ts', /eq\(accountsPayable\.modo, session\.modo\)/],
    ['cash/sessions/[id]/summary', 'src/app/api/v1/cash/sessions/[id]/summary/route.ts', /eq\(cashSessions\.modo, auth\.modo\)/],
    ['statements/suppliers/[id]/print', 'src/app/api/v1/financial/statements/suppliers/[id]/print/route.ts', /eq\(expenses\.modo, session\.modo\)/],
    // El filtro de entorno de esta ruta ya no esta escrito aqui: se movio
    // dentro de envioVigente, que ademas acota por empresa y ordena. La
    // garantia sigue existiendo, en un solo sitio en vez de cinco.
    ['invoices/[id]/xml', 'src/app/api/v1/invoices/[id]/xml/route.ts', /envioVigente\(id, auth\.companyId, auth\.modo\)/],
    ['invoices/report', 'src/app/api/v1/invoices/report/route.ts', /eq\(invoices\.modo, session\.modo\)/],
  ];
  for (const [nombre, ruta, re] of rutas) ok(nombre, re.test(fuente(ruta)));

  // ecf/queue y ecf/route tienen DOS consultas cada uno.
  ok('ecf/queue: las dos consultas',
    (fuente('src/app/api/v1/ecf/queue/route.ts').match(/eq\(dgiiSubmissions\.modo, auth\.modo\)/g) || []).length === 2);
  ok('ecf/route: las dos consultas',
    (fuente('src/app/api/v1/ecf/route.ts').match(/eq\(invoices\.modo, auth\.modo\)/g) || []).length === 2);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
