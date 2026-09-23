/**
 * Lote 185 -- dos logs que señalaban al sitio equivocado.
 *
 * POR QUE, Y NO ES COSMETICA
 * --------------------------
 * El 2026-09-22, buscando por que imprimir un recibo daba error, el ruido de
 * los registros de PRODUCCION mando a mirar donde no era. Dos causas, las dos
 * arreglables:
 *
 *  1. `[Queue] Timeout adding job to dgii-estado - Redis is likely offline`
 *     salia SIN QUE NADIE HUBIERA ESPERADO NADA. `addJob` armaba su
 *     `setTimeout` de 1.500 ms ANTES de mirar si existe la cola, y no lo
 *     cancelaba al salir por el camino rapido -- que es el camino normal desde
 *     que se retiro `REDIS_URL`. El aviso saltaba 1,5 s despues y, en
 *     serverless, se atribuia a la peticion que estuviera corriendo en ese
 *     momento: en los logs aparecia DENTRO de una impresion de factura.
 *
 *  2. `Error fetching RNC from dgiiapicloud: fetch failed` se escribia con
 *     `console.error` en una peticion que devolvio 201. Es un caso PREVISTO:
 *     `EcfValidator` en modo no estricto lo registra y sigue. Pero
 *     `instrumentation.ts` intercepta todo `console.error` y lo manda a Sentry,
 *     asi que cada emision con la API de RNC caida abria un incidente por algo
 *     que el sistema habia decidido tolerar.
 *
 * LO QUE SE VIGILA: que el reloj del plazo solo se arme cuando hay a quien
 * esperar y se cancele siempre, y que un fallo ya resuelto por quien llama no
 * se declare error.
 *
 * ALCANCE, dicho para que nadie lea de mas: esto se comprueba leyendo el
 * codigo. El comportamiento en serverless -- que el aviso caiga en otra
 * peticion -- no se puede reproducir en un banco.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };

const COLA = 'src/infrastructure/queue.ts';
const RNC = 'src/services/dgii/rncLookup.ts';
const VALIDADOR = 'src/services/ecfValidator.ts';
const INSTRUMENTACION = 'src/instrumentation.ts';

async function main() {
  const cola = leer(COLA);
  const rnc = leer(RNC);

  // Valen en los DOS estados: lo que el lote cambia es COMO se registra, no que
  // exista el plazo ni que la consulta de RNC pueda fallar.
  if (!/1500/.test(cola)) throw new Error('Precondicion: addJob ya no tiene plazo para encolar');
  if (!/triggerFallback/.test(cola)) throw new Error('Precondicion: ya no hay camino de respaldo sin Redis');
  // Y esta es la que da sentido al segundo cambio: el interceptor que manda
  // los `console.error` a Sentry.
  if (!/console\.error = /.test(leer(INSTRUMENTACION))) {
    throw new Error('Precondicion: ya no se interceptan los console.error hacia Sentry');
  }
  // Quien llama sigue decidiendo: si esto se cae, bajar el nivel SI perderia
  // informacion.
  const validador = leer(VALIDADOR);
  if (!/DGII lookup unavailable/.test(validador) || !/strict/.test(validador)) {
    throw new Error('Precondicion: EcfValidator ya no resuelve el fallo de la consulta de RNC');
  }
  //  ESTAS TRES VALEN EN LOS DOS ESTADOS -- el lote cambia CUANDO y CON QUE
  //  NIVEL se registra, no el texto ni lo que se devuelve --, asi que como
  //  comprobaciones regalaban un OK en la contraprueba (seccion 4 del metodo).
  //  Son guardas, y van aqui.
  if (!/Timeout adding job to \$\{queueName\}/.test(cola)) {
    throw new Error('Precondicion: el aviso de plazo agotado ya no dice lo mismo; los registros viejos no se podrian buscar');
  }
  if (!/message: 'Error de red al consultar DGII\.'/.test(rnc) || !/success: false/.test(rnc)) {
    throw new Error('Precondicion: la consulta de RNC ya no devuelve el mismo resultado a quien llama');
  }
  //  Bajar el nivel del log no puede convertir un fallo serio en algo que nadie
  //  ve: en modo estricto el validador tiene que seguir bloqueando.
  if (!/DGII_LOOKUP_FAILED/.test(validador)) {
    throw new Error('Precondicion: el modo estricto ya no bloquea cuando no se puede verificar el RNC');
  }
  console.log('  pre   el plazo, el respaldo sin Redis, el interceptor de Sentry, el texto del aviso y el modo estricto siguen en pie');

  console.log('\n1) El reloj del plazo solo corre cuando hay a quien esperar\n');
  const codigoCola = sinComentarios(cola);

  // Lo que estaba mal: el `setTimeout` al principio de la funcion, fuera de
  // todo, armandose aunque no hubiera cola.
  const cuerpo = codigoCola.slice(codigoCola.indexOf('export async function addJob'));
  const antesDelTry = cuerpo.slice(0, cuerpo.indexOf('try {'));
  ok('no se arma el reloj antes de saber si hay cola',
    !/setTimeout\(/.test(antesDelTry), antesDelTry.includes('setTimeout(') ? 'sigue habiendo un setTimeout suelto' : '');
  ok('  el plazo se aplica a la promesa de encolar, no a todo',
    /const conPlazo = /.test(codigoCola) && /Promise\.race\(\[promesa, espera\]\)/.test(codigoCola));
  ok('  y se usa donde se espera de verdad',
    /await conPlazo\(addPromise\)/.test(codigoCola));

  // LO QUE MAS IMPORTA: cancelarlo. Sin esto el aviso sale igual cuando la cola
  // SI respondio a tiempo.
  ok('el reloj se CANCELA al salir, pase lo que pase',
    /\} finally \{[\s\S]{0,200}clearTimeout\(relojDelPlazo\)/.test(codigoCola));
  ok('  y el camino sin cola no lo arma siquiera',
    codigoCola.indexOf('conPlazo') > codigoCola.indexOf('return await triggerFallback'),
    'el respaldo va antes que el plazo');


  console.log('\n2) Un fallo que quien llama ya resuelve no es un error\n');
  const codigoRnc = sinComentarios(rnc);
  ok('la consulta de RNC no escribe console.error',
    !/console\.error/.test(codigoRnc), codigoRnc.includes('console.error') ? 'sigue ahi' : '');
  ok('  lo registra como AVISO', /Logger\.warn\(/.test(codigoRnc));
  ok('  importando el registrador de verdad', /from '@\/utils\/logger'/.test(rnc));
  // La clave de API viaja en una cabecera: un volcado del error entero podria
  // arrastrarla al registro.
  ok('  y no vuelca el error entero, solo su mensaje',
    /motivo: \(error as Error\)\?\.message/.test(codigoRnc)
    && !/Logger\.warn\([^)]*, error\)/.test(codigoRnc));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
