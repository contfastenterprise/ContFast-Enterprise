/**
 * P1-24: 'tx: any' / ': any' sistematico (lote 4/N).
 *
 * Cubre src/services/pdfGenerator.ts (10), src/services/quoteService.ts (5),
 * src/services/invoice/invoiceFileGenerator.ts (7) y
 * src/services/invoice/invoiceSubmissionService.ts (5) -- 21 de las 27
 * ocurrencias de estos 4 archivos quedan resueltas; las 6 restantes se dejan
 * marcadas a proposito (ver mas abajo).
 *
 * Ademas, fix de terreno fuera del lote declarado:
 * src/repositories/companyRepository.ts::getSettings() no tenia ningun
 * `: any` literal, pero su unica rama `return JSON.parse(cached);` sin tipo
 * contaminaba de `any` el retorno INFERIDO de toda la funcion -- lo cual
 * volvia inutil cualquier `ReturnType<typeof getSettings>` corriente abajo
 * (invoiceFileGenerator.ts e invoiceSubmissionService.ts dependen de ese
 * tipo para sus parametros `settings`). Se le puso tipo de retorno explicito
 * y se aserto esa rama contra el tipo de la tabla.
 *
 * Se dejan `: any` marcadas (no arregladas, con motivo):
 * - pdfGenerator.ts: generateWindowBreakdown/generateGlassCutting (3
 *   ocurrencias) -- JSON crudo sin validar de request.json() en
 *   tools/print/route.ts, sin schema contra el cual tipar.
 * - invoiceFileGenerator.ts: itemLines: any[] (2 ocurrencias, parametro +
 *   callback) -- viene de CalculatedTotals.itemLines: any[] en
 *   services/invoice/types.ts, fuera de este lote; tiparlo aqui sin arreglar
 *   el origen seria cosmetico.
 * - invoiceSubmissionService.ts: msellerResponsePayload: any (1) -- espeja
 *   MSellerSendResponse.rawResponse?: any en dgii/msellerClient.ts, fuera de
 *   este lote (el archivo mas grande, 21 ocurrencias, queda para el final).
 *
 * estadoEnvio.ts (6) y codigoSeguridad.ts (5 lineas / 6 anotaciones) NO se
 * tocaron en este lote -- son parsers genuinamente dinamicos de
 * respuestas SOAP/XML de la DGII/mSeller, con formas que cambian segun el
 * endpoint; el propio comentario de cabecera de estadoEnvio.ts lo explica.
 *
 * Banco de solo-codigo.
 */
import { fuente, crudo } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

// ═══════════════════ pdfGenerator.ts ═══════════════════
console.log('\n=== pdfGenerator.ts ===\n');

const pdf = fuente('src/services/pdfGenerator.ts');
const pdfCrudo = crudo('src/services/pdfGenerator.ts');

ok("quedan exactamente 3 ocurrencias de ': any' (10 antes -- generateWindowBreakdown/generateGlassCutting, marcadas a proposito)",
  (pdfCrudo.match(/: any/g) || []).length === 3,
  `hay ${(pdfCrudo.match(/: any/g) || []).length}`);

ok('importa ReportRepository, HRRepository y chartOfAccounts solo como tipo',
  /import type \{ ReportRepository \} from '@\/repositories\/reportRepository';/.test(pdf) &&
  /import type \{ HRRepository \} from '@\/repositories\/hrRepository';/.test(pdf) &&
  /import type \{ chartOfAccounts \} from '@\/db';/.test(pdf));

ok('generateIncomeStatement: data tipado con el retorno real de ReportRepository.getIncomeStatement',
  /data: Awaited<ReturnType<typeof ReportRepository\.getIncomeStatement>>/.test(pdf));

ok('generateBalanceSheet: data tipado con el retorno real de ReportRepository.getBalanceSheet',
  /data: Awaited<ReturnType<typeof ReportRepository\.getBalanceSheet>>/.test(pdf));

