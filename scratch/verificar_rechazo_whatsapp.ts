/**
 * Lote 196 -- un aviso que no sale dice por que, y no se repite la misma pasada.
 *
 * DE DONDE SALE
 * -------------
 * El dueño paso el registro de una sesion del 2026-09-25: cinco avisos, cinco
 * lineas iguales, y otra vez cinco en cada carga del panel.
 *
 *     [avisos-whatsapp] no salio un aviso { clave: 'declaracion-606-202608',
 *                                          motivo: 'HTTP 422' }
 *
 * DOS DEFECTOS, Y NINGUNO ERA LA PLANTILLA
 *  1. El motivo se tiraba: `datos?.error?.message || `HTTP ${res.status}`` solo sabe
 *     leer la forma de error de META, y Kapso contesta con otra. Quedaba "HTTP 422",
 *     que no deja arreglar nada (leccion del lote 185).
 *  2. Se reintentaba igual cinco veces: los cinco avisos de una empresa salen con la
 *     MISMA clave de API, el MISMO numero y la MISMA plantilla, asi que un rechazo
 *     por configuracion ya dice como acaban los otros cuatro.
 *
 * LO QUE ESTE BANCO EJECUTA: las dos reglas, que son puras. La forma de los cuerpos
 * de error esta tomada de lo que devuelven de verdad Meta (`{error:{message}}`) y de
 * las validaciones que contestan `{errors:[...]}`; el caso que importa es el que NO
 * se reconoce, porque es el que dejaba "HTTP 422" a secas.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

const KAPSO = 'src/services/avisos/whatsappKapso.ts';
const BUCLE = 'src/services/avisos/enviarAvisosPendientes.ts';

async function main() {
  const kapso = leer(KAPSO);
  const bucle = leer(BUCLE);

  //  PRECONDICIONES, ciertas en los DOS estados.
  if (kapso === '') throw new Error('Precondicion: no esta whatsappKapso');
  if (bucle === '') throw new Error('Precondicion: no esta enviarAvisosPendientes');
  if (!/mandarWhatsApp/.test(bucle)) throw new Error('Precondicion: ya no se manda ningun aviso');
  //  El lote 178 marca solo lo que SALIO, y este lote no lo cambia: es lo que permite
  //  que un aviso rechazado hoy salga mañana.
  if (!/marcarMandadasPorWhatsApp\(companyId, modo, salieron\)/.test(bucle)) {
    throw new Error('Precondicion: ya no se marca solo lo que salio');
  }
  console.log('  pre   se siguen mandando avisos y se sigue marcando solo lo que salio');

  const codigoKapso = sinComentarios(kapso);
  const codigoBucle = sinComentarios(bucle);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n1) El motivo, EJECUTADO con las formas que llegan de verdad\n');
  // ───────────────────────────────────────────────────────────────────────────
  let M: typeof import('../src/services/avisos/rechazoDeWhatsApp') | null = null;
  try { M = await import('../src/services/avisos/rechazoDeWhatsApp'); } catch { M = null; }

  const ETIQUETAS = [
    'la forma de Meta se sigue leyendo',
    'una forma que no se reconoce ya NO se queda en "HTTP 422"',
    'una validacion con lista de errores se lee entera',
    'un cuerpo que no es JSON tambien dice algo',
  ];

  if (!M) {
    for (const t of ETIQUETAS) ok(t, false, 'no existe services/avisos/rechazoDeWhatsApp.ts');
  } else {
    const { motivoDelRechazo, esRechazoDeTodos } = M;

    //  La de Meta: es la unica que el codigo viejo sabia leer, y no se puede perder.
    ok(ETIQUETAS[0],
      motivoDelRechazo(400, { error: { message: 'Message failed to send because more than 24 hours have passed' } })
        === 'HTTP 400: Message failed to send because more than 24 hours have passed');
    //  ESTE ES EL DEFECTO: antes, cualquier forma desconocida daba "HTTP 422" y ahi se
    //  acababa la investigacion.
    const desconocida = motivoDelRechazo(422, { detalle: 'template not found', codigo: 132001 });
    ok(ETIQUETAS[1],
      desconocida !== 'HTTP 422' && /template not found/.test(desconocida),
      desconocida);
    ok(ETIQUETAS[2],
      motivoDelRechazo(422, { errors: ['to is invalid', { message: 'template is required' }] })
        === 'HTTP 422: to is invalid; template is required');
    ok(ETIQUETAS[3],
      motivoDelRechazo(502, '<html>Bad gateway</html>') === 'HTTP 502: <html>Bad gateway</html>');
    ok('  `{ message }` y `{ error: "texto" }` tambien',
      motivoDelRechazo(401, { message: 'invalid api key' }) === 'HTTP 401: invalid api key'
      && motivoDelRechazo(403, { error: 'forbidden' }) === 'HTTP 403: forbidden');
    //  EL ESTADO SIEMPRE DELANTE: sin el no se puede clasificar el fallo al leer el
    //  registro (un 422 se arregla cambiando la peticion; un 503, esperando).
    ok('  el estado va siempre delante, se reconozca el cuerpo o no',
      motivoDelRechazo(422, null).startsWith('HTTP 422')
      && motivoDelRechazo(503, {}).startsWith('HTTP 503')
      && motivoDelRechazo(422, { errors: [] }).startsWith('HTTP 422'));
    //  SE RECORTA: un cuerpo de error puede traer la peticion de vuelta, y esa lleva
    //  el numero del destinatario.
    const largo = motivoDelRechazo(422, { message: 'x'.repeat(5000) });
    ok('  y lo que se copia esta acotado (un error puede devolver la peticion entera)',
      largo.length < 300, `${largo.length} caracteres`);
    //  Nunca lanza: esto corre en el camino de un panel que tiene que cargar igual.
    const noRevienta = (() => {
      try {
        void motivoDelRechazo(0, undefined);
        void motivoDelRechazo(422, 12345);
        void motivoDelRechazo(422, { errors: { to: ['is invalid'] } });
        return true;
      } catch { return false; }
    })();
    ok('  y no revienta con nada de lo que le llegue', noRevienta);

    // ── esRechazoDeTodos ──
    console.log('\n2) Lo que se rechaza por configuracion, se rechaza para todos\n');
    //  4xx: la peticion es la que esta mal, y la siguiente sera igual de mala.
    ok('un 4xx corta la pasada: misma clave, mismo numero, misma plantilla',
      [400, 401, 403, 404, 422].every(e => esRechazoDeTodos(e) === true));
    //  5xx: el problema es del otro lado; al siguiente puede irle mejor.
    ok('un 5xx no corta: el problema es del otro lado',
      [500, 502, 503].every(e => esRechazoDeTodos(e) === false));
    //  Sin respuesta no hay nada que deducir.
    ok('sin respuesta (red, plazo agotado) tampoco corta',
      esRechazoDeTodos(0) === false);
    //  408 es "tardo demasiado": del momento, no de la peticion.
    ok('  un 408 es del momento, no de la peticion: no corta',
      esRechazoDeTodos(408) === false);
    //  429 SI corta, pero por el motivo contrario: insistir empeora las cosas.
    ok('  un 429 corta, pero porque insistir lo empeora',
      esRechazoDeTodos(429) === true);
    ok('  y un 200 no es un rechazo', esRechazoDeTodos(200) === false);
    const fuente = leer('src/services/avisos/rechazoDeWhatsApp.ts');
    ok('  las dos reglas son puras: ni red, ni base, ni React',
      fuente !== '' && !/^import /m.test(fuente));
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n3) El codigo usa las reglas, y no las copia\n');
  // ───────────────────────────────────────────────────────────────────────────
  ok('el motivo del rechazo sale de la regla',
    /motivoDelRechazo\(res\.status, datos\)/.test(codigoKapso)
    && /from '\.\/rechazoDeWhatsApp'/.test(kapso));
  //  NEGATIVA ATADA AL POSITIVO: "ya no lee solo la forma de Meta" seria cierto de
  //  balde en un fichero que no leyera ningun cuerpo.
  ok('  y ya no se supone la forma del error',
    /motivoDelRechazo\(/.test(codigoKapso)
    && !/datos\?\.error\?\.message \|\| `HTTP/.test(codigoKapso));
  //  El estado tiene que VIAJAR: sin el, quien llama no puede clasificar el fallo.
  ok('el rechazo viaja con su codigo HTTP', /estado: res\.status/.test(codigoKapso));
  ok('  y sin respuesta viaja como 0, que no corta nada',
    /estado: 0/.test(codigoKapso));

  ok('el bucle deja de repetir lo que ya sabe como acaba',
    /esRechazoDeTodos\(r\.estado \?\? 0\)/.test(codigoBucle));
  //  Se dice cuantos quedaron sin intentar: si no, el registro pasaria de cinco
  //  lineas a una y parecerian menos avisos pendientes de los que hay.
  //
  //  SE EXIGE LA CUENTA, NO EL NOMBRE. Un mutante que dejaba `const sinIntentar = 0`
  //  SOBREVIVIO: el identificador seguia ahi y el texto del registro tambien. Mera
  //  presencia otra vez -- con eso, el registro diria siempre "0 sin intentar", que es
  //  peor que no decir nada porque da una cifra falsa.
  ok('  y dice cuantos se quedaron sin intentar',
    /sinIntentar = pendientes\.length - i - 1/.test(codigoBucle)
    && /no se intentan los demas/.test(codigoBucle)
    && /sinIntentar > 0/.test(codigoBucle));

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n4) Lo que este lote NO hace, y es deliberado\n');
  // ───────────────────────────────────────────────────────────────────────────
  //  Sin plantilla configurada, el texto libre solo se acepta dentro de las 24 h desde
  //  que esa persona escribio al numero: el mismo aviso que hoy se rechaza puede salir
  //  mañana sin que nadie cambie nada. Marcarlo como imposible seria perder avisos.
  ok('un aviso rechazado NO se da por perdido: la siguiente carga lo reintenta',
    /esRechazoDeTodos\(/.test(codigoBucle)
    && !/marcarMandadasPorWhatsApp\([^)]*rechaz/i.test(codigoBucle)
    && /marcarMandadasPorWhatsApp\(companyId, modo, salieron\)/.test(codigoBucle));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
