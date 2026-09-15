import { crudo as crudoCrudo } from './_fuente';

// Normaliza CRLF -> LF antes de comparar: igual que en lotes anteriores.
const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean, d = ''): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
}

function contarAny(s: string): number {
  return (s.match(/: any/g) || []).length;
}

function sinAny(ruta: string): void {
  const n = contarAny(crudo(ruta));
  ok(`${ruta}: sin ': any' remanente`, n === 0, `quedan ${n}`);
}

function contarOcurrencias(s: string, sub: string): number {
  return s.split(sub).length - 1;
}

// ═══════════════════ P1-24 lote 12: cierra src/services (32) + src/middleware (2) ═══════════════════
// El ultimo pendiente de la campania ': any' -- despues de este lote,
// src/app/api/**, src/repositories y src/middleware quedan en 0.

const MSC = 'src/services/dgii/msellerClient.ts';

// 1. Interfaz MensajeDgii
//  Lote 117: ffc5dcf llevo la lectura de `mensajes` -- y con ella esta interfaz
//  -- a estadoEnvio.ts (motivoDgii), que comparten el cliente y la ruta batch.
//  Las secciones 1, 7 y 8 se fijan alli y en el uso desde el cliente.
const EST = 'src/services/dgii/estadoEnvio.ts';
ok(
  'msellerClient: interfaz MensajeDgii definida',
  crudo(EST).includes('export interface MensajeDgii {\n  codigo?: number;\n  valor?: string;\n}')
);

// 2. rawResponse tipado
ok('msellerClient: rawResponse?: unknown (3x)', contarOcurrencias(crudo(MSC), 'rawResponse?: unknown;') === 3);
ok('msellerClient: sin rawResponse?: any', !crudo(MSC).includes('rawResponse?: any;'));

// 3. data?: unknown en getDocumentsStatusBatch
ok('msellerClient: data?: unknown en batch', crudo(MSC).includes('      data?: unknown;'));

// 4. catches tipados unknown
ok('msellerClient: catch (err: unknown) x4', contarOcurrencias(crudo(MSC), 'catch (err: unknown) {') === 4);
ok('msellerClient: sin catch (err: any)', !crudo(MSC).includes('catch (err: any)'));

// 5. authenticate(): cast inline .name, relanza err intacto
ok(
  'msellerClient: authenticate() cast inline .name + throw err intacto',
  //  ec7dac2 (lote 101) solo cambio la sangria; se admite cualquiera.
  /if \(\(err as Error\)\.name === 'AbortError'\) \{\s*\n\s*throw new Error\('Timeout de autenticación con mSeller \(el servidor no responde\)\.'\);\s*\n\s*\}\s*\n\s*throw err;/.test(crudo(MSC))
);

// 6. sendDocument/getDocumentStatus/getDocumentsStatusBatch: CAST
ok('msellerClient: const e = err as Error; (3x)', contarOcurrencias(crudo(MSC), 'const e = err as Error;') === 3);
ok(
  'msellerClient: sendDocument catch usa e.name/e.message',
  crudo(MSC).includes(
    "message: 'timeout - El servidor de integración mSeller/DGII tardó demasiado en responder.',\n" +
      '        };\n' +
      '      }\n' +
      '      return {\n' +
      '        success: false,\n' +
      "        message: e.message || 'FetchError - Error de comunicación con mSeller',"
  )
);
ok(
  'msellerClient: getDocumentStatus catch usa e.name/e.message',
  crudo(MSC).includes("message: e.message || 'FetchError - Error al obtener el estatus.',")
);
ok(
  'msellerClient: getDocumentsStatusBatch catch usa e.name/e.message',
  crudo(MSC).includes("message: e.message || 'FetchError - Error al obtener el estatus en lote.',")
);

// 7. dgiiMessages tipado
//  Los dos sitios (sendDocument y getDocumentStatus) ya no arman dgiiMessages
//  por su cuenta: llaman a motivoDgii(raw), con raw `unknown`.
ok(
  'msellerClient: dgiiMessages tipado en sendDocument()',
  /import \{[^}]*\bmotivoDgii\b[^}]*\} from '\.\/estadoEnvio'/.test(crudo(MSC))
);
ok(
  'msellerClient: dgiiMessages tipado en getDocumentStatus()',
  contarOcurrencias(crudo(MSC), 'motivoDgii(raw)') === 2
);

