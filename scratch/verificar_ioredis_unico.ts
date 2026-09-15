/**
 * Banco del lote 126: un solo ioredis, el que usa bullmq.
 *
 *     pnpm exec tsx scratch/verificar_ioredis_unico.ts
 *
 * EL PROBLEMA, MEDIDO (2026-09-15)
 * --------------------------------
 * `pnpm why ioredis` daba DOS versiones: 5.11.1, la que pide el proyecto
 * (`^5.11.1`), y 5.10.1, la que bullmq 5.79.0 fija EXACTA. La conexion Redis se
 * crea con la 5.11.1 (src/infrastructure/redis.ts) y se le entrega a bullmq, que
 * esta compilado y probado contra la 5.10.1. Sus tipos no encajan, y por eso
 * habia `connection: redis as any` en reportQueue.ts, queue.ts y worker.ts: el
 * molde tapaba la diferencia de versiones.
 *
 * EL ARREGLO
 * ----------
 * El proyecto pide la MISMA version que bullmq fija. No se fuerza a bullmq a
 * otra con un override: la version que bullmq prueba es la que manda. Con una
 * sola copia, los moldes sobran y se quitan.
 *
 * Y para que no se vuelvan a separar: este banco lee la version que fija el
 * bullmq instalado y exige que package.json pida esa. Al actualizar bullmq,
 * falla hasta alinear ioredis.
 */
import fs from 'fs';
import path from 'path';
import { sinComentarios } from './_fuente';

let fallos = 0;
function ok(t: string, x: boolean, d = ''): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!x) fallos++;
}
function exige(cond: boolean, queja: string): void {
  if (!cond) throw new Error(`Precondicion rota: ${queja}`);
}
const leer = (f: string) => fs.readFileSync(f, 'utf8');

const pkg = JSON.parse(leer('package.json')) as { dependencies: Record<string, string> };
const bullmqPkg = JSON.parse(leer(path.join('node_modules', 'bullmq', 'package.json'))) as {
  version: string; dependencies: Record<string, string>;
};

// ─────────────────────────────────────────────────────────────────────────
//  PRECONDICIONES. Revientan: se cumplen antes y despues del lote.
// ─────────────────────────────────────────────────────────────────────────
exige(!!pkg.dependencies.bullmq && !!pkg.dependencies.ioredis, 'el proyecto ya no depende de bullmq e ioredis');
exige(/^\d+\.\d+\.\d+$/.test(bullmqPkg.dependencies.ioredis ?? ''),
      `bullmq ya no fija ioredis exacto (${bullmqPkg.dependencies.ioredis}): el razonamiento cambia`);
exige(sinComentarios(leer('src/infrastructure/redis.ts')).includes("import Redis from 'ioredis';"),
      'redis.ts ya no crea la conexion con ioredis');

const fijadaPorBullmq = bullmqPkg.dependencies.ioredis;

// ─────────────────────────────────────────────────────────────────────────
console.log(`A. UNA SOLA VERSION (bullmq ${bullmqPkg.version} fija ioredis ${fijadaPorBullmq})`);
// ─────────────────────────────────────────────────────────────────────────
ok('package.json pide exactamente la version que fija bullmq',
   pkg.dependencies.ioredis === fijadaPorBullmq, `pide ${pkg.dependencies.ioredis}`);

//  Lo que RESUELVE cada lado, leido del LOCKFILE. No de node_modules: pnpm deja
//  la copia vieja en disco aunque nadie la enlace (contar carpetas daba falso
//  rojo), y pnpm 11 no vuelve a enlazar al restaurar un lockfile anterior, asi
//  que desde node_modules la contraprueba no se podia reproducir.
const lockTexto = leer('pnpm-lock.yaml').replace(/\r\n/g, '\n');
const delProyecto = /\n {6}ioredis:\n {8}specifier: [^\n]+\n {8}version: (\d+\.\d+\.\d+)/.exec(lockTexto)?.[1];
const deBullmq = /\n {2}bullmq@[^\n]+:\n {4}dependencies:\n(?: {6}[^\n]+\n)*? {6}ioredis: (\d+\.\d+\.\d+)/.exec(lockTexto)?.[1];
ok('el proyecto y bullmq resuelven la MISMA copia de ioredis',
   !!delProyecto && delProyecto === deBullmq && delProyecto === fijadaPorBullmq, `proyecto ${delProyecto}, bullmq ${deBullmq}`);

const lock = leer('pnpm-lock.yaml').replace(/\r\n/g, '\n');
const enLock = [...new Set((lock.match(/\n  ioredis@(\d+\.\d+\.\d+)/g) || []).map((s) => s.trim()))];
ok('y el lockfile resuelve una sola', enLock.length === 1 && enLock[0] === `ioredis@${fijadaPorBullmq}`, enLock.join(', '));

// ─────────────────────────────────────────────────────────────────────────
console.log('B. LOS MOLDES QUE TAPABAN LA DIFERENCIA, FUERA');
// ─────────────────────────────────────────────────────────────────────────
for (const f of ['src/services/jobs/reportQueue.ts', 'src/infrastructure/queue.ts', 'src/infrastructure/worker.ts']) {
  const t = sinComentarios(leer(f));
  ok(`${f}: la conexion se pasa sin molde`,
     /connection: redis\b/.test(t) && !/connection: redis as any/.test(t));
}

console.log('\n' + '='.repeat(72));
if (fallos > 0) { console.log(`${fallos} FALLAN`); process.exit(1); }
console.log('TODO OK');
