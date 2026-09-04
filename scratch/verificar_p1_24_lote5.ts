/**
 * P1-24: ': any' sistematico (lote 5/N) -- cierre del subsistema invoice/*.
 *
 * Cubre src/services/invoice/types.ts (4), invoiceCalculator.ts (2),
 * invoiceFileGenerator.ts (2 -- las que habian quedado marcadas en el lote 4)
 * e invoiceService.ts (2) -- 9 de las 10 ocurrencias resueltas.
 *
 * La raiz de todo: CalculatedTotals.itemLines/taxesList/calculatedRetentions
 * eran `any[]`, lo que obligaba a cada consumidor (invoiceFileGenerator.ts,
 * invoiceDbBooker.ts, invoiceSubmissionService.ts) a re-anotar sus propios
 * `any` corriente abajo. Se definieron 3 interfaces nuevas en types.ts
 * (InvoiceItemLine, InvoiceTaxLine, CalculatedRetentionLine) leyendo el
 * objeto literal exacto que arma invoiceCalculator.ts en cada .push(), y se
 * verificaron campo por campo contra CreateInvoiceInput en
 * invoiceRepository.ts (que ya tenia estas mismas formas tipadas de forma
 * independiente) y contra cada consumidor real.
 *
 * Con itemLines tipado, dos "any" que habian quedado marcados en el lote 4
 * (invoiceFileGenerator.ts::processPostEmission) se resuelven solos.
 *
 * invoiceService.ts: los 2 catch(err: any) pasan a unknown, con cast puntual
 * a Error donde se lee .message (el primero no lo necesita: solo lee
 * err.message DESPUES de angostar con `instanceof EcfRejectedError`).
 *
 * Limpieza adicional fuera del conteo de ': any' (no tiene los dos puntos,
 * asi que no formaba parte de las 172): el cast `(line as any).taxCategory`
 * en invoiceSubmissionService.ts quedaba redundante en cuanto itemLines tiene
 * un campo taxCategory real -- se quito.
 *
 * Se deja `: any` marcado a proposito (1, en dos sitios que apuntan al mismo
 * concepto): DgiiSubmissionResult.msellerResponsePayload en types.ts, y la
 * variable homonima en invoiceSubmissionService.ts (ya marcada en el lote
 * 4) -- ambas espejan MSellerSendResponse.rawResponse?: any en
 * msellerClient.ts, el archivo mas grande (21 ocurrencias), que queda para
 * el final.
 *
 * Banco de solo-codigo.
 */
import { fuente, crudo } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

// ═══════════════════ types.ts ═══════════════════
console.log('\n=== invoice/types.ts ===\n');

const types = fuente('src/services/invoice/types.ts');
const typesCrudo = crudo('src/services/invoice/types.ts');

ok("queda exactamente 1 ocurrencia de ': any' (4 antes -- msellerResponsePayload, marcada a proposito)",
  (typesCrudo.match(/: any/g) || []).length === 1,
  `hay ${(typesCrudo.match(/: any/g) || []).length}`);

ok('define InvoiceItemLine con los campos exactos que arma invoiceCalculator.ts',
  /export interface InvoiceItemLine \{\s*\n\s*productId: string;\s*\n\s*name: string;\s*\n\s*quantity: number;\s*\n\s*unitPrice: number;\s*\n\s*discount: number;\s*\n\s*subtotal: number;\s*\n\s*total: number;\s*\n\s*taxRate: number;\s*\n\s*taxCategory: 'exento' \| 'tasa_cero' \| null;\s*\n\s*warehouseId\?: string;\s*\n\s*\}/.test(types));

ok('define InvoiceTaxLine (taxType/rate/amount)',
  /export interface InvoiceTaxLine \{\s*\n\s*taxType: string;\s*\n\s*rate: number;\s*\n\s*amount: number;\s*\n\s*\}/.test(types));

ok('define CalculatedRetentionLine identico al shape ya usado en invoiceRepository.ts::CreateInvoiceInput.retentions',
  /export interface CalculatedRetentionLine \{\s*\n\s*retentionId\?: string;\s*\n\s*retentionName: string;\s*\n\s*retentionType: 'ITBIS' \| 'ISR' \| 'OTRA';\s*\n\s*retentionPercentage: number;\s*\n\s*retentionAmount: number;\s*\n\s*agentRnc\?: string;\s*\n\s*retentionDate\?: string;\s*\n\s*\}/.test(types));

ok('CalculatedTotals usa las 3 interfaces nuevas (ya no any[])',
  /itemLines: InvoiceItemLine\[\];/.test(types) &&
  /taxesList: InvoiceTaxLine\[\];/.test(types) &&
  /calculatedRetentions: CalculatedRetentionLine\[\];/.test(types));

