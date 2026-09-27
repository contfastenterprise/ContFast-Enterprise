/**
 * Lote 211 -- el pipeline de CI no habia pasado NUNCA.
 *
 * Medido el 2026-09-27: 0 en verde de las 200 ultimas ejecuciones de "ContFast CI/CD
 * Pipeline", desde que se creo el 2026-06-25. Se paraba en `pnpm install` y por detras
 * habia mas cosas rotas que nadie llego a ver, porque ningun paso llego a correr:
 *
 *   1. pnpm 9 con un proyecto de pnpm 11: los `overrides` viven en
 *      `pnpm-workspace.yaml`, que pnpm 9 no lee (ERR_PNPM_LOCKFILE_CONFIG_MISMATCH).
 *   2. Node 20, y pnpm 11 exige Node >= 22.13.
 *   3. Las pruebas corrian `src/tests/payroll.test.ts`, que NO EXISTE.
 *   4. `build` exige variables que el CI no daba (JWT_SECRET, JWT_REFRESH_SECRET,
 *      URL_SIGNATURE_SECRET, Supabase): hay modulos que las piden al CARGARSE.
 *
 * Lo que vigila este banco es la PROPIEDAD, no el texto del YAML:
 *   - la lista de variables obligatorias se DERIVA del codigo (cada `throw` que exige una
 *     variable de entorno, mas los clientes de Supabase creados al cargar el modulo). El
 *     dia que alguien anada otra, este banco falla antes que el CI;
 *   - todo fichero que un paso ejecute por su ruta tiene que existir.
 *
 * El YAML se lee a mano (sin dependencia nueva): es un fichero pequeño y lo que se mira
 * son claves concretas.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');

let fallos = 0;
let contadas = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  contadas++;
  if (!c) fallos++;
};

const CI = '.github/workflows/ci.yml';

/** Las lineas del YAML sin comentarios: los comentarios de este fichero explican lo que se quito. */
const sinComentariosYaml = (src: string) =>
  src
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|\s)#.*$/, ''))
    .join('\n');

function ficheros(dir: string, fuera: RegExp): string[] {
  const res: string[] = [];
  for (const n of readdirSync(join(raiz, dir))) {
    const rel = `${dir}/${n}`;
    if (fuera.test(rel)) continue;
    const st = statSync(join(raiz, rel));
    if (st.isDirectory()) res.push(...ficheros(rel, fuera));
    else if (/\.(ts|tsx)$/.test(n)) res.push(rel);
  }
  return res;
}

/**
 * Las variables que el codigo EXIGE: la que se lee en las lineas previas a un `throw`
 * cuyo mensaje habla de variable de entorno, y las de un `createClient` de Supabase
 * escrito fuera de toda funcion (se ejecuta al cargar la ruta, o sea, en `build`).
 */
