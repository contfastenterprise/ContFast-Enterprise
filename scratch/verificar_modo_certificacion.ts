/**
 * Un modo del sistema, un ambiente de la DGII. Y un medidor de lo que falta.
 *
 * EL FALLO QUE SE CIERRA
 * ----------------------
 * Habia DOS interruptores para UNA decision: el modo de la operacion
 * (PRODUCCION/PRUEBA) y un ajuste de empresa aparte, `dgii_env`. Podian
 * contradecirse, y lo hacian:
 *
 *     modo = PRODUCCION   +   dgii_env = 'test'
 *
 * Datos reales, presentacion de ensayo. Y el resolutor lo decidia en silencio:
 * 'test' no coincidia con ninguna rama y caia en un `return 'TesteCF'` final.
 * La factura volvia "Aceptado", con codigo de seguridad, sin un solo error
 * visible -- pero de TesteCF.
 *
 * Eso no se arregla eligiendo mejor el valor por defecto. Se arregla quitando
 * el segundo interruptor. Ahora:
 *
 *     PRUEBA         -> TesteCF
 *     CERTIFICACION  -> CerteCF
 *     PRODUCCION     -> eCF
 *
 * LA SEGUNDA MITAD DE ESTE BANCO
 * ------------------------------
 * `CERTIFICACION` existe en la base (0046) y en este resolutor, pero el RESTO
 * del sistema todavia da por hecho que hay dos modos. Este banco cuenta cuanto
 * queda y se comporta como trinquete: puede bajar, nunca subir. Si alguien
 * anade una declaracion nueva de `'PRODUCCION' | 'PRUEBA'`, salta.
 */
import { entornoDgii, NOMBRE_ENTORNO, type ModoSistema } from '../src/services/dgii/entorno';
import { execSync } from 'child_process';
import { join } from 'path';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

/**
 * Techo de declaraciones que aun fijan dos modos. BAJARLO segun se vaya
 * haciendo la estructura; no subirlo.
 *
 * SE HA SUBIDO UNA VEZ, Y CONVIENE SABER POR QUE
 * ----------------------------------------------
 * El 133 se midio sobre una copia del arbol que estaba atrasada respecto al
 * repo real. Al ponerlas al dia aparecieron seis declaraciones mas -- en
 * `ClientLayout`, `accountingRepository`, `apRepository`, `arRepository` (dos)
 * y `invoiceDbBooker` -- y desaparecieron cuatro, con lo que la cuenta real es
 * 135. No es que se hayan anadido: es que nunca se habian contado.
 *
 * Una sola recalibracion contra el arbol de verdad. A partir de aqui, subir es
 * una regresion: cada declaracion nueva que fije dos modos es un sitio mas que
 * leera CERTIFICACION como si fuera produccion.
 */
const TECHO_UNIONES = 132;

const lanza = (fn: () => unknown): string | null => {
  try { fn(); return null; } catch (e: any) { return e.message; }
};

function contar(patron: string): number {
  const raiz = join(__dirname, '..');
  try {
    const salida = execSync(
      `grep -rn ${JSON.stringify(patron)} src/ --include=*.ts --include=*.tsx | grep -v vitest | wc -l`,
      { cwd: raiz, encoding: 'utf8' }
    );
    return Number(salida.trim());
  } catch {
    return -1;
  }
}

console.log('\n1) Un modo, un ambiente\n');

ok('PRUEBA -> TesteCF', entornoDgii('PRUEBA') === 'TesteCF');
ok('CERTIFICACION -> CerteCF', entornoDgii('CERTIFICACION') === 'CerteCF');
ok('PRODUCCION -> eCF', entornoDgii('PRODUCCION') === 'eCF');

console.log('\n2) REGRESION: ningun ajuste puede desviar el ambiente\n');

// El fallo original: `entornoDgii('PRODUCCION', 'test')` daba TesteCF. Ahora la
// funcion solo acepta el modo, asi que ese segundo argumento no existe. Pasarlo
// no cambia nada -- que es justamente lo que se quiere comprobar.
ok('PRODUCCION sigue siendo eCF aunque se pase un ajuste viejo',
  (entornoDgii as any)('PRODUCCION', 'test') === 'eCF');
ok('y con cualquier otro valor tambien',
  (entornoDgii as any)('PRODUCCION', 'sandbox') === 'eCF' &&
  (entornoDgii as any)('PRODUCCION', null) === 'eCF' &&
  (entornoDgii as any)('PRODUCCION', undefined) === 'eCF');
ok('PRUEBA nunca llega a produccion, se pase lo que se pase',
  (entornoDgii as any)('PRUEBA', 'production') === 'TesteCF');

console.log('\n3) Un modo desconocido se para, no elige por su cuenta\n');

for (const malo of ['produccion', 'PROD', 'test', '', null, undefined, 'CERT']) {
  const m = lanza(() => entornoDgii(malo as ModoSistema));
  ok(`${JSON.stringify(malo)} -> lanza`, m !== null, m ? '' : 'devolvio algo');
}
const mensaje = lanza(() => entornoDgii('PROD' as ModoSistema)) || '';
ok('el mensaje dice cuales son validos',
  mensaje.includes('PRUEBA') && mensaje.includes('CERTIFICACION') && mensaje.includes('PRODUCCION'));
ok('y deja claro que no hay valor por defecto', /por defecto/i.test(mensaje));

console.log('\n4) Los nombres para pantalla no deciden nada\n');

ok('hay nombre para los tres ambientes',
  NOMBRE_ENTORNO.TesteCF === 'Pruebas' &&
  NOMBRE_ENTORNO.CerteCF === 'Certificación' &&
  NOMBRE_ENTORNO.eCF === 'Producción');

console.log('\n5) MEDIDOR: cuanto falta para que CERTIFICACION sea usable\n');

const uniones = contar("'PRODUCCION' | 'PRUEBA'");
const binarias = contar("=== 'PRUEBA'");

console.log(`        declaraciones que fijan dos modos : ${uniones}   (techo ${TECHO_UNIONES})`);
console.log(`        comparaciones "todo lo que no es PRUEBA es produccion" : ${binarias}`);
console.log('');
console.log('        Mientras esos numeros no sean 0, poner una empresa en');
console.log('        CERTIFICACION haria que se lea como PRODUCCION en la mayor');
console.log('        parte del sistema. Por eso el modo no se ofrece todavia en');
console.log('        ninguna interfaz.');

ok('el numero de declaraciones de dos modos NO ha subido',
  uniones >= 0 && uniones <= TECHO_UNIONES,
  `${uniones} vs techo ${TECHO_UNIONES}`);

if (uniones >= 0 && uniones < TECHO_UNIONES) {
  console.log(`\n        (bajo de ${TECHO_UNIONES} a ${uniones}: baja TECHO_UNIONES a ${uniones} en este fichero)`);
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
