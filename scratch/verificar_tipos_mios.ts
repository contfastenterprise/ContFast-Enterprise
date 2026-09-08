import { crudo as crudoCrudo } from './_fuente';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

const contar = (s: string, sub: string): number => s.split(sub).length - 1;
const base = (p: string): string => p.split('/').pop() as string;

// ═══════════ Los 31 errores de tipos que introdujo mi propio P1-24 ═══════════
// `pnpm build` nunca los vio: next.config.ts lleva
// `typescript: { ignoreBuildErrors: true }`. Salieron al correr `tsc --noEmit`
// por primera vez, en el lote 12. El banco de abajo comprueba la FORMA del
// arreglo; el arbitro de verdad es `pnpm exec tsc --noEmit`.

const FIRMAS: [string, number][] = [
  ['src/middleware/permissions.ts', 1],
  ['src/repositories/accountingRepository.ts', 2],
  ['src/repositories/bankRepository.ts', 2],
  ['src/repositories/deliveryRepository.ts', 1],
  ['src/repositories/dgiiSubmissionRepository.ts', 2],
  ['src/services/dgii/credenciales.ts', 2],
  ['src/services/inventoryService.ts', 5],
];

// ─────────── GRUPO A: tx: typeof db -> DbOTx (24 errores) ───────────
// `typeof db` es el cliente completo (PostgresJsDatabase & { $client }). Una
// transaccion es un PgTransaction y no tiene $client, asi que cada llamada que
// pasaba un tx real era un error. DbOTx quita $client y admite los dos.
{
  const d = crudo('src/db/index.ts');
  ok(
    'db/index: define DbOTx quitando $client del tipo del cliente',
    d.includes("export type DbOTx = Omit<typeof db, '$client'>;")
  );
  ok(
    'db/index: DbOTx va junto al DbTransaction que ya existia',
    d.includes('export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];') &&
      d.includes('DbOTx =') &&
      d.indexOf('DbTransaction =') < d.indexOf('DbOTx =')
  );
  ok(
    'db/index: la nota explica por que el tipo anterior era incorrecto',
    d.includes('Una transaccion no lo es: es un') && d.includes('ignoreBuildErrors')
  );
}

{
  let totalFirmas = 0;
  for (const [path, esperadas] of FIRMAS) {
    const s = crudo(path);
    const n = contar(s, ': DbOTx');
    totalFirmas += n;
    ok(`${base(path)}: ${esperadas} firma(s) usan DbOTx (halladas ${n})`, n === esperadas);
    ok(`${base(path)}: importa el tipo DbOTx`, /import\s*\{[^}]*\btype DbOTx\b[^}]*\}\s*from\s*'@\/db'/s.test(s));
  }
  ok(`las 15 firmas estan cubiertas (contadas ${totalFirmas})`, totalFirmas === 15);

  for (const [path] of FIRMAS) {
    ok(`${base(path)}: sin ninguna firma ': typeof db' remanente`, !crudo(path).includes(': typeof db'));
  }
}

// ─────────── GRUPO B: arrays sin tipo (6 errores) ───────────
{
  const s = crudo('src/app/api/v1/products/barcodes/pdf/route.ts');
  ok(
    'barcodes/pdf: flatList toma el tipo de productsToPrint, sin inventar nada',
    s.includes('const flatList: typeof productsToPrint = [];')
  );
  ok('barcodes/pdf: sin el array vacio sin tipo', !s.includes('const flatList = [];'));
}

{
  const s = crudo('src/app/api/v1/products/route.ts');
  ok('products: la consulta de existencias sale del if', s.includes('const levels = !product ? [] : await db'));
  ok(
    'products: dataWithInventory se construye de una vez (tipo inferido)',
    s.includes('const dataWithInventory = !product ? [] : [{')
  );
  ok('products: sin el array vacio sin tipo', !s.includes('let dataWithInventory = [];'));
}

{
  const s = crudo('src/services/storefront/quoteService.ts');
  ok(
    'quoteService: quoteLinesData lleva tipo explicito y sin any',
    s.includes('const quoteLinesData: {\n      productId: string;\n      quantity: string;\n') &&
      !s.includes('quoteLinesData: any')
  );
  ok('quoteService: sin el array vacio sin tipo', !s.includes('const quoteLinesData = [];'));
}

// ─────────── GRUPO C: el cast de msellerClient (1 error) ───────────
{
  const s = crudo('src/services/dgii/msellerClient.ts');
  ok(
    'msellerClient: el cast pasa por unknown, que es lo que exige TypeScript',
    s.includes('return payload as unknown as ECFPayload;')
  );
  ok(
    'msellerClient: el comentario dice quien garantiza la forma de verdad',
    s.includes('garantiza la forma real NO es el compilador')
  );
}

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
