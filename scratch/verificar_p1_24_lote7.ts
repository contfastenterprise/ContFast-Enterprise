/**
 * P1-24: ': any' sistematico (lote 7/N) -- 10 archivos, 29 ocurrencias.
 *
 * A diferencia de lotes anteriores, el nucleo de este lote (estadoEnvio.ts,
 * codigoSeguridad.ts, desenlaceEnvio.ts -- 14 de las 29) NO se tipa con un
 * tipo conocido de una sola vez: son funciones que recorren RECURSIVAMENTE
 * una respuesta de mSeller/DGII de forma deliberadamente flexible (buscan
 * claves a distintas profundidades porque mSeller cambia la forma segun el
 * endpoint -- hasta reciben strings sueltos o `null` en los tests). Se tipan
 * con `unknown` en la firma, angostado a `Record<string, unknown>` justo
 * despues del `typeof === 'object'` que el codigo YA comprobaba en tiempo de
 * ejecucion -- no se inventa una forma, se declara honestamente lo que el
 * codigo siempre supo: que no sabe la forma de antemano.
 *
 * El resto sigue las convenciones de lotes anteriores:
 *   - `tx: any = db` -> `tx: typeof db = db` (credenciales.ts).
 *   - `catch (x: any)` -> `catch (x: unknown)`, con `(x as Error)?.message`
 *     o `(x as Error).message` donde se leia `.message` (se preserva si el
 *     original tenia o no el `?.`).
 *   - anotaciones `: any` redundantes en callbacks sobre resultados que YA
 *     vienen tipados de una consulta drizzle -- se quitan sin reemplazo
 *     (credenciales.ts::filas.map, apService.ts::cuentas.find/pendingChecks.map,
 *     pdfGenerator.ts::sheet.placed.forEach una vez tipado GlassCuttingSheet).
 *   - formas de datos armadas a mano que necesitan nombre -> interfaces
 *     locales (WindowBreakdownItem, GlassCuttingPiece, GlassCuttingSheet en
 *     pdfGenerator.ts).
 *
 * Bonus fuera del conteo de ': any' (no lleva los dos puntos, no es de las
 * 29): en sincronizarPendientes.ts se quita un cast `modo as any` -> `modo as
 * Modo`, espejo del `modo as ModoSistema` que ya usa el mismo fichero unas
 * lineas antes para el mismo `modo: string` suelto de un `.split('|')`.
 *
 * Banco de solo-codigo.
 */
import { fuente, crudo } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const sinAny = (src: string) => (src.match(/: any/g) || []).length;

