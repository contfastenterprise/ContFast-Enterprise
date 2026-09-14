/**
 * Banco del lote 108 (P3-49): fuera las dependencias que no usa nadie.
 *
 *     pnpm exec tsx scratch/verificar_p3_49.ts
 *
 * LA LISTA DE LA AUDITORIA ESTABA MAL, Y POR ESO SE MIDIO UNA A UNA
 * ------------------------------------------------------------------
 * El traspaso decia "sin uso: pdf-lib, tesseract.js, jsbarcode, node-forge,
 * xml-crypto". Medido el 2026-09-14:
 *
 *   jsbarcode ...... VIVE. `BarcodeRenderer.tsx` lo carga con `import()`
 *                    dinamico: un grep de `from 'jsbarcode'` no lo ve.
 *   tesseract.js ... VIVE. Solo lo nombra `scripts/run-ocr.js`, que parece un
 *                    script suelto -- pero `/api/v1/ocr` lo LANZA con
 *                    `execFile('node', [scripts/run-ocr.js])`, fuera del
 *                    empaquetado de Next. Quitarlo rompia el OCR de compras en
 *                    ejecucion, y ni `tsc` ni el build lo habrian dicho.
 *   pdf-lib ........ nadie. Ni import, ni require, ni import(), ni config.
 *   node-forge ..... nadie (con su @types/node-forge).
 *   xml-crypto ..... nadie. La firma del e-CF la hace mSeller, no este repo.
 *
 * `pnpm why` los da a los tres como dependencia DIRECTA del proyecto y de
 * nadie mas: no hay un paquete que los necesite por debajo.
 *
 * Y LO QUE NO SE HACE: el "Radix duplicado" de la auditoria
 * ---------------------------------------------------------
 * `button.tsx` usa `@radix-ui/react-slot` 1.3.3 directo; el paquete unificado
 * `radix-ui` 1.6.1 trae dentro la 1.3.0. Unificar bajaria de version el `Slot`
 * de TODOS los botones con `asChild`, por ahorrarse un paquete que sigue
 * instalado igual como dependencia de `radix-ui`. No compensa: se queda, y es
 * precondicion abajo para que nadie lo tome por olvido.
 */
import fs from 'fs';
import path from 'path';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
const crudo = (f: string): string => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const codigo = (f: string): string => sinComentarios(crudo(f));

type Pkg = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
const pkg = JSON.parse(crudo('package.json')) as Pkg;
const declarada = (n: string): boolean => Boolean(pkg.dependencies?.[n] ?? pkg.devDependencies?.[n]);

/**
 * Todo lo que se ejecuta o se configura: src/, scripts/, packages/ (sin sus
 * node_modules) y los ficheros de configuracion de la raiz.
 */
