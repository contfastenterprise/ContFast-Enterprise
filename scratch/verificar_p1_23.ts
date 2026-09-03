/**
 * P1-23: el draft de factura reimplementaba a mano el mismo calculo que
 * InvoiceCalculator.calculateTotalsAndRetentions -- sin roundMoney por
 * linea ni taxCategory -- pudiendo diferir en centavos del total real al
 * emitir. Se reutiliza el mismo calculador que usa la emision real.
 *
 * Banco de solo-codigo.
 */
import { fuente, bloque } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const draft = fuente('src/app/api/v1/invoices/draft/route.ts');

ok('importa InvoiceCalculator', /import\s*\{\s*InvoiceCalculator\s*\}\s*from\s*'@\/services\/invoice\/invoiceCalculator'/.test(draft));
ok('importa el tipo IssueInvoiceInput', /import\s+type\s*\{\s*IssueInvoiceInput\s*\}\s*from\s*'@\/services\/invoice\/types'/.test(draft));

const cuerpoPost = bloque(draft, /export\s+async\s+function\s+POST/);
ok('se aislo el cuerpo de POST()', cuerpoPost.length > 0);

ok('llama a InvoiceCalculator.calculateTotalsAndRetentions con el input construido',
  /InvoiceCalculator\.calculateTotalsAndRetentions\(calculatorInput\)/.test(cuerpoPost));

// El calculo manual viejo ya no debe existir: ni el bucle a mano por linea
// (con el impuesto multiplicado ahi mismo), ni el mapa de resumen de
// impuestos construido a pulso.
ok('ya no queda el calculo manual por linea (lineTaxableAmount * line.taxRate)',
  !/lineTaxableAmount\s*\*\s*line\.taxRate/.test(cuerpoPost));
ok('ya no queda el taxSummaryMap armado a mano',
  !/taxSummaryMap/.test(cuerpoPost));

ok('el INSERT de la factura usa totals.subtotal/totalDiscount/totalTaxes/total',
  /subtotal:\s*totals\.subtotal\.toString\(\)/.test(cuerpoPost) &&
  /discount:\s*totals\.totalDiscount\.toString\(\)/.test(cuerpoPost) &&
  /totalTaxes:\s*totals\.totalTaxes\.toString\(\)/.test(cuerpoPost) &&
  /total:\s*totals\.total\.toString\(\)/.test(cuerpoPost));

ok('el INSERT de la factura tambien guarda totalRetained y totalNet (antes se quedaban en 0.00 por defecto)',
  /totalRetained:\s*totals\.totalRetained\.toString\(\)/.test(cuerpoPost) &&
  /totalNet:\s*totals\.totalNet\.toString\(\)/.test(cuerpoPost));

ok('las lineas se insertan desde totals.itemLines, no desde un arreglo armado a mano',
  /totals\.itemLines\.map\(/.test(cuerpoPost) && !/(?<!totals\.)\bitemLines\.map\(/.test(cuerpoPost));

ok('las lineas ahora guardan taxCategory (el calculo manual no lo tenia)',
  /taxCategory:\s*line\.taxCategory\s*\?\?\s*null/.test(cuerpoPost));

ok('los impuestos se insertan desde totals.taxesList, no desde un arreglo armado a mano',
  /totals\.taxesList\.map\(/.test(cuerpoPost) && !/(?<!totals\.)\btaxesList\.map\(/.test(cuerpoPost));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