// 8. callbacks sin : any
ok("msellerClient: sin '(m: any)' remanente", !crudo(MSC).includes('(m: any)') && !crudo(EST).includes('(m: any)'));
ok(
  'msellerClient: map de mensaje de rechazo sin any',
  /export function motivoDgii\(raw: unknown\): string \| null \{/.test(crudo(EST))
);
ok(
  'msellerClient: filter de dgiiMessages sin any (2x)',
  contarAny(crudo(EST)) === 0
);
ok(
  'msellerClient: map de validMsgs sin any (2x)',
  !/\bdgiiMessages\b|\bvalidMsgs\b/.test(crudo(MSC))
);

// 9. constructor de ECFPayload
for (const [variable, tipo] of [
  ['idDoc', 'Record<string, unknown>'],
  ['encabezado', 'Record<string, unknown>'],
  ['totales', 'Record<string, number>'],
  ['ecfObj', 'Record<string, unknown>'],
  ['item', 'Record<string, unknown>'],
  ['refItem', 'Record<string, unknown>'],
  ['pagina', 'Record<string, number>'],
  ['payload', 'Record<string, unknown>'],
] as const) {
  const src = crudo(MSC);
  const presente =
    src.includes(`let ${variable}: ${tipo};`) ||
    src.includes(`const ${variable}: ${tipo} = {`) ||
    src.includes(`const ${variable}: ${tipo} = {};`);
  ok(`msellerClient: ${variable} tipado como ${tipo}`, presente);
}

sinAny(MSC);

// ─────────────────── documentService.ts / emailService.ts ───────────────────
//  Retirados en el lote 100 (62c43f8) con el modulo de documentos. Leerlos
//  hacia reventar este banco con ENOENT antes de llegar al final. Lote 117.

// ─────────────────── ecfValidator.ts ───────────────────
const EV = 'src/services/ecfValidator.ts';
ok('ecfValidator: catch (err: unknown)', crudo(EV).includes('catch (err: unknown) {'));
ok('ecfValidator: cast inline .message (2x)', contarOcurrencias(crudo(EV), '${(err as Error).message}') === 2);
sinAny(EV);

// ─────────────────── invoiceValidator.ts ───────────────────
const IV = 'src/services/invoice/invoiceValidator.ts';
ok(
  'invoiceValidator: error tipado con status/code/validationErrors',
  crudo(IV).includes(
    'const err: Error & { status?: number; code?: string; validationErrors?: typeof preCheck.errors } ='
  )
);
sinAny(IV);

// ─────────────────── reportQueue.ts ───────────────────
const RQ = 'src/services/jobs/reportQueue.ts';
//  d14986b borro la cola de informes, y con ella `filters`: no queda campo que
//  tipar. Se mantiene que el fichero no tenga `any`. Lote 117.
sinAny(RQ);

// ─────────────────── kmsService.ts ───────────────────
const KS = 'src/services/kmsService.ts';
ok(
  'kmsService: catch trivial unknown (err no se usa)',
  crudo(KS).includes('} catch (err: unknown) {\n      throw new Error(')
);
sinAny(KS);

// ─────────────────── excelGenerator.ts ───────────────────
const EG = 'src/services/print/excelGenerator.ts';
ok(
  'excelGenerator: data/totals tipados Record<string, unknown>',
  crudo(EG).includes(
    'data: Record<string, unknown>[], totals?: Record<string, unknown>): Promise<Buffer>'
  )
);
sinAny(EG);

// ─────────────────── storageService.ts ───────────────────
const SS = 'src/services/storageService.ts';
ok(
  'storageService: catch trivial unknown (err solo se loguea)',
  //  eb3dcfc cambio el cuerpo (aviso en vez de error); el tipado sigue.
  crudo(SS).includes('} catch (err: unknown) {') && !/catch\s*\(\s*\w+\s*:\s*any\b/.test(crudo(SS))
);
sinAny(SS);

// ─────────────────── quoteService.ts ───────────────────
const QS = 'src/services/storefront/quoteService.ts';
//  f7b5cd8 le dio tipo explicito a quoteLinesData.
ok('quoteService: quoteLinesData sin anotacion any[]', /const quoteLinesData: \{/.test(crudo(QS)));
ok('quoteService: sin quoteLinesData: any[]', !crudo(QS).includes('quoteLinesData: any[]'));
sinAny(QS);

// ─────────────────── middleware/auth.ts ───────────────────
const MA = 'src/middleware/auth.ts';
ok('auth.ts: assigned.map sin any', crudo(MA).includes('return assigned.map((a) => a.warehouseId);'));
ok(
  'auth.ts: catch unknown + cast inline .name',
  crudo(MA).includes(
    '} catch (err: unknown) {\n      // If access token is expired, proceed to refresh token validation\n' +
      "      if ((err as Error).name !== 'TokenExpiredError') {"
  )
);
sinAny(MA);

// ─────────────────── invoiceSubmissionService.ts ───────────────────
const ISS = 'src/services/invoice/invoiceSubmissionService.ts';
ok(
  'invoiceSubmissionService: msellerResponsePayload tipado unknown',
  crudo(ISS).includes('let msellerResponsePayload: unknown = null;')
);
sinAny(ISS);

// ─────────────────── types.ts ───────────────────
const TY = 'src/services/invoice/types.ts';
ok(
  'types.ts: DgiiSubmissionResult.msellerResponsePayload tipado unknown',
  crudo(TY).includes('msellerResponsePayload: unknown;')
);
sinAny(TY);

// ─────────────────── invoiceService.ts (ajuste consecuente) ───────────────────
const ISVC = 'src/services/invoiceService.ts';
ok(
  'invoiceService: cast local para leer signedXml de unknown',
  crudo(ISVC).includes(
    'const raw = submission.msellerResponsePayload as { signedXml?: string; summarySignedXml?: string };'
  )
);

// ─────────────────── xml/route.ts (ajuste consecuente) ───────────────────
const XR = 'src/app/api/v1/invoices/[id]/xml/route.ts';
ok(
  'xml/route: cast local para leer signedXml de unknown',
  crudo(XR).includes('const raw = statusRes.rawResponse as { signedXml?: string; summarySignedXml?: string };')
);

// ─────────────────── dgii-status/batch/route.ts (ajuste consecuente) ───────────────────
const BR = 'src/app/api/v1/ecf/dgii-status/batch/route.ts';
ok(
  'dgii-status/batch: cast local para leer dgiiResponse de unknown',
  //  ffc5dcf: ya no hay cast local; `result.data` va directo a lecturas con
  //  `raw: unknown` (motivoDgii entre ellas). Lote 117.
  /\bmotivoDgii\(result\.data\)/.test(crudo(BR)) && contarAny(crudo(BR)) === 0
);

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