ok('generateARStatement: data tipado con el retorno real de ReportRepository.getARStatement',
  /data: Awaited<ReturnType<typeof ReportRepository\.getARStatement>>/.test(pdf));

ok('drawSection: accounts tipado como fila de chartOfAccounts + net (cubre los 6 arrays que le pasan: revenue/cost/expense/asset/liability/equity)',
  /private static drawSection\(doc: typeof PDFDocument, title: string, accounts: \(typeof chartOfAccounts\.\$inferSelect & \{ net: number \}\)\[\], total: number, startY: number\): number \{/.test(pdf));

ok('generatePayrollReceipts: details tipado con el retorno real de HRRepository.findPayrollDetails',
  /details: Awaited<ReturnType<typeof HRRepository\.findPayrollDetails>>/.test(pdf));

ok('generateSettlementReceipt: employee/calculation tipados con literales verificados contra su unico caller (settlements/[id]/print/route.ts)',
  /employee: \{ employeeCode: string; firstName: string; lastName: string; cedula: string; hireDate: Date \| string \}/.test(pdf) &&
  /calculation: \{ yearsOfService: number; monthsOfService: number; dailyRate: number; preavisoDays: number; cesantiaDays: number; vacacionesDays: number; preaviso: number; cesantia: number; vacaciones: number; navidad: number \}/.test(pdf));

ok('generateWindowBreakdown y generateGlassCutting quedan `any[]` a proposito (JSON crudo sin schema desde tools/print/route.ts)',
  /static generateWindowBreakdown\(company: CompanyInfo, data: any\[\]/.test(pdf) &&
  /static generateGlassCutting\(company: CompanyInfo, sheets: any\[\]/.test(pdf));

// ═══════════════════ companyRepository.ts ═══════════════════
console.log('\n=== companyRepository.ts (fix de terreno, fuera del lote declarado) ===\n');

const compRepo = fuente('src/repositories/companyRepository.ts');

ok('getSettings: tipo de retorno explicito (ya no se infiere `any` por la rama JSON.parse)',
  /static async getSettings\(companyId: string\): Promise<typeof companySettings\.\$inferSelect \| undefined> \{/.test(compRepo));

ok('la rama del cache asertada contra el tipo de la tabla',
  /return JSON\.parse\(cached\) as typeof companySettings\.\$inferSelect;/.test(compRepo));

// ═══════════════════ quoteService.ts ═══════════════════
console.log('\n=== quoteService.ts ===\n');

const quote = fuente('src/services/quoteService.ts');
const quoteCrudo = crudo('src/services/quoteService.ts');

ok("0 ocurrencias de ': any' (5 antes)",
  (quoteCrudo.match(/: any/g) || []).length === 0,
  `quedan ${(quoteCrudo.match(/: any/g) || []).length}`);

ok("importa SQL de drizzle-orm (tipo)",
  /import \{ eq, and, sql, type SQL \} from 'drizzle-orm';/.test(quote));

ok('los 2 taxInserts (createQuote y updateQuote) tipados con quoteTaxes.$inferInsert (solo los 3 campos que arma el propio codigo)',
  (quote.match(/const taxInserts: Pick<typeof quoteTaxes\.\$inferInsert, 'taxType' \| 'rate' \| 'amount'>\[\] = \[\];/g) || []).length === 2);

ok('whereClause tipado SQL | undefined (antes any), y el cast `as any` desaparecio del segundo assignment',
  /let whereClause: SQL \| undefined = and\(eq\(quotes\.companyId, companyId\), eq\(quotes\.modo, modo\)\);/.test(quote) &&
  /whereClause = and\(whereClause, eq\(quotes\.status, status\)\);/.test(quote) &&
  !/whereClause = and\(whereClause, eq\(quotes\.status, status\)\) as any;/.test(quote));

ok('los callbacks .filter()/.map() sobre quote.taxes ya no llevan anotacion any redundante (el array ya viene tipado de su propio select)',
  /\.filter\(\(t\) => String\(t\.taxType\)\.toUpperCase\(\) === 'ITBIS'\)/.test(quote) &&
  /\.map\(\(t\) => Number\(t\.rate\)\)\)\]/.test(quote));

// ═══════════════════ invoiceFileGenerator.ts ═══════════════════
console.log('\n=== invoiceFileGenerator.ts ===\n');

const ifg = fuente('src/services/invoice/invoiceFileGenerator.ts');
const ifgCrudo = crudo('src/services/invoice/invoiceFileGenerator.ts');

ok("quedan exactamente 2 ocurrencias de ': any' (7 antes -- itemLines: any[], parametro y callback, marcadas a proposito)",
  (ifgCrudo.match(/: any/g) || []).length === 2,
  `hay ${(ifgCrudo.match(/: any/g) || []).length}`);

ok('importa CompanyRepository solo como tipo',
  /import type \{ CompanyRepository \} from '@\/repositories\/companyRepository';/.test(ifg));

ok('generateFilesAndSendEmail: company/settings tipados con el retorno real de CompanyRepository (company: NonNullable, ya se null-checkea en el unico caller)',
  /company: NonNullable<Awaited<ReturnType<typeof CompanyRepository\.getProfile>>>,\s*\n\s*settings: Awaited<ReturnType<typeof CompanyRepository\.getSettings>>,/.test(ifg));

ok('dbProducts tipado con las columnas reales del select que lo llena (id/sku/unitOfMeasure/categoryName)',
  /let dbProducts: \{ id: string; sku: string \| null; unitOfMeasure: string \| null; categoryName: string \| null \}\[\] = \[\];/.test(ifg));

ok('catch (pdfErr): unknown (solo se usa en un Logger.error, sin acceder a .message)',
  /\} catch \(pdfErr: unknown\) \{/.test(ifg));

ok('processPostEmission: settings tipado igual que en generateFilesAndSendEmail (mismo caller, misma variable)',
  /settings: Awaited<ReturnType<typeof CompanyRepository\.getSettings>>,\s*\n\s*itemLines: any\[\]/.test(ifg));

// ═══════════════════ invoiceSubmissionService.ts ═══════════════════
console.log('\n=== invoiceSubmissionService.ts ===\n');

const iss = fuente('src/services/invoice/invoiceSubmissionService.ts');
const issCrudo = crudo('src/services/invoice/invoiceSubmissionService.ts');

ok("queda exactamente 1 ocurrencia de ': any' (5 antes -- msellerResponsePayload, marcada a proposito)",
  (issCrudo.match(/: any/g) || []).length === 1,
  `hay ${(issCrudo.match(/: any/g) || []).length}`);

ok('importa CompanyRepository solo como tipo',
  /import type \{ CompanyRepository \} from '@\/repositories\/companyRepository';/.test(iss));

ok('submitToDgii: company/settings tipados igual que invoiceFileGenerator.ts (mismo caller: invoiceService.ts)',
  /company: NonNullable<Awaited<ReturnType<typeof CompanyRepository\.getProfile>>>,\s*\n\s*settings: Awaited<ReturnType<typeof CompanyRepository\.getSettings>>,/.test(iss));

ok('el .catch() de credencialesMseller: err tipado unknown, con cast puntual a Error para leer .message',
  /\.catch\(\(err: unknown\) => \{/.test(iss) &&
  /\{ entorno, error: \(err as Error\)\?\.message \}/.test(iss));

ok('el catch principal: err tipado unknown (ya narrowed por instanceof antes de usarse), con cast puntual a Error donde se lee .message',
  /\} catch \(err: unknown\) \{/.test(iss) &&
  /ncf, error: \(err as Error\)\?\.message,/.test(iss) &&
  /dgiiMessage = mensajeDesconocido\(\(err as Error\)\?\.message \?\? ''\);/.test(iss));

ok('msellerResponsePayload queda `any` a proposito (espeja MSellerSendResponse.rawResponse?: any en msellerClient.ts, fuera de este lote)',
  /let msellerResponsePayload: any = null;/.test(iss));

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