function obligatoriasDelCodigo(): Set<string> {
  const res = new Set<string>();
  for (const f of ficheros('src', /\/tests\//)) {
    const lineas = leer(f).split(/\r?\n/);
    lineas.forEach((l, i) => {
      if (!/throw new Error\(.*(variable(s)? de entorno|environment variable)/i.test(l)) return;
      // Solo lo que se ejecuta al CARGAR: un `throw` dentro de un `if` del nivel del modulo
      // (sangria 2). Uno mas hondo vive dentro de una funcion y solo salta si se la llama:
      // `mailer.ts` pide SMTP_* al mandar un correo, y `build` pasa sin ellas (medido).
      if ((/^(\s*)/.exec(l)?.[1].length ?? 0) > 2) return;
      const ventana = lineas.slice(Math.max(0, i - 6), i + 1).join('\n');
      // Los nombres que el MENSAJE nombra, y los `process.env.X` que se leen justo antes.
      for (const m of l.matchAll(/\b([A-Z][A-Z0-9]*_[A-Z0-9_]+)\b/g)) res.add(m[1]);
      for (const m of ventana.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) res.add(m[1]);
    });
    lineas.forEach((l) => {
      if (!/^(const|let|export const)\s+\w+\s*=\s*createClient\(/.test(l)) return;
      for (const m of leer(f).matchAll(/process\.env\.([A-Z][A-Z0-9_]*SUPABASE[A-Z0-9_]*|SUPABASE_[A-Z0-9_]+)/g)) res.add(m[1]);
    });
  }
  // GROQ solo se pide dentro del manejador de la peticion, no al cargar; no la necesita `build`.
  res.delete('GROQ_API_KEY');
  return res;
}

function main() {
  //  PRECONDICIONES, ciertas en los DOS estados: el pipeline existe, instala con el
  //  lockfile congelado y tiene sus cuatro pasos. Si alguien lo retira o le quita un
  //  paso, este banco no debe dar FALLA -- debe negarse a correr.
  const yaml = sinComentariosYaml(leer(CI));
  if (yaml.trim() === '') throw new Error(`Precondicion: no esta ${CI}`);
  for (const paso of [/pnpm install --frozen-lockfile/, /tsc --noEmit/, /pnpm run lint/, /pnpm run build/]) {
    if (!paso.test(yaml)) throw new Error(`Precondicion: al pipeline le falta ${paso}`);
  }
  if (!/^overrides:/m.test(leer('pnpm-workspace.yaml'))) {
    throw new Error('Precondicion: los overrides ya no viven en pnpm-workspace.yaml; revisar la regla de la version');
  }
  console.log('  pre   el pipeline existe, instala congelado y tiene sus pasos');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) La instalacion\n');
  // ───────────────────────────────────────────────────────────────────────────
  const pnpm = /pnpm\/action-setup@v\d+[\s\S]*?version:\s*['"]?(\d+)/.exec(yaml);
  const pnpmMayor = pnpm ? Number(pnpm[1]) : 0;
  ok('pnpm >= 10: la que lee los overrides de pnpm-workspace.yaml', pnpmMayor >= 10, `pnpm ${pnpmMayor || '?'}`);
  const node = /setup-node@v\d+[\s\S]*?node-version:\s*['"]?(\d+)(?:\.(\d+))?/.exec(yaml);
  const nodeMayor = node ? Number(node[1]) : 0;
  const nodeMenor = node?.[2] !== undefined ? Number(node[2]) : 99;
  const nodeBasta = nodeMayor > 22 || (nodeMayor === 22 && nodeMenor >= 13);
  ok('  y Node >= 22.13, el que exige pnpm 11', pnpmMayor < 11 ? nodeMayor >= 18 && pnpmMayor >= 10 : nodeBasta, `Node ${nodeMayor || '?'}`);
  // action-setup tiene que ir ANTES que setup-node: la cache de pnpm de setup-node
  // necesita el ejecutable ya instalado.
  const iPnpm = yaml.indexOf('pnpm/action-setup');
  const iNode = yaml.indexOf('actions/setup-node');
  ok('  pnpm se instala antes que Node (la cache de setup-node lo necesita)', iPnpm >= 0 && iNode >= 0 && iPnpm < iNode);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) Los pasos corren cosas que existen\n');
  // ───────────────────────────────────────────────────────────────────────────
  const rutas = [...yaml.matchAll(/run:\s*pnpm exec tsx\s+(\S+)/g)].map((m) => m[1]);
  const faltan = rutas.filter((r) => !existsSync(join(raiz, r)));
  ok('ningun paso ejecuta un fichero que no existe', faltan.length === 0, faltan.join(', ') || 'ninguno');
  ok('  las pruebas son las de vitest (`pnpm test`)', /run:\s*pnpm (run )?test\s*$/m.test(yaml));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) `build` tiene las variables que el codigo exige al cargar -- DERIVADAS\n');
  // ───────────────────────────────────────────────────────────────────────────
  const exigidas = obligatoriasDelCodigo();
  // Sanidad del propio derivador: si no encuentra las que se midieron el 2026-09-27, lo
  // roto es el derivador, y dar OK con una lista vacia seria de balde.
  for (const medida of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'URL_SIGNATURE_SECRET', 'SUPABASE_URL']) {
    if (!exigidas.has(medida)) throw new Error(`Precondicion: el derivador ya no encuentra ${medida}; revisarlo`);
  }
  // Las del bloque `env:` del job (o de cualquier paso): NOMBRE: valor.
  const dadas = new Set([...yaml.matchAll(/^\s+([A-Z][A-Z0-9_]*):\s*\S/gm)].map((m) => m[1]));
  const sinDar = [...exigidas].filter((v) => !dadas.has(v)).sort();
  ok('toda variable exigida al cargar esta en el entorno del CI', sinDar.length === 0, sinDar.join(', ') || `${exigidas.size} dadas`);
  // Estan a nivel de JOB y no de un solo paso: tsc no las necesita, pero `test` y `build`
  // si, y repetirlas por paso es como se separaron la otra vez.
  ok('  y a nivel del job, no repartidas por paso', /\n    env:\n(\s{6}[A-Z][A-Z0-9_]*:.*\n)+/.test(yaml.replace(/\r/g, '')));
  // Ningun valor del CI puede ser un secreto real: se escriben en claro.
  const valores = [...yaml.matchAll(/^\s+[A-Z][A-Z0-9_]*:\s*(.+)$/gm)].map((m) => m[1].trim());
  ok('  con valores de juguete: ninguno viene de `secrets.`', valores.length > 0 && valores.every((v) => !/secrets\./.test(v)));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4) Sin servicios que no usa nadie\n');
  // ───────────────────────────────────────────────────────────────────────────
  ok('ni postgres ni redis: vitest no toca la base y Redis se retiro (lote 183)', !/^\s+services:/m.test(yaml) && /pnpm test/.test(yaml));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`} (${contadas} comprobaciones)`);
  process.exit(fallos === 0 ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(2);
}
