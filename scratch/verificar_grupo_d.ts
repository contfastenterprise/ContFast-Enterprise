/**
 * Grupo D: lecturas que devolvian datos de otra empresa.
 *
 * Dos vectores, los dos verificados a mano antes de tocar nada:
 *
 *   1. La ficha de producto de la TIENDA PUBLICA se identificaba solo por el
 *      UUID que va dentro del slug de la URL, y ese slug lo escribe el
 *      visitante. Superficie sin autenticar, y ademas indexable porque
 *      generateMetadata usa lo mismo para el <title>.
 *
 *   2. El arqueo de caja sacaba UUIDs por expresion regular del texto libre de
 *      los movimientos -- texto que escribe el usuario -- y los resolvia contra
 *      `invoices` sin filtrar por empresa. Metiendo el UUID de una factura
 *      ajena en la descripcion de un movimiento propio, su codigo acababa
 *      impreso en el PDF.
 */
import { db } from '../src/db';
import { sql, and, eq, inArray } from 'drizzle-orm';
import { invoices, customerReceiptApplied, accountsReceivable } from '../src/db/schema';
import { StorefrontProductService } from '../src/services/storefront/productService';

const A = '11111111-1111-1111-1111-111111111111'; // atacante
const B = '22222222-2222-2222-2222-222222222222'; // victima
const USER_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const PROD_B = 'dddddddd-0000-0000-0000-000000000004';
const PROD_A = 'dddddddd-0000-0000-0000-000000000001';
const FAC_B = 'aaaa9999-0000-0000-0000-00000000000b';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

async function main() {
  await db.execute(sql`DELETE FROM delivery_note_lines`);
  await db.execute(sql`DELETE FROM delivery_notes`);
  await db.execute(sql`DELETE FROM invoice_lines`);
  await db.execute(sql`DELETE FROM customer_receipt_applied`);
  await db.execute(sql`DELETE FROM customer_receipts`);
  await db.execute(sql`DELETE FROM accounts_receivable`);
  await db.execute(sql`DELETE FROM invoices`);
  await db.execute(sql`UPDATE products SET status='active'`);
  await db.execute(sql`INSERT INTO invoices (id,company_id,modo,user_id,ncf,ecf_type,total,codigo_factura)
    VALUES (${FAC_B}::uuid,${B}::uuid,'PRODUCCION',${USER_B}::uuid,'E310000000055','31',9000,'FAC-B-SECRETA')`);

  console.log('\n1) Tienda publica: la empresa A pide el producto de la empresa B\n');
  // El slug es "texto--uuid"; el visitante controla el UUID entero.
  const slugAjeno = `lo-que-sea--${PROD_B}`;
  const ajeno = await StorefrontProductService.getProductBySlug(slugAjeno, A);
  ok('la tienda de A no devuelve el producto de B', ajeno === null, ajeno ? `devolvio "${ajeno.name}"` : 'null');

  const propio = await StorefrontProductService.getProductBySlug(`x--${PROD_A}`, A);
  ok('la tienda de A si devuelve su propio producto', propio !== null, propio ? propio.name : 'null');

  const suyo = await StorefrontProductService.getProductBySlug(slugAjeno, B);
  ok('y la tienda de B si devuelve el suyo', suyo !== null, suyo ? suyo.name : 'null');

  console.log('\n2) Arqueo de caja: A mete el UUID de una factura de B en un movimiento\n');
  // Replica exacta de las dos consultas de la ruta de impresion, tal como
  // quedan ahora: el array de ids sale de texto que escribe el usuario.
  const idsDelTextoLibre = [FAC_B];

  const directas = await db
    .select({ id: invoices.id, codigoFactura: invoices.codigoFactura })
    .from(invoices)
    .where(and(
      inArray(invoices.id, idsDelTextoLibre),
      eq(invoices.companyId, A),
      eq(invoices.modo, 'PRODUCCION')
    ));
  ok('no resuelve el codigo de la factura ajena', directas.length === 0,
    directas.length ? JSON.stringify(directas) : 'sin resultados');

  const porRecibo = await db
    .select({ receiptId: customerReceiptApplied.receiptId, codigoFactura: invoices.codigoFactura })
    .from(customerReceiptApplied)
    .innerJoin(accountsReceivable, eq(customerReceiptApplied.arId, accountsReceivable.id))
    .innerJoin(invoices, eq(accountsReceivable.invoiceId, invoices.id))
    .where(and(
      inArray(customerReceiptApplied.receiptId, idsDelTextoLibre),
      eq(accountsReceivable.companyId, A),
      eq(invoices.companyId, A),
      eq(invoices.modo, 'PRODUCCION')
    ));
  ok('tampoco por la via del recibo', porRecibo.length === 0, JSON.stringify(porRecibo));

  // Control: la misma consulta desde la empresa duena SI resuelve.
  const desdeB = await db
    .select({ codigoFactura: invoices.codigoFactura })
    .from(invoices)
    .where(and(
      inArray(invoices.id, idsDelTextoLibre),
      eq(invoices.companyId, B),
      eq(invoices.modo, 'PRODUCCION')
    ));
  ok('pero la empresa duena si ve su propia factura',
    desdeB.length === 1 && desdeB[0].codigoFactura === 'FAC-B-SECRETA', JSON.stringify(desdeB));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
