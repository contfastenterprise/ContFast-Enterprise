/**
 * Banco de pruebas de `scripts/inventario_negativo.ts --conteo=...`.
 *
 * Ejecuta el script DE VERDAD como proceso hijo contra PostgreSQL, no llama a
 * sus funciones: lo que se prueba es la orden que va a teclear el usuario.
 *
 * Escenario, empresa Alfa / almacen Principal / PRODUCCION:
 *
 *   PC-01  nivel -10   contado 4 en dos lineas (2+2)  -> ajuste +14 y aviso de repetido
 *   BI-03  nivel   0   contado 7                      -> ajuste +7
 *   SV-01  nivel  25   contado 25                     -> sin diferencia, no se toca
 *   MR-09  sin nivel en PRODUCCION, 12 en PRUEBA, contado 3 -> se crea el nivel
 *          (si la busqueda del nivel nuevo olvidara el modo, pisaria el de PRUEBA)
 *   ZP-02  nivel   8   no aparece en el CSV           -> aviso, no se toca
 *   NG-05  nivel  -6   no aparece en el CSV           -> aviso "SIGUE EN NEGATIVO"
 *   XX-99  no existe   contado 5                      -> aviso, no se carga
 *   SRV-99 servicio (tracks_inventory=false), contado 9 -> aviso, no se carga
 *
 * Controles que NO se pueden mover (son el aislamiento):
 *   PC-01 en PRUEBA / Principal ....... 99
 *   MR-09 en PRUEBA / Principal ....... 12
 *   PC-01 en PRODUCCION / Sucursal .... 50
 *   PC-01 de la empresa Beta .......... 33   (mismo SKU, otra empresa)
 */
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const PRINCIPAL = 'cccccccc-0000-0000-0000-000000000001';
const SUCURSAL = 'cccccccc-0000-0000-0000-000000000002';
const CENTRAL = 'cccccccc-0000-0000-0000-000000000003';
const PC01 = 'dddddddd-0000-0000-0000-000000000001';
const BI03 = 'dddddddd-0000-0000-0000-000000000002';
const SV01 = 'dddddddd-0000-0000-0000-000000000003';
const MR09 = 'dddddddd-0000-0000-0000-00000000000a';
const ZP02 = 'dddddddd-0000-0000-0000-00000000000b';
const NG05 = 'dddddddd-0000-0000-0000-00000000000c';
const PC01_B = 'dddddddd-0000-0000-0000-00000000000d'; // mismo SKU, empresa Beta
const SRV01 = 'dddddddd-0000-0000-0000-00000000000e'; // servicio: no lleva inventario
const USUARIO = 'ana@alfa.do';
const CSV = '/tmp/conteo_prueba.csv';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