ok('DgiiSubmissionResult.msellerResponsePayload queda `any` a proposito (espeja msellerClient.ts, fuera de este lote)',
  /msellerResponsePayload: any;/.test(types));

// ═══════════════════ invoiceCalculator.ts ═══════════════════
console.log('\n=== invoiceCalculator.ts ===\n');

const calc = fuente('src/services/invoice/invoiceCalculator.ts');
const calcCrudo = crudo('src/services/invoice/invoiceCalculator.ts');

ok("0 ocurrencias de ': any' (2 antes)",
  (calcCrudo.match(/: any/g) || []).length === 0,
  `quedan ${(calcCrudo.match(/: any/g) || []).length}`);

ok('importa InvoiceItemLine y CalculatedRetentionLine de types.ts',
  /import \{ IssueInvoiceInput, CalculatedTotals, InvoiceItemLine, CalculatedRetentionLine \} from '\.\/types';/.test(calc));

ok('itemLines y calculatedRetentions tipados con las interfaces nuevas',
  /const itemLines: InvoiceItemLine\[\] = \[\];/.test(calc) &&
  /const calculatedRetentions: CalculatedRetentionLine\[\] = \[\];/.test(calc));

// ═══════════════════ invoiceFileGenerator.ts ═══════════════════
console.log('\n=== invoiceFileGenerator.ts ===\n');

const ifg = fuente('src/services/invoice/invoiceFileGenerator.ts');
const ifgCrudo = crudo('src/services/invoice/invoiceFileGenerator.ts');

ok("0 ocurrencias de ': any' (2 antes, marcadas desde el lote 4 -- se resuelven solas al tipar itemLines en types.ts)",
  (ifgCrudo.match(/: any/g) || []).length === 0,
  `quedan ${(ifgCrudo.match(/: any/g) || []).length}`);

ok('importa InvoiceItemLine de types.ts',
  /import \{ IssueInvoiceInput, CalculatedTotals, DgiiSubmissionResult, InvoiceItemLine \} from '\.\/types';/.test(ifg));

ok('processPostEmission: itemLines tipado InvoiceItemLine[] (ya no any[]), y el callback .map ya no lleva anotacion any redundante',
  /itemLines: InvoiceItemLine\[\]\s*\n\s*\) \{/.test(ifg) &&
  /lines: itemLines\.map\(\(line\) => \(\{/.test(ifg));

// ═══════════════════ invoiceService.ts ═══════════════════
console.log('\n=== invoiceService.ts ===\n');

const svc = fuente('src/services/invoiceService.ts');
const svcCrudo = crudo('src/services/invoiceService.ts');

ok("0 ocurrencias de ': any' (2 antes)",
  (svcCrudo.match(/: any/g) || []).length === 0,
  `quedan ${(svcCrudo.match(/: any/g) || []).length}`);

ok('el catch de submitToDgii: err tipado unknown (err.message tras el narrowing de instanceof EcfRejectedError no necesita cast; err?.message en el else si)',
  /\} catch \(err: unknown\) \{\s*\n\s*if \(err instanceof EcfRejectedError\) \{/.test(svc) &&
  /`Fallo al enviar a la DGII: \$\{\(err as Error\)\?\.message \|\| 'error desconocido'\}`/.test(svc));

ok('el catch de executeDbTransaction: err tipado unknown, con cast puntual a Error para leer .message',
  /\} catch \(err: unknown\) \{\s*\n\s*await InvoiceDbBooker\.registrarNcfSinUsar\(/.test(svc) &&
  /`Enviado a la DGII pero no se pudo registrar la factura: \$\{\(err as Error\)\?\.message \|\| 'error desconocido'\}`/.test(svc));

// ═══════════════════ invoiceSubmissionService.ts (limpieza adicional) ═══════════════════
console.log('\n=== invoiceSubmissionService.ts (limpieza adicional, fuera del conteo) ===\n');

const iss = fuente('src/services/invoice/invoiceSubmissionService.ts');
const issCrudo = crudo('src/services/invoice/invoiceSubmissionService.ts');

ok("sigue en 1 ocurrencia de ': any' (msellerResponsePayload, sin cambios desde el lote 4)",
  (issCrudo.match(/: any/g) || []).length === 1,
  `hay ${(issCrudo.match(/: any/g) || []).length}`);

ok('el cast `(line as any).taxCategory` en el armado del payload de mSeller desaparecio (itemLines ya trae taxCategory tipado)',
  /taxCategory: line\.taxCategory \?\? null,/.test(iss) &&
  !/taxCategory: \(line as any\)\.taxCategory/.test(iss));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
