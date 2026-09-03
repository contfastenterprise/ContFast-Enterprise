/**
 * P1-11 (segunda parte): idempotency-key en rutas POST criticas.
 *
 * El indice unico de financial_movements (migracion 0050) solo protege
 * el caso donde un reintento reutiliza un documentId YA EXISTENTE. Esta
 * parte cubre el caso, mas comun, de que cada intento cree una fila
 * NUEVA: tabla `idempotency_keys` (migracion 0051) + helper
 * `withIdempotency` (src/lib/idempotency.ts), aplicado a las 3 rutas
 * POST criticas (pagos, cobros, emision de facturas).
 *
 * Banco de solo-codigo (mas el propio .sql de la migracion).
 */
import { fuente, bloque, crudo } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

console.log('\n=== Migracion 0051 ===\n');

const migracion = crudo('drizzle/0051_idempotency_keys.sql');

ok('crea la tabla idempotency_keys de forma idempotente (CREATE TABLE IF NOT EXISTS)',
  /CREATE TABLE IF NOT EXISTS public\.idempotency_keys/.test(migracion));

ok('la tabla tiene company_id, modo, route, idempotency_key y status',
  /company_id uuid NOT NULL REFERENCES public\.companies\(id\)/.test(migracion) &&
  /modo environment_mode NOT NULL DEFAULT 'PRODUCCION'/.test(migracion) &&
  /route varchar\(100\) NOT NULL/.test(migracion) &&
  /idempotency_key varchar\(255\) NOT NULL/.test(migracion) &&
  /status varchar\(20\) NOT NULL DEFAULT 'processing'/.test(migracion));

ok('crea el indice unico sobre (company_id, modo, route, idempotency_key) de forma idempotente',
  /CREATE UNIQUE INDEX IF NOT EXISTS idem_keys_company_modo_route_key_idx\s*\n\s*ON public\.idempotency_keys \(company_id, modo, route, idempotency_key\);/.test(migracion));

ok('no hay ningun UPDATE ni DELETE (tabla nueva, no se tocan datos existentes)',
  !/UPDATE public\.idempotency_keys/.test(migracion) && !/DELETE FROM public\.idempotency_keys/.test(migracion));

console.log('\n=== Esquema Drizzle ===\n');

const schemaIndex = fuente('src/db/schema.ts');
ok("schema.ts exporta el nuevo archivo de idempotencia", /export \* from '\.\/schema\/idempotency';/.test(schemaIndex));

const schema = fuente('src/db/schema/idempotency.ts');
// pgTable('name', { ...columnas... }, (table) => ({ ...indices... })) tiene
// DOS argumentos objeto hermanos -- bloque() desde la marca de la tabla se
// para en el primer '}' (cierra solo las columnas). Se aislan por separado.
const cuerpoColumnas = bloque(schema, /export const idempotencyKeys = pgTable/);
ok('idempotencyKeys tiene companyId, modo, route, idempotencyKey y status',
  /companyId:\s*uuid\('company_id'\)\.notNull\(\)\.references\(\(\) => companies\.id\)/.test(cuerpoColumnas) &&
  /modo:\s*environmentMode\('modo'\)/.test(cuerpoColumnas) &&
  /route:\s*varchar\('route',\s*\{\s*length:\s*100\s*\}\)\.notNull\(\)/.test(cuerpoColumnas) &&
  /idempotencyKey:\s*varchar\('idempotency_key',\s*\{\s*length:\s*255\s*\}\)\.notNull\(\)/.test(cuerpoColumnas) &&
  /status:\s*varchar\('status',\s*\{\s*length:\s*20\s*\}\)\.default\('processing'\)\.notNull\(\)/.test(cuerpoColumnas));

