/**
 * Reproduccion del fallo del ITBIS: se elige otra tasa y se imprime al 18%.
 *
 * No se arregla nada aqui. Solo se recorre la cadena real, etapa por etapa, con
 * el codigo del proyecto, para saber DONDE se pierde la tasa. Son tres etapas y
 * cada una tiene su propio sospechoso:
 *
 *   1. El navegador, al montar el cuerpo de la peticion:  Number(l.taxRate || 0.18)
 *   2. El calculador, al agrupar por tasa:                InvoiceCalculator
 *   3. La plantilla de impresion, al elegir la tasa:      ...?.rate ? ... : 0.18
 */
import { InvoiceCalculator } from '../src/services/invoice/invoiceCalculator';

const TASAS = [
  { etiqueta: '18% ITBIS', valor: 0.18 },
  { etiqueta: '16% ITBIS', valor: 0.16 },
  { etiqueta: '0% Exento', valor: 0.00 },
];

// --- Etapa 1: exactamente lo que hace el navegador antes de enviar.
//     (src/app/dashboard/invoices/page.tsx, lineas 738 y 975)
const comoEnviaElNavegador = (taxRate: number) => Number(taxRate ?? 0.18);  // corregido: `??`

// --- Etapa 3: exactamente lo que hace la plantilla al imprimir.
//     (src/utils/templates/documentTemplates.ts, lineas 254-256)
const comoImprimeLaPlantilla = (taxes: any[]) => {
  const encontrado = (taxes || []).find(
    (t: any) => t.taxType === 'ITBIS' || t.taxType?.toLowerCase().includes('itbis'));
  return encontrado?.rate != null ? Number(encontrado.rate) / 100 : 0.18;  // corregido
};

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

console.log('\nCADENA COMPLETA, TASA POR TASA\n');
console.log('  elegida     -> navegador -> calculador guarda -> plantilla imprime');
console.log('  ' + '-'.repeat(66));

let fallos = 0;

for (const t of TASAS) {
  // 1. Navegador
  const enviada = comoEnviaElNavegador(t.valor);

  // 2. Calculador (el codigo real)
  const totales = InvoiceCalculator.calculateTotalsAndRetentions({
    lines: [{ productId: 'p1', productName: 'Puerta', quantity: 1, unitPrice: 1000, discount: 0, taxRate: enviada }],
  } as any);
  const guardada = totales.taxesList.length ? Number(totales.taxesList[0].rate) : null;

  // 3. Plantilla
  const impresa = comoImprimeLaPlantilla(totales.taxesList);

  const correcto = Math.abs(impresa - t.valor) < 1e-9;
  if (!correcto) fallos++;

  console.log(
    `  ${correcto ? 'OK  ' : 'MAL '} ${t.etiqueta.padEnd(10)} -> ${pct(enviada).padEnd(9)} -> ` +
    `${(guardada === null ? 'sin fila' : guardada + '%').padEnd(18)} -> ${pct(impresa)}` +
    (correcto ? '' : `   <-- deberia imprimir ${pct(t.valor)}`)
  );
}

console.log('\n\nDONDE SE PIERDE, ETAPA POR ETAPA\n');

for (const t of TASAS) {
  const enviada = comoEnviaElNavegador(t.valor);
  if (Math.abs(enviada - t.valor) > 1e-9) {
    console.log(`  ${t.etiqueta}: el NAVEGADOR ya la cambia a ${pct(enviada)} antes de enviarla.`);
    console.log(`     Causa: \`Number(l.taxRate || 0.18)\` -- en JavaScript 0 es falso,`);
    console.log(`     asi que la tasa 0 cae en el valor por defecto.\n`);
    continue;
  }
  const totales = InvoiceCalculator.calculateTotalsAndRetentions({
    lines: [{ productId: 'p1', productName: 'Puerta', quantity: 1, unitPrice: 1000, discount: 0, taxRate: enviada }],
  } as any);
  const guardada = totales.taxesList.length ? Number(totales.taxesList[0].rate) : null;
  const impresa = comoImprimeLaPlantilla(totales.taxesList);
  if (Math.abs(impresa - t.valor) > 1e-9) {
    console.log(`  ${t.etiqueta}: llega bien al calculador (guarda ${guardada}%),`);
    console.log(`     pero la PLANTILLA imprime ${pct(impresa)}.`);
    console.log(`     Causa: \`encontrado?.rate ? ... : 0.18\` -- mismo problema, rate 0 es falso.\n`);
  } else {
    console.log(`  ${t.etiqueta}: llega intacta hasta la impresion.\n`);
  }
}

// --- Mezcla de tasas en la misma factura.
console.log('\nUNA FACTURA CON DOS TASAS DISTINTAS\n');
const mezcla = InvoiceCalculator.calculateTotalsAndRetentions({
  lines: [
    { productId: 'p1', productName: 'Gravado 18', quantity: 1, unitPrice: 1000, discount: 0, taxRate: 0.18 },
    { productId: 'p2', productName: 'Gravado 16', quantity: 1, unitPrice: 1000, discount: 0, taxRate: 0.16 },
  ],
} as any);
console.log('  el calculador guarda:', JSON.stringify(mezcla.taxesList));
console.log('  total de impuestos  :', mezcla.totalTaxes, '(correcto: 180 + 160 = 340)');
const impresaMezcla = comoImprimeLaPlantilla(mezcla.taxesList);
console.log(`  la plantilla aplica ${pct(impresaMezcla)} a TODAS las lineas,`);
console.log('  porque `invoice_lines` no guarda la tasa de cada linea.');
console.log('  Columnas de invoice_lines: id, invoice_id, product_id, quantity,');
console.log('  unit_price, discount, subtotal, total, warehouse_id -- ninguna de tasa.');

console.log(`\n${fallos === 0 ? 'Ningun fallo reproducido' : `${fallos} tasa(s) se imprimen mal`}\n`);
