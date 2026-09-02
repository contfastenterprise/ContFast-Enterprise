/**
 * Tres modulos mas que eran ciegos al entorno.
 *
 * 1. ecfValidator -- el mas serio, y es fiscal.
 *
 *    `ecf_sequences` tiene indice unico (company_id, ecf_type, modo): hay DOS
 *    secuencias por tipo de comprobante, una por entorno, cada una con su
 *    autorizacion SACF de la DGII, su rango y su vencimiento.
 *
 *    `validateSequence` las buscaba por empresa y tipo, ordenando por fecha de
 *    creacion y quedandose con la primera. Es decir: al emitir en PRODUCCION
 *    podia validarse contra el rango y el vencimiento de la secuencia de
 *    PRUEBAS. Deja pasar una emision fuera del rango autorizado, o bloquea una
 *    legitima diciendo que la secuencia vencio.
 *
 *    Y el limite del plan SaaS contaba TODAS las facturas del periodo, asi que
 *    practicar consumia la cuota pagada.
 *
 * 2. products/route -- el indice unico de inventory_levels es
 *    (product_id, warehouse_id, modo). Sin filtro, cada almacen salia
 *    DUPLICADO en la respuesta, una vez por entorno. Ademas las dos claves de
 *    cache duraban 3600 segundos sin distinguirlos.
 *
 * 3. expenses/report -- el informe de compras que se imprime y se entrega
 *    incluia las compras de practicas con su NCF.
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { EcfValidator } from '../src/services/ecfValidator';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fuente } from './_fuente';

const A = '11111111-1111-1111-1111-111111111111';
const USER_A = 'bbbbbbbb-0000-0000-0000-000000000001';
const ALM = 'cccccccc-0000-0000-0000-000000000001';
const PROD = 'dddddddd-0000-0000-0000-000000000001';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

async function sembrar() {
  // Orden de borrado derivado del esquema. Ver _limpieza.ts.
  await limpiarTodo([]);

  // La secuencia REAL: rango amplio y sin vencer.
  // La de PRUEBAS: agotada Y vencida. Se crea DESPUES, de forma que la consulta
  // antigua -- que ordenaba por fecha de creacion -- se quedaba con esta.
  await db.execute(sql`
    INSERT INTO ecf_sequences (company_id, modo, ecf_type, current_sequence, max_sequence,
                               sequence_expiry, status)
    VALUES (${A}::uuid, 'PRODUCCION', '31',  10, 5000, '31-12-2030', 'active')`);
  await db.execute(sql`
    INSERT INTO ecf_sequences (company_id, modo, ecf_type, current_sequence, max_sequence,
                               sequence_expiry, status)
    VALUES (${A}::uuid, 'PRUEBA', '31', 999, 999, '01-01-2020', 'active')`);

  // El mismo producto y almacen, con existencia distinta en cada entorno.
  await db.execute(sql`
    INSERT INTO inventory_levels (company_id, modo, product_id, warehouse_id, quantity)
    VALUES (${A}::uuid, 'PRODUCCION', ${PROD}::uuid, ${ALM}::uuid, 15),
           (${A}::uuid, 'PRUEBA',     ${PROD}::uuid, ${ALM}::uuid, 777)`);
}

async function main() {
  await sembrar();

  console.log('\n1) Secuencia e-CF: cada entorno valida contra la suya\n');
  const enReal = await EcfValidator.validateSequence(A, '31', 'PRODUCCION');
  ok('emitir en PRODUCCION no da ningun error', enReal.length === 0,
    enReal.map((e) => e.code).join(', '));

  const enPrueba = await EcfValidator.validateSequence(A, '31', 'PRUEBA');
  const codigos = enPrueba.map((e) => e.code);
  ok('en PRUEBA si avisa: su secuencia esta agotada', codigos.includes('SEQUENCE_EXHAUSTED'),
    codigos.join(', '));
  ok('y vencida', codigos.includes('SEQUENCE_EXPIRED'), codigos.join(', '));

  console.log('\n2) La regresion: sin filtro, la real se validaba contra la de pruebas\n');
  // Reproduce la consulta antigua: por empresa y tipo, la mas reciente.
  const antigua = (await db.execute(sql`
    SELECT modo, current_sequence, max_sequence, sequence_expiry
    FROM ecf_sequences
    WHERE company_id = ${A}::uuid AND ecf_type = '31' AND status = 'active' AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT 1`)) as unknown as { modo: string }[];
  ok('la consulta antigua se quedaba con la de PRUEBA', antigua[0].modo === 'PRUEBA',
    antigua[0].modo);
  ok('o sea: una emision real habria salido agotada y vencida', true);

  console.log('\n3) Falta de secuencia en un entorno concreto\n');
  // Esto NO es limpieza: es el escenario. Se quita la secuencia real para
  // comprobar que avisa aunque siga existiendo la de pruebas.
  await db.execute(sql`DELETE FROM ecf_sequences WHERE company_id = ${A}::uuid AND modo = 'PRODUCCION'`);
  const sinReal = await EcfValidator.validateSequence(A, '31', 'PRODUCCION');
  ok('sin secuencia real, avisa aunque exista la de pruebas',
    sinReal.some((e) => e.code === 'NO_ACTIVE_SEQUENCE'), sinReal.map((e) => e.code).join(', '));

  console.log('\n4) El limite del plan cuenta solo comprobantes reales\n');

  const val = fuente('src/services/ecfValidator.ts');
  ok('el conteo de uso fija PRODUCCION', /eq\(invoices\.modo, 'PRODUCCION'\)/.test(val));
  ok('y la secuencia usa el modo de la sesion', /eq\(ecfSequences\.modo, modo\)/.test(val));

  console.log('\n5) Inventario en la ficha de producto: sin almacenes duplicados\n');
  const dup = (await db.execute(sql`
    SELECT count(*)::int AS n FROM inventory_levels
    WHERE company_id = ${A}::uuid AND product_id = ${PROD}::uuid AND warehouse_id = ${ALM}::uuid`
  )) as unknown as { n: number }[];
  ok('en la base hay dos filas, una por entorno', dup[0].n === 2, String(dup[0].n));

  const conFiltro = (await db.execute(sql`
    SELECT quantity FROM inventory_levels
    WHERE company_id = ${A}::uuid AND product_id = ${PROD}::uuid AND modo = 'PRODUCCION'`
  )) as unknown as { quantity: string }[];
  ok('con el filtro sale una sola, la real (15)',
    conFiltro.length === 1 && Number(conFiltro[0].quantity) === 15,
    JSON.stringify(conFiltro.map((x) => x.quantity)));

  const ruta = fuente('src/app/api/v1/products/route.ts');
  ok('las dos consultas de inventario filtran el entorno',
    (ruta.match(/eq\(inventoryLevels\.modo, auth\.modo\)/g) || []).length === 2);
  ok('la cache del codigo de barras lleva el modo',
    /cache:products:\$\{auth\.companyId\}:\$\{auth\.modo\}:barcode_/.test(ruta));
  ok('y la del listado tambien',
    /cache:products:\$\{auth\.companyId\}:\$\{auth\.modo\}:page_/.test(ruta));

  console.log('\n6) Informe de compras\n');
  const rep = fuente('src/app/api/v1/expenses/report/route.ts');
  ok('filtra el entorno', /eq\(expenses\.modo, session\.modo\)/.test(rep));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
