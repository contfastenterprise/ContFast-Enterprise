/**
 * Lote 197 -- el motivo de verdad llega hasta donde se puede leer.
 *
 * DE DONDE SALE
 * -------------
 * Leyendo los registros de PRODUCCION el 2026-09-25 mientras el dueño recargaba el
 * panel:
 *
 *     🚫 GET /api/v1/dashboard
 *     ERROR "Error fetching dashboard data:"
 *       message: "Failed query: select \"id\", \"ncf\", ... from \"invoices\" ..."
 *
 * El panel de produccion devuelve **500**, y con el se cae el envio de los avisos por
 * WhatsApp, que vive en esa misma ruta (lote 178). Pero el mensaje no dice que paso:
 * "Failed query" es el envoltorio de Drizzle y el error real viaja en `error.cause`,
 * que nadie leia.
 *
 * MEDIDO ANTES DE TOCAR NADA
 *  · La consulta que aparece en el mensaje **funciona sola**: 10 filas en 928 ms
 *    (leida contra PRODUCCION, en una transaccion de solo lectura).
 *  · El 500 llego **20 ms** despues de la peticion vecina -- demasiado rapido para un
 *    tiempo agotado. Apunta a la conexion, no a la consulta.
 *  · Conexiones abiertas contra la base: 13 de 60. No es agotamiento del servidor.
 * Con eso hay una sospecha (`CONNECTION_CLOSED` sobre una conexion que el pooler de
 * Supabase cerro; el pool de produccion es `max: 2` y el proceso sobrevive entre
 * peticiones), pero **una sospecha no es una causa**: sin leer `cause` no se puede
 * afirmar, y cambiar la conexion de produccion adivinando es lo que este lote evita.
 *
 * LO QUE ESTE BANCO EJECUTA: la regla, con la forma real de los errores de Drizzle y
 * de postgres.js.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

const RUTA = 'src/app/api/v1/dashboard/route.ts';

async function main() {
  const ruta = leer(RUTA);

  //  PRECONDICIONES, ciertas en los DOS estados.
  if (ruta === '') throw new Error('Precondicion: no esta la ruta del panel');
  if (!/catch \(err: unknown\)/.test(ruta)) throw new Error('Precondicion: la ruta ya no atrapa su error');
  if (!/status: 500/.test(ruta)) throw new Error('Precondicion: la ruta ya no contesta 500 al fallar');
  //  El envio de avisos sale de esta misma ruta: es la razon por la que un fallo mudo
  //  aqui apaga dos cosas. Si dejara de estar, este banco vigilaria otra cosa.
  if (!/enviarAvisosPendientes/.test(ruta)) {
    throw new Error('Precondicion: los avisos ya no se mandan desde la ruta del panel');
  }
  //  LA CONEXION NO SE TOCA EN ESTE LOTE, y va aqui a proposito. La sospecha es
  //  `CONNECTION_CLOSED` sobre una conexion que el pooler de Supabase cerro, y la cura
  //  seria que postgres.js recicle antes (`idle_timeout`, `max_lifetime`). Pero eso se
  //  decide con la CAUSA delante, no con una sospecha -- es la regla de medir antes de
  //  decidir, y produccion no es sitio para probar. Como precondicion, el dia que
  //  alguien lo cambie este banco se niega a correr en vez de dar un FALLA suave.
  const dbIndex = leer('src/db/index.ts');
  if (dbIndex === '') throw new Error('Precondicion: no esta la conexion a la base');
  if (/idle_timeout|max_lifetime/.test(dbIndex)) {
    throw new Error('Precondicion: la conexion ya lleva idle_timeout/max_lifetime — este lote no lo puso; miralo antes de seguir');
  }
  console.log('  pre   la ruta del panel sigue atrapando su error, contestando 500, mandando los avisos, y la conexion sin tocar');

  const codigo = sinComentarios(ruta);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) La regla, EJECUTADA con la forma real de los errores\n');
  // ───────────────────────────────────────────────────────────────────────────
  let M: typeof import('../src/utils/motivoDelError') | null = null;
  try { M = await import('../src/utils/motivoDelError'); } catch { M = null; }

  const ETIQUETAS = [
    'la causa envuelta por Drizzle SALE (era lo que se perdia)',
    'el codigo del error va delante: es lo que se puede buscar',
    'a la pantalla va el nucleo, no el envoltorio con el SQL',
    'un error suelto, sin causa, sigue diciendo lo suyo',
  ];

  if (!M) {
    for (const t of ETIQUETAS) ok(t, false, 'no existe utils/motivoDelError.ts');
  } else {
    const { motivoDelError, motivoParaLaPantalla } = M;

    //  LA FORMA EXACTA DE PRODUCCION: Drizzle envuelve el error de postgres.js en un
    //  Error cuyo mensaje es "Failed query: <sql>" y cuyo `cause` es el de verdad.
    const sql = 'select "id", "ncf", "ecf_type" from "invoices" where "company_id" = $1';
    const deLaBase = Object.assign(new Error('write CONNECTION_CLOSED aws-1-us-east-1.pooler.supabase.com:5432'), {
      code: 'CONNECTION_CLOSED',
    });
    const deDrizzle = new Error(`Failed query: ${sql}`, { cause: deLaBase });

    const completo = motivoDelError(deDrizzle);
    ok(ETIQUETAS[0], /CONNECTION_CLOSED/.test(completo), completo);
    ok(ETIQUETAS[1],
      /CONNECTION_CLOSED: write CONNECTION_CLOSED/.test(completo));
    //  Se lee de fuera adentro: lo primero es lo que se rompio, lo ultimo el porque.
    ok('  y se lee de fuera adentro, con lo que fallo delante',
      completo.startsWith('Failed query:') && completo.includes('←'), completo.slice(0, 60));

    const paraLaPantalla = motivoParaLaPantalla(deDrizzle);
    ok(ETIQUETAS[2],
      /CONNECTION_CLOSED/.test(paraLaPantalla) && !/select |invoices/.test(paraLaPantalla),
      paraLaPantalla);

    ok(ETIQUETAS[3],
      motivoDelError(new Error('sesion expirada')) === 'sesion expirada');
    //  Un error de PostgreSQL trae codigo numerico: `53300` es "too many connections",
    //  `42703` "column does not exist". Sin el codigo hay que leer el mensaje entero.
    const deServidor = new Error('Failed query: select 1', {
      cause: Object.assign(new Error('remaining connection slots are reserved'), { code: '53300' }),
    });
    ok('  un codigo de PostgreSQL tambien sale, y a la pantalla va solo el',
      /53300/.test(motivoDelError(deServidor))
      && motivoParaLaPantalla(deServidor).startsWith('53300'),
      motivoParaLaPantalla(deServidor));

    //  Tres niveles: pasa en las rutas que envuelven el error otra vez.
    const tresNiveles = new Error('fallo el panel', {
      cause: new Error('Failed query: select 1', { cause: new Error('timeout') }),
    });
    ok('  una cadena de tres tambien se sigue hasta el fondo',
      motivoDelError(tresNiveles).includes('timeout')
      && motivoParaLaPantalla(tresNiveles) === 'timeout');

    //  NUNCA LANZA, y esto no es teorico: corre dentro de un `catch`, o sea que si
    //  lanzara convertiria un 500 con motivo en un 500 sin nada.
    const noRevienta = (() => {
      try {
        const circular = new Error('a');
        (circular as { cause?: unknown }).cause = circular;
        void motivoDelError(circular);
        void motivoDelError(null);
        void motivoDelError(undefined);
        void motivoDelError('texto suelto');
        void motivoDelError(42);
        void motivoDelError({ sin: 'mensaje' });
        void motivoParaLaPantalla(null);
        return true;
      } catch { return false; }
    })();
    ok('no revienta con nada: ni con una causa circular, ni sin error', noRevienta);
    //  UN CICLO DE DOS, y no de uno. El tope de profundidad ya corta el ciclo de uno
    //  (`a.cause = a`), asi que con ese solo no se nota si falta el guardian de vistos:
    //  un mutante que lo quitaba SOBREVIVIO. Con `a → b → a` sin guardian saldria
    //  "a ← b ← a ← b ← a", repitiendo lo mismo hasta el tope.
    const uno = new Error('el de fuera');
    const otro = new Error('el de dentro');
    (uno as { cause?: unknown }).cause = otro;
    (otro as { cause?: unknown }).cause = uno;
    const deCiclo = motivoDelError(uno);
    ok('  una causa circular no se repite en el motivo',
      deCiclo === 'el de fuera ← el de dentro', deCiclo);
    ok('  y sin nada que decir, lo dice',
      motivoDelError(null) === 'error sin motivo' && motivoParaLaPantalla(undefined) === 'error sin motivo');
    //  Un registro no puede comerse la pantalla ni el ancho de un aviso.
    const larguisimo = new Error('Failed query: ' + 'x'.repeat(3000), {
      cause: new Error('y'.repeat(3000)),
    });
    ok('  y lo que sale esta acotado', motivoDelError(larguisimo).length <= 401
      && motivoParaLaPantalla(larguisimo).length <= 161,
      `${motivoDelError(larguisimo).length} y ${motivoParaLaPantalla(larguisimo).length}`);

    const fuente = leer('src/utils/motivoDelError.ts');
    ok('  la regla es pura: ni red, ni base, ni React',
      fuente !== '' && !/^import /m.test(sinComentarios(fuente)));
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n2) La ruta del panel usa la regla\n');
  // ───────────────────────────────────────────────────────────────────────────
  ok('el registro lleva el motivo de verdad',
    /console\.error\('Error fetching dashboard data:', motivoDelError\(err\)/.test(codigo)
    && /from '@\/utils\/motivoDelError'/.test(ruta));
  //  El rastro de pila es lo unico que dice EN QUE consulta fue: el motivo se añade,
  //  no sustituye.
  ok('  sin perder el rastro de pila, que dice en que consulta fue',
    /motivoDelError\(err\), err\)/.test(codigo));
  ok('a la pantalla va el nucleo del error',
    /message: motivoParaLaPantalla\(err\)/.test(codigo));
  //  NEGATIVA ATADA AL POSITIVO: antes se mandaba `(err as Error).message`, que es el
  //  envoltorio de Drizzle con el SQL dentro.
  ok('  y ya no se le manda al navegador la consulta que fallo',
    /motivoParaLaPantalla\(err\)/.test(codigo)
    && !/message: \(err as Error\)\.message/.test(codigo));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) Lo que este lote NO hace, y es deliberado\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  NO se toca la conexion. La sospecha es `CONNECTION_CLOSED` sobre una conexion que
  //  el pooler cerro, y la cura seria que postgres.js recicle antes (`idle_timeout`,
  //  `max_lifetime`). Pero eso se decide con la causa delante, no con una sospecha: es
  //  la regla de medir antes de decidir, y produccion no es sitio para probar.
  //  "No se toca la conexion" va de PRECONDICION (arriba) y no de comprobacion: es
  //  verdad antes y despues del lote, asi que como comprobacion regalaba un OK en la
  //  contraprueba. Como precondicion es mas ruidosa -- el dia que alguien ponga
  //  `idle_timeout`, este banco no dara FALLA: se negara a correr, y quien lo cambie
  //  tendra que decidirlo a la vista de esto.
  console.log('  (que no se toque la conexion: de precondicion, arriba)');
  //  Y este lote arregla UNA ruta, la que se vio caer. Las demas siguen registrando su
  //  error sin la causa; barrerlas es otro lote, y queda dicho aqui para que no se
  //  crea que ya esta hecho. ATADA AL POSITIVO: sin la regla, "las demas no la tienen"
  //  es cierto de balde.
  const otras = ['src/app/api/v1/invoices/route.ts', 'src/app/api/v1/ecf/route.ts'];
  const sinArreglar = otras.filter(f => leer(f) !== '' && !/motivoDelError/.test(leer(f)));
  ok('queda dicho que las demas rutas siguen sin la causa (otro lote)',
    /motivoDelError/.test(ruta) && sinArreglar.length > 0,
    `${sinArreglar.length} de ${otras.length} miradas`);

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