const cuerpoIndices = bloque(schema, /\(table\) => \(\{/);
ok('define el indice unico sobre companyId, modo, route, idempotencyKey',
  /companyModoRouteKeyIdx:\s*uniqueIndex\('idem_keys_company_modo_route_key_idx'\)\.on\(table\.companyId, table\.modo, table\.route, table\.idempotencyKey\)/.test(cuerpoIndices));

console.log('\n=== src/lib/idempotency.ts (withIdempotency) ===\n');

const lib = fuente('src/lib/idempotency.ts');
// El primer parametro es `opts: { ... }` (un tipo objeto) -- bloque() desde
// la firma se para ahi, antes de llegar al cuerpo real. Se aisla desde la
// marca del cierre real de la firma (el `{` que sigue al tipo de retorno).
ok('se encontro la firma de withIdempotency', lib.indexOf('export async function withIdempotency(') >= 0);
const cuerpoFn = bloque(lib, /boolean \}>\s*\{/);
ok('se aislo el cuerpo de withIdempotency()', cuerpoFn.length > 0);

ok('sin header (idempotencyKey vacio), ejecuta el handler sin ninguna proteccion',
  /if \(!key\) \{[\s\S]{0,150}?const resultado = await handler\(\);[\s\S]{0,80}?return \{ \.\.\.resultado, deDuplicado: false \};/.test(cuerpoFn));

ok('reserva la clave con un INSERT y distingue el codigo 23505 (unique_violation) de un error real',
  /await db\.insert\(idempotencyKeys\)\.values\(/.test(cuerpoFn) &&
  /if \(err\?\.code !== '23505'\) throw err;/.test(cuerpoFn));

ok('si la reserva no se pudo (ya existia) y estaba completada, devuelve la respuesta guardada sin re-ejecutar el handler',
  /if \(existente\?\.status === 'completed'\) \{\s*\n\s*return \{ status: existente\.responseStatus \?\? 200, body: existente\.responseBody, deDuplicado: true \};/.test(cuerpoFn));

ok("si la reserva no se pudo y sigue en curso, devuelve 409 (no re-ejecuta ni espera)",
  /status: 409,[\s\S]{0,50}?body: \{[\s\S]{0,150}?code: 'IDEMPOTENCY_IN_PROGRESS'/.test(cuerpoFn));

ok('si el handler tiene exito, marca la clave como completed guardando la respuesta',
  /\.update\(idempotencyKeys\)\s*\n\s*\.set\(\{ status: 'completed', responseStatus: resultado\.status, responseBody: resultado\.body as any, completedAt: new Date\(\) \}\)/.test(cuerpoFn));

ok('si el handler lanza un error, libera la clave (DELETE) y relanza el error (no lo traga)',
  /catch \(err\) \{\s*\n\s*await db\.delete\(idempotencyKeys\)\.where\(filtro\);\s*\n\s*throw err;/.test(cuerpoFn));

console.log('\n=== Las 3 rutas POST criticas usan withIdempotency ===\n');

const rutas: [string, string, string][] = [
  ['src/app/api/v1/ap/payments/route.ts', 'ApService.registerPayment', 'POST /api/v1/ap/payments'],
  ['src/app/api/v1/ar/receipts/route.ts', 'ArRepository.registerReceipt', 'POST /api/v1/ar/receipts'],
  ['src/app/api/v1/invoices/route.ts', 'InvoiceService.issueInvoice', 'POST /api/v1/invoices'],
];

for (const [archivo, llamadaInterna, routeName] of rutas) {
  const src = fuente(archivo);
  ok(`${archivo}: importa withIdempotency de '@/lib/idempotency'`,
    /import\s*\{\s*withIdempotency\s*\}\s*from\s*'@\/lib\/idempotency';/.test(src));

  ok(`${archivo}: llama a withIdempotency con route '${routeName}' y el header Idempotency-Key`,
    new RegExp(`withIdempotency\\(\\s*\\n\\s*\\{ companyId: [^,]+, modo: [^,]+, route: '${routeName.replace(/\//g, '\\/')}', idempotencyKey: req\\.headers\\.get\\('Idempotency-Key'\\) \\},`).test(src));

  ok(`${archivo}: ${llamadaInterna} queda envuelto DENTRO del handler pasado a withIdempotency`,
    new RegExp(`withIdempotency\\([\\s\\S]{0,400}?${llamadaInterna.replace('.', '\\.')}\\(`).test(src));
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