function correr(args: string[]): { salida: string; codigo: number } {
  try {
    const salida = execFileSync('npx', ['tsx', 'scripts/inventario_negativo.ts', ...args], {
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { salida, codigo: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return { salida: (err.stdout || '') + (err.stderr || ''), codigo: err.status ?? 1 };
  }
}

async function nivel(productId: string, warehouseId: string, modo: string): Promise<number | null> {
  const r = await db.execute(sql`
    SELECT quantity FROM inventory_levels
    WHERE product_id = ${productId}::uuid AND warehouse_id = ${warehouseId}::uuid AND modo = ${modo}
  `);
  const fila = (r as unknown as { quantity: string }[])[0];
  return fila ? Number(fila.quantity) : null;
}

async function movimientos(): Promise<{ sku: string; quantity: string; balance_after: string; description: string }[]> {
  const r = await db.execute(sql`
    SELECT p.sku, m.quantity, m.balance_after, m.description
    FROM inventory_movements m JOIN products p ON p.id = m.product_id
    WHERE m.type = 'adjustment' ORDER BY p.sku
  `);
  return r as unknown as { sku: string; quantity: string; balance_after: string; description: string }[];
}

async function sembrar() {
  // Orden de borrado derivado del esquema. Ver _limpieza.ts.
  await limpiarTodo([]);
  await db.execute(sql`DELETE FROM products WHERE id IN (${MR09}::uuid, ${ZP02}::uuid, ${NG05}::uuid, ${PC01_B}::uuid, ${SRV01}::uuid)`);

  await db.execute(sql`
    INSERT INTO products (id, company_id, sku, name, cost) VALUES
      (${MR09}::uuid, ${A}::uuid, 'MR-09', 'Marco roble',  3200.00),
      (${ZP02}::uuid, ${A}::uuid, 'ZP-02', 'Zapata',        150.00),
      (${NG05}::uuid, ${A}::uuid, 'NG-05', 'Panel nogal',  4100.00),
      (${PC01_B}::uuid, ${B}::uuid, 'PC-01', 'Puerta caoba Beta', 7000.00)
  `);
  await db.execute(sql`
    INSERT INTO products (id, company_id, sku, name, cost, tracks_inventory)
    VALUES (${SRV01}::uuid, ${A}::uuid, 'SRV-99', 'Instalacion', 0, false)
  `);

  await db.execute(sql`
    INSERT INTO inventory_levels (company_id, modo, product_id, warehouse_id, quantity) VALUES
      -- Las filas de PRUEBA van PRIMERO a proposito. La tabla se borra y se
      -- rellena en cada ejecucion, asi que el orden fisico es el de insercion:
      -- una consulta que busque el nivel por producto+almacen y se olvide del
      -- modo se topara con la de PRUEBA antes que con la de PRODUCCION y la
      -- pisara. Al reves el fallo pasaria desapercibido la mitad de las veces.
      (${A}::uuid, 'PRUEBA',     ${PC01}::uuid, ${PRINCIPAL}::uuid,  99.0000),
      (${A}::uuid, 'PRUEBA',     ${MR09}::uuid, ${PRINCIPAL}::uuid,  12.0000),
      (${A}::uuid, 'PRODUCCION', ${PC01}::uuid, ${PRINCIPAL}::uuid, -10.0000),
      (${A}::uuid, 'PRODUCCION', ${BI03}::uuid, ${PRINCIPAL}::uuid,   0.0000),
      (${A}::uuid, 'PRODUCCION', ${SV01}::uuid, ${PRINCIPAL}::uuid,  25.0000),
      (${A}::uuid, 'PRODUCCION', ${ZP02}::uuid, ${PRINCIPAL}::uuid,   8.0000),
      (${A}::uuid, 'PRODUCCION', ${NG05}::uuid, ${PRINCIPAL}::uuid,  -6.0000),
      (${A}::uuid, 'PRODUCCION', ${PC01}::uuid, ${SUCURSAL}::uuid,   50.0000),
      (${B}::uuid, 'PRODUCCION', ${PC01_B}::uuid, ${CENTRAL}::uuid,  33.0000)
  `);

  // Excel dominicano: separador ';', BOM, CRLF y un decimal con coma.
  writeFileSync(
    CSV,
    '﻿' +
      ['SKU;Cantidad Contada',
       'PC-01;2',        // el mismo SKU en dos lineas: se suman
       'BI-03;7',
       'SV-01;25',
       'MR-09;3',
       'PC-01;2',
       'XX-99;5',        // no existe en el catalogo
       'BI-03;0,5',      // decimal con coma -> 7.5 en total
       'SRV-99;9',       // servicio: no lleva inventario
       ''].join('\r\n'),
    'utf8'
  );
}

const BASE = ['--conteo=' + CSV, '--empresa=Alfa SRL', '--modo=PRODUCCION', '--almacen=Principal'];

async function main() {
  await sembrar();

  console.log('\n1) Simulacion: no puede escribir nada\n');
  const seco = correr(BASE);
  ok('la simulacion termina bien', seco.codigo === 0, seco.codigo ? seco.salida.slice(-400) : '');
  ok('suma las dos lineas de PC-01 y avisa', /PC-01: lineas 2, 6 -> 4/.test(seco.salida));
  ok('lee la coma decimal de BI-03 (7 + 0,5)', /BI-03.*7\.5000/.test(seco.salida));
  ok('avisa del SKU que no existe', /no existen? en el catalogo/.test(seco.salida));
  ok('y lo escribe como venia en el CSV, no en minusculas', /\bXX-99 \(linea 7\)/.test(seco.salida));
  ok('lo mismo con el SKU repetido', /\bPC-01: lineas/.test(seco.salida));
  ok('avisa de los niveles que el CSV no menciona', /2 productos tienen nivel [\s\S]* NO\s*\n?\s*aparecen/.test(seco.salida)
    || /aparecen en el CSV/.test(seco.salida));
  ok('senala el que sigue en negativo', /SIGUE EN NEGATIVO/.test(seco.salida));
  ok('cuenta SV-01 como ya cuadrado', /Ya cuadrados\s*:\s*1/.test(seco.salida));
  ok('MR-09 se marca como nivel nuevo', /MR-09.*\(nivel nuevo\)/.test(seco.salida));
  ok('no imprime ningun asiento contable', !/DEBE|HABER/.test(seco.salida));
  ok('explica por que no hay asiento', /POR QUE NO HAY ASIENTO/.test(seco.salida));
  ok('aparta el servicio del CSV', /no llevan control de \s*\n?\s*existencia/.test(seco.salida)
    || /no llevan control de/.test(seco.salida));
  ok('y lo nombra', /SRV-99\] Instalacion/.test(seco.salida));

  ok('PC-01 sigue en -10 tras la simulacion', (await nivel(PC01, PRINCIPAL, 'PRODUCCION')) === -10);
  ok('no se creo el nivel de MR-09', (await nivel(MR09, PRINCIPAL, 'PRODUCCION')) === null);
  ok('la simulacion no dejo movimientos', (await movimientos()).length === 0);

  console.log('\n2) --aplicar sin --usuario y --aplicar sin --conteo se rechazan\n');
  const sinUsuario = correr([...BASE, '--aplicar']);
  ok('exige --usuario', sinUsuario.codigo === 1 && /--usuario/.test(sinUsuario.salida));
  const sinConteo = correr(['--aplicar', '--usuario=' + USUARIO]);
  ok('sin --conteo no hay nada que aplicar', sinConteo.codigo === 1 && /no lleva los niveles a cero/.test(sinConteo.salida));
  const sinAmbito = correr(['--conteo=' + CSV]);
  ok('el conteo exige empresa, modo y almacen', sinAmbito.codigo === 1 && /exige --empresa/.test(sinAmbito.salida));

  console.log('\n3) Carga real\n');
  const carga = correr([...BASE, '--aplicar', '--usuario=' + USUARIO, '--referencia=CONTEO-2026-08']);
  ok('la carga termina bien', carga.codigo === 0, carga.codigo ? carga.salida.slice(-600) : '');

  ok('PC-01 queda en 4', (await nivel(PC01, PRINCIPAL, 'PRODUCCION')) === 4);
  ok('BI-03 queda en 7,5', (await nivel(BI03, PRINCIPAL, 'PRODUCCION')) === 7.5);
  ok('SV-01 sigue en 25 sin tocarse', (await nivel(SV01, PRINCIPAL, 'PRODUCCION')) === 25);
  ok('MR-09 se crea en 3', (await nivel(MR09, PRINCIPAL, 'PRODUCCION')) === 3);
  ok('el servicio NO recibe nivel', (await nivel(SRV01, PRINCIPAL, 'PRODUCCION')) === null,
    String(await nivel(SRV01, PRINCIPAL, 'PRODUCCION')));
  ok('ZP-02 no contado sigue en 8', (await nivel(ZP02, PRINCIPAL, 'PRODUCCION')) === 8);
  ok('NG-05 no contado sigue en -6', (await nivel(NG05, PRINCIPAL, 'PRODUCCION')) === -6);

  console.log('\n   controles de aislamiento:\n');
  ok('PRUEBA / Principal intacto en 99', (await nivel(PC01, PRINCIPAL, 'PRUEBA')) === 99);
  ok('el nivel nuevo NO piso el de PRUEBA del mismo producto',
    (await nivel(MR09, PRINCIPAL, 'PRUEBA')) === 12, String(await nivel(MR09, PRINCIPAL, 'PRUEBA')));
  ok('PRODUCCION / Sucursal intacto en 50', (await nivel(PC01, SUCURSAL, 'PRODUCCION')) === 50);
  ok('el mismo SKU en la empresa Beta intacto en 33', (await nivel(PC01_B, CENTRAL, 'PRODUCCION')) === 33);

  const movs = await movimientos();
  ok('un movimiento por nivel escrito (3)', movs.length === 3, movs.map((m) => m.sku).join(','));
  const pc = movs.find((m) => m.sku === 'PC-01');
  ok('el movimiento de PC-01 es +14', pc !== undefined && Number(pc.quantity) === 14, pc?.quantity);
  ok('y deja el saldo en 4', pc !== undefined && Number(pc.balance_after) === 4, pc?.balance_after);
  ok('la descripcion lleva la referencia del conteo', /CONTEO-2026-08/.test(pc?.description || ''));
  ok('y dice que no lleva asiento', /costo de ventas/.test(pc?.description || ''));
  const mr = movs.find((m) => m.sku === 'MR-09');
  ok('el de MR-09 anota que no tenia nivel', /no tenia nivel/.test(mr?.description || ''));

  console.log('\n4) Idempotencia: la misma carga otra vez\n');
  const otra = correr([...BASE, '--aplicar', '--usuario=' + USUARIO, '--referencia=CONTEO-2026-08']);
  ok('termina bien', otra.codigo === 0);
  ok('no encuentra ninguna diferencia', /No hay ninguna diferencia que cargar/.test(otra.salida));
  ok('no anadio movimientos', (await movimientos()).length === 3);
  ok('PC-01 sigue en 4', (await nivel(PC01, PRINCIPAL, 'PRODUCCION')) === 4);

  console.log('\n5) --ausentes=cero\n');
  const cero = correr([...BASE, '--ausentes=cero', '--aplicar', '--usuario=' + USUARIO, '--referencia=CIERRE']);
  ok('termina bien', cero.codigo === 0, cero.codigo ? cero.salida.slice(-400) : '');
  ok('ZP-02 pasa a 0', (await nivel(ZP02, PRINCIPAL, 'PRODUCCION')) === 0);
  ok('NG-05 pasa de -6 a 0', (await nivel(NG05, PRINCIPAL, 'PRODUCCION')) === 0);
  ok('PRUEBA sigue intacto en 99', (await nivel(PC01, PRINCIPAL, 'PRUEBA')) === 99);
  ok('y el de MR-09 en PRUEBA tambien', (await nivel(MR09, PRINCIPAL, 'PRUEBA')) === 12);
  ok('propone validar el CHECK al no quedar negativos', /VALIDATE CONSTRAINT/.test(cero.salida));

  console.log('\n6) Usuario de otra empresa\n');
  await sembrar();
  const ajeno = correr([...BASE, '--aplicar', '--usuario=beto@beta.do']);
  ok('rechaza firmar con un usuario de otra empresa', ajeno.codigo === 1 && /no pertenece a la empresa/.test(ajeno.salida));
  ok('y no escribio nada', (await nivel(PC01, PRINCIPAL, 'PRODUCCION')) === -10);

  console.log('\n7) SKU duplicado dentro de la misma empresa\n');
  await db.execute(sql`UPDATE products SET sku = 'PC-01' WHERE id = ${MR09}::uuid`);
  const ambiguo = correr(BASE);
  ok('se planta en vez de elegir producto', ambiguo.codigo === 1 && /mas de un producto/.test(ambiguo.salida));
  await db.execute(sql`UPDATE products SET sku = 'MR-09' WHERE id = ${MR09}::uuid`);

  console.log('\n8) Cantidad ambigua en el CSV\n');
  writeFileSync(CSV, 'sku,cantidad_contada\nPC-01,1.000\n', 'utf8');
  const amb = correr(BASE);
  ok('rechaza "1.000" en vez de adivinar', amb.codigo === 1 && /es ambiguo/.test(amb.salida));

  console.log('\n9) Almacen de otra empresa\n');
  writeFileSync(CSV, 'sku,cantidad_contada\nPC-01,4\n', 'utf8');
  const otroAlm = correr(['--conteo=' + CSV, '--empresa=Alfa SRL', '--modo=PRODUCCION', '--almacen=' + CENTRAL]);
  ok('no acepta un almacen que no es de la empresa', otroAlm.codigo === 1 && /ningun almacen/.test(otroAlm.salida));

  unlinkSync(CSV);
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
