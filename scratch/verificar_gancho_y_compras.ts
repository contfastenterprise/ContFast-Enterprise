/**
 * Dos cosas que salieron de medir el informe de react-doctor del lote 90.
 *
 * 1. EL GANCHO DECIA "REGRESIONES" SIEMPRE
 * ----------------------------------------
 * `react-doctor --staged` analiza ENTEROS los ficheros que hay en el indice y
 * reporta toda su deuda, venga de donde venga. Al commitear el lote 90 -- que
 * anadia un `aria-label` y nada mas -- salieron 332 hallazgos y "found staged
 * regressions". El commit anterior, con UNA pantalla en vez de tres, habia dado
 * 120. La diferencia era cuantos ficheros se pusieron en el indice, no lo que
 * traia el cambio.
 *
 * Un aviso que sale rojo siempre no avisa de nada. `--scope lines` deja solo lo
 * que roza las lineas tocadas: 332 -> 1, medido con el propio lote 90.
 *
 * LA TRAMPA: un `--scope` que la version no conozca NO falla. Imprime
 * 'Invalid --scope "x". ... Ignoring.', vuelve a analizar los ficheros enteros,
 * y sale con codigo CERO. O sea que el gancho volveria al comportamiento de
 * antes sin decir nada -- y la comprobacion de eso tiene que ir ANTES del
 * reparto por codigo de salida, porque ese nunca se alcanzaria.
 *
 * 2. LOS DOS UNICOS ERRORES ROJOS DEL INFORME
 * -------------------------------------------
 * `animate={{ height: 'auto' }}` en el panel del cheque en garantia de compras.
 * Animar la altura obliga a recalcular la disposicion en cada fotograma, y
 * arrastra con ella todo lo que venga debajo -- y ese panel se despliega dentro
 * de un formulario largo. Se anima opacidad y desplazamiento, que se resuelven
 * en la capa de composicion.
 *
 * Y seis `window.open(url, '_blank')` sin `noopener`. Todas abren rutas propias
 * de impresion, asi que el riesgo hoy es bajo; pero la palabra cuesta nada y no
 * depende de que la ruta siga siendo propia manana.
 *
 * LO QUE ESTE BANCO NO COMPRUEBA
 * ------------------------------
 * Que react-doctor haga bien su trabajo. Eso no es nuestro. Lo que se comprueba
 * es que el gancho le pase `--scope lines` por sus CUATRO caminos, que avise si
 * lo ignoran, y que en compras no quede ni una animacion de altura ni un
 * `window.open` a pelo.
 */
import { fuente, crudo } from './_fuente';

const CO = 'src/app/dashboard/purchases/page.tsx';
const GA = '.git/hooks/pre-commit';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

const leer = (ruta: string): string => {
  try { return crudo(ruta).replace(/\r\n/g, '\n'); } catch { return ''; }
};
const tiene = (s: string, t: string): boolean => s.length > 0 && s.includes(t);
const noTiene = (s: string, t: string): boolean => s.length > 0 && !s.includes(t);
const veces = (s: string, t: string): number => s.split(t).length - 1;

const com = fuente(CO).replace(/\r\n/g, '\n');
const gancho = leer(GA);

// Precondicion, no comprobacion: casi todo lo que sigue son negaciones, y una
// negacion sobre una cadena vacia es cierta gratis.
if (com.length < 50000) {
  throw new Error('No se pudo leer la pantalla de compras. Revisa las rutas.');
}

// ---------------------------------------------------------------- 1. COMPRAS
ok('compras no anima la altura de ningun panel',
  noTiene(com, "height: 'auto'") && noTiene(com, 'height: 0'));

// Que no anime la altura no basta: si se hubiera quitado la animacion a secas,
// el panel apareceria de golpe. Tiene que seguir habiendo transicion.
ok('y el panel del cheque sigue apareciendo con transicion',
  tiene(com, 'initial={{ opacity: 0, y: -8 }}') && tiene(com, 'animate={{ opacity: 1, y: 0 }}'));

ok('ningun window.open se queda sin noopener',
  veces(com, 'window.open(') > 0
  && veces(com, 'window.open(') === veces(com, "'noopener,noreferrer'"));

// La frase va partida por el salto de linea del comentario, asi que buscarla
// tal cual no la encuentra nunca. Se aplana primero. (Tercera vez que tropiezo
// con esto: lo caza el contraste, no la lectura.)
const comCrudo = crudo(CO).replace(/\n\s*\*?/g, ' ').replace(/\s+/g, ' ');
ok('queda escrito por que la altura no se anima',
  tiene(comCrudo, 'recalcular la disposicion'));

// ---------------------------------------------------------------- 2. EL GANCHO
// Precondicion: `.git/hooks/` no lo versiona git, asi que el gancho vive solo en
// esta copia del repo. Si no se puede leer, todo lo que sigue son negaciones
// sobre una cadena vacia -- ciertas gratis -- y este banco daria verde sin haber
// mirado el gancho. Va como excepcion y no como `ok(...)` porque salia OK antes
// del arreglo tambien: el fichero ya existia.
if (gancho.length < 1000) {
  throw new Error(
    'No se pudo leer .git/hooks/pre-commit. Ojo: ese fichero NO lo versiona ' +
    'git, asi que en un clon nuevo no existe hasta que se instale a mano.'
  );
}

ok('el gancho pasa --scope lines por sus CUATRO caminos',
  [
    '"./node_modules/.bin/react-doctor" --staged --blocking warning --scope lines',
    '\n    react-doctor --staged --blocking warning --scope lines',
    'pnpm dlx react-doctor@latest --staged --blocking warning --scope lines',
    'npx --yes react-doctor@latest --staged --blocking warning --scope lines',
  ].every((inv) => tiene(gancho, inv)));

// Lo importante y lo que casi se me pasa: cuando el `--scope` se ignora, la
// herramienta sale con CERO. Si el aviso viviera dentro del reparto por codigo
// de salida, no se alcanzaria nunca.
ok('avisa si le ignoran el --scope, y ANTES del reparto por codigo de salida',
  tiene(gancho, "grep -q 'Invalid --scope'")
  && gancho.indexOf("grep -q 'Invalid --scope'") < gancho.indexOf('if [ "$react_doctor_status" -eq 0 ]'));

ok('el mensaje ya no dice "regresiones" de lo que no lo es',
  noTiene(gancho, 'found staged regressions')
  && tiene(gancho, 'hallazgos en las LINEAS que tocaste'));

// Y el aviso dice la verdad incomoda: puede salir deuda vieja que roce tu
// edicion. Sin esa linea, el primer falso positivo desacredita el gancho entero.
ok('y avisa de que lo que salga puede no ser tuyo',
  tiene(gancho, 'puede ser deuda vieja cuyo tramo solapa con tu edicion'));

// Precondicion, por lo mismo: estas dos guardas son del lote 81 y salian OK
// antes y despues. Pero si alguien las pierde al tocar el gancho, el gancho
// vuelve a mentir por las dos puertas que ya se cerraron -- y eso hay que
// saberlo aunque no sea lo que mide este lote.
if (!tiene(gancho, 'ERR_MODULE_NOT_FOUND')
    || !tiene(gancho, 'Cannot scan staged files while configuration differs')) {
  throw new Error(
    'El gancho perdio las guardas del lote 81: volveria a decir "encontro ' +
    'regresiones" cuando react-doctor no arranco o se nego a escanear.'
  );
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