const FUENTES: { ruta: string; texto: string }[] = [];
(function andar(d: string) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === 'dist') continue;
    const p = path.join(d, e.name).split(path.sep).join('/');
    if (e.isDirectory()) andar(p);
    else if (/\.(ts|tsx|js|mjs|cjs|json)$/.test(p)) FUENTES.push({ ruta: p, texto: codigo(p) });
  }
})('src');
for (const d of ['scripts', 'packages']) {
  (function andar(dd: string) {
    if (!fs.existsSync(dd)) return;
    for (const e of fs.readdirSync(dd, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      const p = path.join(dd, e.name).split(path.sep).join('/');
      if (e.isDirectory()) andar(p);
      else if (/\.(ts|tsx|js|mjs|cjs|json)$/.test(p)) FUENTES.push({ ruta: p, texto: codigo(p) });
    }
  })(d);
}
for (const f of fs.readdirSync('.')) {
  if (/\.(config\.(ts|js|mjs|cjs)|ya?ml)$/.test(f) && f !== 'pnpm-lock.yaml') {
    FUENTES.push({ ruta: f, texto: codigo(f) });
  }
}

/**
 * ¿Lo nombra alguien como MODULO? Anclado en el especificador con sus
 * comillas: `'pdf-lib'`, `"pdf-lib"` o `'pdf-lib/...'`. Un `includes('pdf-lib')`
 * suelto tambien encontraria `pdf-lib-algo` o una palabra en un texto.
 */
function quienLoNombra(nombre: string): string[] {
  const n = nombre.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = new RegExp(`['"\`]${n}(/[^'"\`]*)?['"\`]`);
  return FUENTES.filter((f) => f.ruta !== 'package.json' && re.test(f.texto)).map((f) => f.ruta);
}

/** La entrada del proyecto raiz en pnpm-lock.yaml: de `importers:\n  .:` al siguiente importador. */
function lockRaiz(): string {
  const l = crudo('pnpm-lock.yaml').replace(/\r\n/g, '\n');
  const i = l.indexOf('\nimporters:\n\n  .:\n');
  if (i < 0) return '';
  const j = l.indexOf('\n\n  packages/', i + 20);
  const k = l.indexOf('\n\npackages:\n', i);
  const fin = [j, k].filter((x) => x > 0).sort((a, b) => a - b)[0] ?? l.length;
  return l.slice(i, fin);
}

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
exige(FUENTES.length > 400, `solo se han leido ${FUENTES.length} fuentes; revisa desde donde se corre`);
exige(lockRaiz().length > 1000, 'no se encontro la entrada del proyecto raiz en pnpm-lock.yaml');

//  LOS QUE PARECIAN MUERTOS Y VIVEN. Si esto dejara de ser verdad, la decision
//  de conservarlos cambia -- pero la de ESTE lote no.
exige(declarada('jsbarcode'), 'jsbarcode ya no esta en package.json');
exige(codigo('src/components/ui/BarcodeRenderer.tsx').includes("import('jsbarcode')"),
      'BarcodeRenderer ya no carga jsbarcode con import(): revisar si sigue vivo');
exige(declarada('tesseract.js'), 'tesseract.js ya no esta en package.json');
exige(codigo('scripts/run-ocr.js').includes("require('tesseract.js')"),
      'run-ocr.js ya no usa tesseract.js');
exige(codigo('src/app/api/v1/ocr/route.ts').includes("path.join(process.cwd(), 'scripts', 'run-ocr.js')"),
      'la ruta de OCR ya no lanza run-ocr.js: tesseract.js podria haberse quedado sin uso');

//  El Radix que se queda a proposito.
exige(declarada('@radix-ui/react-slot') && codigo('src/components/ui/button.tsx').includes('from "@radix-ui/react-slot"'),
      'button.tsx ya no usa @radix-ui/react-slot: revisar la nota de la cabecera');

// ─────────────────────────────────────────────────────────────────────────
console.log('A. LOS TRES SIN USO: FUERA DE package.json Y SIN NADIE QUE LOS NOMBRE');
// ─────────────────────────────────────────────────────────────────────────
//  Las dos cosas a la vez. "Nadie lo nombra" ya era cierto antes -- es el
//  motivo de quitarlo -- asi que suelta daria un OK gratis en la contraprueba.
for (const dep of ['pdf-lib', 'node-forge', 'xml-crypto']) {
  const quien = quienLoNombra(dep);
  ok(`fuera ${dep}${quien.length ? ` (lo nombra ${quien[0]})` : ''}`,
     !declarada(dep) && quien.length === 0);
}
ok('y con node-forge se van sus tipos', !declarada('@types/node-forge'));

// ─────────────────────────────────────────────────────────────────────────
console.log('B. EL LOCKFILE LO REFLEJA');
// ─────────────────────────────────────────────────────────────────────────
//  Quitarlos del package.json a mano sin reinstalar deja el lockfile diciendo
//  otra cosa, y `pnpm install --frozen-lockfile` en el despliegue falla.
const raiz = lockRaiz();
for (const dep of ['pdf-lib', 'node-forge', 'xml-crypto', '@types/node-forge']) {
  const n = dep.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  ok(`pnpm-lock.yaml ya no lo tiene como directa: ${dep}`,
     !new RegExp(`\\n      '?${n}'?:\\n`).test(raiz));
}

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