// ═══════════════════ estadoEnvio.ts ═══════════════════
console.log('\n=== estadoEnvio.ts ===\n');
{
  const src = fuente('src/services/dgii/estadoEnvio.ts');
  const crd = crudo('src/services/dgii/estadoEnvio.ts');

  ok("0 ocurrencias de ': any' (6 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('textoEstado: raw unknown, angostado a Record<string, unknown> tras el guard typeof',
    /export function textoEstado\(raw: unknown\): string \| null \{/.test(src) &&
    /if \(!raw \|\| typeof raw !== 'object'\) return null;\s*\n\s*const r = raw as Record<string, unknown>;/.test(src) &&
    /if \(Array\.isArray\(r\.dgiiResponse\)\) \{/.test(src) &&
    /for \(const item of r\.dgiiResponse\) \{/.test(src) &&
    /for \(const campo of \[r\.dgiiStatus, r\.estadoDGII, r\.status, r\.estado\]\) \{/.test(src));

  ok('leerEstado: raw unknown', /export function leerEstado\(raw: unknown\): LecturaEstado \{/.test(src));

  ok('extraerFirma: raw/vistos/texto/nodo tipados unknown (Set<unknown> incluido, bonus)',
    /export function extraerFirma\(raw: unknown\): Firma \{/.test(src) &&
    /const vistos = new Set<unknown>\(\);/.test(src) &&
    /const texto = \(v: unknown\): string \| null => \{/.test(src) &&
    /const visitar = \(nodo: unknown, profundidad: number\): void => \{/.test(src));

  ok("extraerFirma::visitar: la guarda combinada se separo en dos ifs (para angostar nodo a object antes del cast)",
    /if \(typeof nodo !== 'object'\) return;\s*\n\s*if \(vistos\.has\(nodo\)\) return;/.test(src) &&
    !/typeof nodo !== 'object' \|\| vistos\.has\(nodo\)/.test(src));

  ok('extraerFirma: Object.entries castea a Record<string, unknown>',
    /for \(const \[clave, valor\] of Object\.entries\(nodo as Record<string, unknown>\)\) \{/.test(src));

  ok('camposDeFirma: raw unknown', /export function camposDeFirma\(raw: unknown\): \{/.test(src));
}

// ═══════════════════ codigoSeguridad.ts ═══════════════════
console.log('\n=== codigoSeguridad.ts ===\n');
{
  const src = fuente('src/services/dgii/codigoSeguridad.ts');
  const crd = crudo('src/services/dgii/codigoSeguridad.ts');

  ok("0 ocurrencias de ': any' (6 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('candidatos: raw/retorno/lista tipados unknown, angostado a Record<string, unknown>',
    /function candidatos\(raw: unknown\): unknown\[\] \{/.test(src) &&
    /const r = raw as Record<string, unknown>;\s*\n\s*const lista: unknown\[\] = \[raw\];/.test(src) &&
    /const anidado = r\.dgiiResponse \?\? r\.dgiiResponses \?\? r\.respuestaDGII;/.test(src) &&
    /const dentro = r\[envoltorio\];/.test(src));

  ok('buscar: objetos tipado unknown[], cada elemento angostado a Record<string, unknown> antes de indexar',
    /function buscar\(objetos: unknown\[\], claves: string\[\]\): string \{/.test(src) &&
    /if \(!obj \|\| typeof obj !== 'object'\) continue;\s*\n\s*const o = obj as Record<string, unknown>;/.test(src) &&
    /const v = o\[clave\];/.test(src));

  ok('leerDatosFirma: raw unknown', /export function leerDatosFirma\(raw: unknown\): DatosFirma \{/.test(src));
  ok('leerCodigoSeguridad: raw unknown', /export function leerCodigoSeguridad\(raw: unknown\): string \{/.test(src));
}

// ═══════════════════ desenlaceEnvio.ts ═══════════════════
console.log('\n=== desenlaceEnvio.ts ===\n');
{
  const src = fuente('src/services/dgii/desenlaceEnvio.ts');
  const crd = crudo('src/services/dgii/desenlaceEnvio.ts');

  ok("0 ocurrencias de ': any' (2 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('textoDeRespuesta: raw unknown, Object.values castea a Record<string, unknown>',
    /function textoDeRespuesta\(raw: unknown, nivel = 0, recogidos: string\[\] = \[\]\): string \{/.test(src) &&
    /for \(const v of Object\.values\(raw as Record<string, unknown>\)\) textoDeRespuesta/.test(src));

  ok('leerDesenlace: raw? unknown',
    /export function leerDesenlace\(mensaje: string \| null \| undefined, raw\?: unknown\): LecturaDesenlace \{/.test(src));
}

// ═══════════════════ credenciales.ts ═══════════════════
console.log('\n=== credenciales.ts ===\n');
{
  const src = fuente('src/services/dgii/credenciales.ts');
  const crd = crudo('src/services/dgii/credenciales.ts');

  ok("0 ocurrencias de ': any' (3 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('credencialesMseller: tx tipado typeof db = db (antes any = db)',
    /entorno: EntornoDgii,\s*\n\s*tx: typeof db = db\s*\n\s*\): Promise<CredencialesMseller> \{/.test(src));

  ok('entornosConCredenciales: tx tipado typeof db = db (antes any = db)',
    /export async function entornosConCredenciales\(companyId: string, tx: typeof db = db\): Promise<string\[\]> \{/.test(src));

  ok('filas.map sin anotacion any redundante (filas ya viene tipado de tx.select)',
    /return filas\.map\(\(f\) => f\.entorno\);/.test(src));
}

// ═══════════════════ sincronizarPendientes.ts ═══════════════════
console.log('\n=== sincronizarPendientes.ts ===\n');
{
  const src = fuente('src/services/dgii/sincronizarPendientes.ts');
  const crd = crudo('src/services/dgii/sincronizarPendientes.ts');

  ok("0 ocurrencias de ': any' (1 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok("importa 'type Modo' de dgiiSubmissionRepository",
    /import \{ envioVigente, type Modo \} from '@\/repositories\/dgiiSubmissionRepository';/.test(src));

  ok('el cast a envioVigente pasa de "modo as any" a "modo as Modo" (bonus, espeja "modo as ModoSistema" ya usado arriba)',
    /const envio = await envioVigente\(factura\.id, companyId, modo as Modo\);/.test(src) &&
    !/modo as any/.test(src));

  ok('el catch de la empresa: err tipado unknown, con cast puntual a Error para leer .message (conserva el ?. que ya tenia)',
    /\} catch \(err: unknown\) \{/.test(src) &&
    /resumen\.error = \(err as Error\)\?\.message \|\| 'Error desconocido';/.test(src));
}

// ═══════════════════ rncLookup.ts ═══════════════════
console.log('\n=== rncLookup.ts ===\n');
{
  const src = fuente('src/services/dgii/rncLookup.ts');
  const crd = crudo('src/services/dgii/rncLookup.ts');

  ok("0 ocurrencias de ': any' (1 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('el catch: error tipado unknown (se usa directo en console.error, sin acceder a .message: no hace falta cast)',
    /\} catch \(error: unknown\) \{\s*\n\s*console\.error\('Error fetching RNC from dgiiapicloud:', error\);/.test(src));
}

// ═══════════════════ pdfGenerator.ts ═══════════════════
console.log('\n=== pdfGenerator.ts ===\n');
{
  const src = fuente('src/services/pdfGenerator.ts');
  const crd = crudo('src/services/pdfGenerator.ts');

  ok("0 ocurrencias de ': any' (3 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('define WindowBreakdownItem con los campos exactos que lee generateWindowBreakdown',
    /interface WindowBreakdownItem \{\s*\n\s*tipo: string;\s*\n\s*cantidad: number;\s*\n\s*ancho: string;\s*\n\s*altura: string;\s*\n\s*vias: number;\s*\n\s*cabezal\?: string;\s*\n\s*llavin\?: string;\s*\n\s*riel\?: string;\s*\n\s*lateral\?: string;\s*\n\s*vidrio\?: string;\s*\n\s*\}/.test(src));

  ok('define GlassCuttingPiece y GlassCuttingSheet con los campos exactos que lee generateGlassCutting',
    /interface GlassCuttingPiece \{\s*\n\s*x: number;\s*\n\s*y: number;\s*\n\s*width: number;\s*\n\s*height: number;\s*\n\s*rotated: boolean;\s*\n\s*label: string;\s*\n\s*\}/.test(src) &&
    /interface GlassCuttingSheet \{\s*\n\s*id: string \| number;\s*\n\s*wastePercent: number;\s*\n\s*placed: GlassCuttingPiece\[\];\s*\n\s*\}/.test(src));

  ok('generateWindowBreakdown: data tipado WindowBreakdownItem[] (antes any[])',
    /static generateWindowBreakdown\(company: CompanyInfo, data: WindowBreakdownItem\[\]\): Promise<Buffer> \{/.test(src));

  ok('generateGlassCutting: sheets tipado GlassCuttingSheet[] (antes any[])',
    /static generateGlassCutting\(company: CompanyInfo, sheets: GlassCuttingSheet\[\], sheetWidth: number, sheetHeight: number\): Promise<Buffer> \{/.test(src));

  ok('sheet.placed.forEach sin anotacion any redundante (sheet ya viene tipado GlassCuttingSheet)',
    /sheet\.placed\.forEach\(\(p\) => \{/.test(src));
}

// ═══════════════════ googleContactsService.ts ═══════════════════
console.log('\n=== googleContactsService.ts ===\n');
{
  const src = fuente('src/services/googleContactsService.ts');
  const crd = crudo('src/services/googleContactsService.ts');

  ok("0 ocurrencias de ': any' (3 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('getAccessToken: catch tipado unknown, (error as Error).message (antes error.message directo, sin ?.)',
    /\} catch \(error: unknown\) \{\s*\n\s*console\.error\('\[GoogleContacts\] Error refreshing access token:', \(error as Error\)\.message\);/.test(src));

  ok('findContactByEmail: catch tipado unknown, (error as Error).message',
    /\} catch \(error: unknown\) \{\s*\n\s*console\.error\('\[GoogleContacts\] Search error:', \(error as Error\)\.message\);/.test(src));

  ok('syncCustomerToGoogleContacts: catch tipado unknown, (err as Error).message',
    /\} catch \(err: unknown\) \{\s*\n\s*console\.error\('\[GoogleContacts\] Synchronization process encountered a fatal error:', \(err as Error\)\.message\);/.test(src));
}

// ═══════════════════ print/pdfGenerator.ts ═══════════════════
console.log('\n=== print/pdfGenerator.ts ===\n');
{
  const src = fuente('src/services/print/pdfGenerator.ts');
  const crd = crudo('src/services/print/pdfGenerator.ts');

  ok("0 ocurrencias de ': any' (2 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('catch del servicio externo (con timeout): err tipado unknown, (err as Error).message',
    /\} catch \(err: unknown\) \{\s*\n\s*clearTimeout\(timeoutId\);\s*\n\s*throw new Error\(`\[PdfGenerator\] External PDF service failed: \$\{\(err as Error\)\.message\}`\);/.test(src));

  ok('catch del fallback a Puppeteer: err tipado unknown, (err as Error).message',
    /\} catch \(err: unknown\) \{\s*\n\s*console\.warn\(`\[PdfGenerator\] External PDF service failed\. Falling back to local Puppeteer\. Error: \$\{\(err as Error\)\.message\}`\);/.test(src));
}

// ═══════════════════ apService.ts ═══════════════════
console.log('\n=== apService.ts ===\n');
{
  const src = fuente('src/services/apService.ts');
  const crd = crudo('src/services/apService.ts');

  ok("0 ocurrencias de ': any' (2 antes)", sinAny(crd) === 0, `quedan ${sinAny(crd)}`);

  ok('cuentas.find sin anotacion any redundante (cuentas ya viene tipado de tx.select)',
    /const cuenta = cuentas\.find\(\(c\) => c\.id === id\);/.test(src));

  ok('pendingChecks.map sin anotacion any redundante (pendingChecks ya viene tipado de ApRepository.findPendingGuaranteeChecks)',
    /const encontrados = new Set\(pendingChecks\.map\(\(i\) => i\.check\.id\)\);/.test(src));
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
