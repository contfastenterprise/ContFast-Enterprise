/**
 * Lote 219 -- sin Redis, lo que se encola corre con `after()` dentro de la
 * peticion, no con un `setTimeout` suelto.
 *
 * POR QUE
 * -------
 * Desde que se retiro `REDIS_URL` (22/09), `triggerFallback` es el camino
 * NORMAL en produccion: por ahi salen el correo al cliente y los peldaños de la
 * persecucion del veredicto. Con `setTimeout`, la tarea corre solo si Vercel
 * mantiene viva la instancia despues de responder -- el defecto del `void` del
 * lote 199. Medido el 2026-09-28 (solo lectura): las 12 facturas de PRODUCCION
 * desde el 15/09 tuvieron su veredicto en 6-119 s, asi que HOY funciona; el
 * lote lo pasa de "funciona en la practica" a garantizado.
 *
 * Y como `after()` vive lo que el `maxDuration` de la ruta, la escalera sin
 * cola deja de programar peldaños que no caben (`cabeSinCola`).
 *
 * El banco EJECUTA el respaldo: dentro de un ambito de peticion simulado (el
 * mismo `workAsyncStorage` que lee `after()`), y fuera de el.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// El modulo de la cola arrastra `@/db`, que exige la variable al cargarse. No
// se conecta a nada: ninguna comprobacion llega a consultar la base.
process.env.DATABASE_URL ||= 'postgres://banco@127.0.0.1:1/no_existe';
delete process.env.REDIS_URL;

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RUTAS = [
  'src/app/api/v1/invoices/route.ts',
  'src/app/api/v1/invoices/[id]/submit/route.ts',
  'src/app/api/v1/ecf/[id]/resubmit/route.ts',
];

async function main() {
  //  Next lo pone en `globalThis` al arrancar su servidor; fuera de Next hay que
  //  ponerlo a mano, o su almacen de peticion no se puede ni cargar.
  const { AsyncLocalStorage } = await import('node:async_hooks');
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
  const { workAsyncStorage } = await import('next/dist/server/app-render/work-async-storage.external');
  const cola = await import('../src/infrastructure/queue');
  invariante('sin REDIS_URL no hay cola: todo cae al respaldo', cola.estadoQueue === null && cola.emailQueue === null);

  //  Un trabajo de una cola que el respaldo no conoce: lo unico que hace al
  //  ejecutarse es avisar por consola. Asi se ve SI corrio y CUANDO, sin mandar
  //  un correo ni tocar la base.
  const avisos: string[] = [];
  const warnOriginal = console.warn;
  console.warn = (...a: unknown[]) => { avisos.push(a.map(String).join(' ')); };
  const logOriginal = console.log;
  const silenciar = () => { console.log = () => {}; };
  const hablar = () => { console.log = logOriginal; };
  const corrio = () => avisos.some((a) => a.includes('Unknown queue'));
  const encolar = (delay: number) =>
    cola.addJob('cola-de-prueba' as never, 'banco', {} as never, { delay });

  console.log('\n1) Dentro de una peticion: la tarea se entrega a after()\n');
  const entregadas: Array<() => Promise<unknown>> = [];
  const ambito = { afterContext: { after: (t: () => Promise<unknown>) => { entregadas.push(t); } } };
  silenciar();
  await workAsyncStorage.run(ambito as never, () => encolar(0));
  await esperar(50);
  hablar();
  ok('la tarea se entrega a after()', entregadas.length === 1, `${entregadas.length} entregadas`);
  ok('  y NO corre por su cuenta con un setTimeout suelto', !corrio());
  //  Se vacia antes: con el `setTimeout` de antes el aviso ya estaria ahi, y
  //  esta comprobacion saldria cierta de balde en la contraprueba.
  avisos.length = 0;
  silenciar();
  if (entregadas[0]) await entregadas[0]();
  hablar();
  ok('  al ejecutar lo entregado, el trabajo corre', entregadas.length === 1 && corrio());

  //  El retraso se respeta DENTRO de lo entregado: la persecucion es una
  //  escalera de esperas y no puede salir de golpe.
  avisos.length = 0; entregadas.length = 0;
  silenciar();
  await workAsyncStorage.run(ambito as never, () => encolar(300));
  const t0 = Date.now();
  if (entregadas[0]) await entregadas[0]();
  const tardo = Date.now() - t0;
  hablar();
  ok('  y respeta el retraso pedido', entregadas.length === 1 && corrio() && tardo >= 280, `${tardo} ms`);

  console.log('\n2) Fuera de una peticion (guiones, worker): como siempre\n');
  avisos.length = 0;
  silenciar();
  await encolar(0);
  await esperar(100);
  hablar();
  invariante('fuera de una peticion el trabajo corre igual', corrio());

  console.warn = warnOriginal;

  console.log('\n3) La escalera sin cola no programa lo que no cabe\n');
  const E = await import('../src/services/dgii/escalera');
  const cabe = (E as { cabeSinCola?: (i: number) => boolean }).cabeSinCola;
  const presupuesto = (E as { PRESUPUESTO_SIN_COLA_MS?: number }).PRESUPUESTO_SIN_COLA_MS;
  if (typeof cabe !== 'function' || typeof presupuesto !== 'number') {
    for (const t of ['caben los peldaños hasta los 120 s', '  y el de 300 s no', '  ni un intento roto',
                     'el presupuesto deja sitio a la ultima consulta dentro del maxDuration']) ok(t, false, 'no existe cabeSinCola');
  } else {
    ok('caben los peldaños hasta los 120 s', [0, 1, 2, 3, 4, 5, 6, 7, 8].every(cabe));
    ok('  y el de 300 s no', cabe(9) === false);
    ok('  ni un intento roto', !cabe(-1) && !cabe(10) && !cabe(1.5));
    // El ultimo peldaño que cabe, mas una consulta completa, dentro del
    // maxDuration MAS BAJO de las rutas que emiten.
    const { MS_CONSULTA } = await import('../src/services/dgii/tiempos');
    const minimo = Math.min(...RUTAS.map((r) => Number(/export const maxDuration = (\d+);/.exec(leer(r))?.[1] ?? 0)));
    ok('el presupuesto deja sitio a la ultima consulta dentro del maxDuration',
      presupuesto + MS_CONSULTA <= minimo * 1000, `${presupuesto} + ${MS_CONSULTA} <= ${minimo * 1000}`);
  }

  console.log('\n4) La persecucion lo usa, ejecutada\n');
  const P = await import('../src/services/dgii/perseguirVeredicto');
  entregadas.length = 0;
  const peticion = { companyId: 'c', invoiceId: 'i', modo: 'PRODUCCION' as const };
  silenciar();
  const ultimo = await workAsyncStorage.run(ambito as never, () => P.encolarSiguienteIntento({ ...peticion, intento: 9 }));
  hablar();
  ok('sin cola, el peldaño de 300 s no se programa', ultimo === null && entregadas.length === 0,
    `devolvio ${ultimo}, ${entregadas.length} entregadas`);
  silenciar();
  const octavo = await workAsyncStorage.run(ambito as never, () => P.encolarSiguienteIntento({ ...peticion, intento: 8 }));
  hablar();
  //  Solo lo que DEVUELVE: con el codigo de antes tambien se programaba (por
  //  `setTimeout`, no por `after()`), y un invariante tiene que valer en los dos.
  invariante('  el de 120 s si se programa', octavo === 120_000);

  console.log('\n5) Las rutas que emiten viven lo bastante\n');
  for (const r of RUTAS) {
    ok(`${r.replace('src/app/api/v1/', '')}: maxDuration = 300`, /export const maxDuration = 300;/.test(leer(r)));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
