/**
 * Lote 264, contra una base -- el servidor no deja facturar por debajo del costo con el descuento.
 *
 * Integracion: corre en la base DESECHABLE (scratch/bancos_db), con candado. Ejecuta
 * `InvoiceDbBooker.preFlightValidations` -- la puerta por la que pasa toda emision -- con los totales
 * de la calculadora de verdad. Venta por transferencia y sin cliente: lo unico que se comprueba ahi
 * es el producto y su costo, que es lo de este lote.
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import { InvoiceDbBooker } from '../src/services/invoice/invoiceDbBooker';
import { InvoiceCalculator } from '../src/services/invoice/invoiceCalculator';

const A = '11111111-1111-1111-1111-111111111111';
const P = '26400000-0000-4000-8000-000000000001';

let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const exige = (t: string, c: boolean) => { if (!c) throw new Error(`PRECONDICION ROTA: ${t}`); console.log(`  pre   ${t}`); };

/** Lo que contesta la validacion: `null` si deja pasar, o el motivo si rechaza. */
async function validar(unitPrice: number, discount: number, ecfType = '32'): Promise<string | null> {
  const data = {
    companyId: A, modo: 'PRODUCCION', userId: 'x', ecfType, paymentType: 'transfer',
    lines: [{ productId: P, productName: 'Puerta 264', quantity: 2, unitPrice, discount, taxRate: 0.18 }],
    retentions: [],
  };
  const totals = InvoiceCalculator.calculateTotalsAndRetentions(data as never);
  try {
    await InvoiceDbBooker.preFlightValidations(data as never, totals);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

async function main() {
  console.log('\n0) Precondiciones\n');
  exige('la empresa A existe', ((await db.execute(sql`SELECT 1 FROM companies WHERE id = ${A}::uuid`)) as unknown as unknown[]).length === 1);
  await db.execute(sql`DELETE FROM products WHERE id = ${P}::uuid`);
  await db.execute(sql`INSERT INTO products (id, company_id, name, sku, cost, price, price_consumidor, price_mayorista, price_proveedor)
    VALUES (${P}::uuid, ${A}::uuid, 'Puerta 264', 'P-264', 90.00, 120.00, 112.50, 105.88, 100.00)`);
  exige('el producto de costo 90 esta sembrado', true);

  console.log('\n1) Con descuento\n');
  const bajo = await validar(100, 20);
  ok('precio 100 con 20 de descuento (80) sobre costo 90: se RECHAZA', bajo !== null, String(bajo));
  ok('  y el motivo dice el precio con descuento y el costo', !!bajo && bajo.includes('con descuento') && bajo.includes('RD$ 80.00') && bajo.includes('RD$ 90.00'), String(bajo));

  console.log('\n2) Lo que no cambia (invariantes)\n');
  invariante('precio 100 con 5 de descuento (95): pasa', (await validar(100, 5)) === null);
  invariante('justo en el costo (100 - 10 = 90): pasa', (await validar(100, 10)) === null);
  invariante('sin descuento y por debajo (85): se rechaza, como siempre', (await validar(85, 0)) !== null);
  invariante('una nota de credito (34) no se frena por el costo', (await validar(100, 20, '34')) === null);

  await db.execute(sql`DELETE FROM products WHERE id = ${P}::uuid`);
  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S), ${rotas} invariante(s) rota(s)`}`);
  setTimeout(() => process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1), 300);
}

main().catch((e) => { console.error(e); process.exit(2); });
