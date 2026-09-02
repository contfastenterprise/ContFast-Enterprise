/**
 * Leer el fuente para escanearlo, sin que los comentarios cuenten como codigo.
 *
 * POR QUE EXISTE
 * --------------
 * Muchos bancos comprueban que una guarda sigue puesta buscando su texto en el
 * fichero. El problema es que el comentario que EXPLICA la guarda cita
 * necesariamente el mismo patron, asi que:
 *
 *   - un banco podia dar OK porque el patron estaba en un comentario, con la
 *     guarda ya borrada del codigo -- verde falso, que es el peor resultado
 *     posible en una auditoria;
 *   - y al reves, los bancos que buscan que algo NO este se acusaban a si
 *     mismos por su propia cabecera.
 *
 * Las dos cosas pasaron de verdad en esta auditoria. Y al buscar restos con
 * `grep` durante la sesion, los comentarios dieron falsos positivos tres veces.
 *
 * POR QUE NO VALE UN `replace` CON UNA REGEX SUELTA
 * -------------------------------------------------
 * Ese era el apano que llevaban cinco bancos, cada uno con su copia. Se lleva
 * por delante lo que hay dentro de las cadenas:
 *
 *     'https://ecf.dgii.gov.do/...'   ->   'https:
 *
 * Es decir, un banco que compruebe la URL de la DGII se rompe, o peor, deja de
 * verla y pasa por otro motivo.
 *
 * (Aparte: la primera version de ESTE fichero no compilaba, porque la cabecera
 * citaba la regex del apano y esa regex contiene la secuencia que cierra un
 * comentario de bloque. El fichero sobre comentarios, roto por un comentario.
 * Por eso aqui se describen con palabras y no se pegan literales.)
 *
 * COMO LO HACE ESTE
 * -----------------
 * Recorre el texto llevando la cuenta de si esta dentro de una cadena, una
 * plantilla, una expresion regular o un comentario, y solo quita lo ultimo.
 */

/**
 * Quita comentarios `//` y ...(barra-asterisco)... respetando cadenas,
 * plantillas y expresiones regulares.
 *
 * Los comentarios se sustituyen por espacios en vez de borrarse, para que las
 * posiciones y los numeros de linea no se muevan: asi un `indexOf` sigue
 * comparando lo mismo que en el fichero real.
 */
export function sinComentarios(texto: string): string {
  const n = texto.length;
  let out = '';
  let i = 0;

  // Para distinguir `/` de division de `/` de expresion regular hace falta
  // saber que hubo antes. Tras un identificador, un numero o un cierre, la
  // barra es division; en cualquier otro sitio, empieza una regex.
  let ultimoSignificativo = '';

  while (i < n) {
    const c = texto[i];
    const sig = texto[i + 1];

    // --- comentario de linea
    if (c === '/' && sig === '/') {
      while (i < n && texto[i] !== '\n') { out += ' '; i++; }
      continue;
    }

    // --- comentario de bloque
    if (c === '/' && sig === '*') {
      out += '  '; i += 2;
      while (i < n && !(texto[i] === '*' && texto[i + 1] === '/')) {
        out += texto[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  '; i += 2;
      continue;
    }

    // --- cadenas y plantillas
    if (c === '"' || c === "'" || c === '`') {
      const comilla = c;
      out += c; i++;
      while (i < n) {
        if (texto[i] === '\\') { out += texto[i] + (texto[i + 1] ?? ''); i += 2; continue; }
        if (texto[i] === comilla) { out += texto[i]; i++; break; }
        // Dentro de una plantilla puede haber `${ ... }` con codigo, pero
        // meterse ahi no aporta: lo que importa es no tratar el contenido
        // como comentario, y eso ya se cumple.
        out += texto[i]; i++;
      }
      ultimoSignificativo = comilla;
      continue;
    }

    // --- expresion regular literal
    if (c === '/' && !/[A-Za-z0-9_)\]$]/.test(ultimoSignificativo)) {
      out += c; i++;
      let enClase = false;
      while (i < n) {
        if (texto[i] === '\\') { out += texto[i] + (texto[i + 1] ?? ''); i += 2; continue; }
        if (texto[i] === '[') enClase = true;
        else if (texto[i] === ']') enClase = false;
        else if (texto[i] === '/' && !enClase) { out += texto[i]; i++; break; }
        else if (texto[i] === '\n') break; // no era una regex: se corta y ya
        out += texto[i]; i++;
      }
      ultimoSignificativo = '/';
      continue;
    }

    out += c;
    if (!/\s/.test(c)) ultimoSignificativo = c;
    i++;
  }

  return out;
}

import { readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..');

/** El fichero SIN comentarios. Es lo que hay que usar para escanear codigo. */
export const fuente = (rutaRelativa: string): string =>
  sinComentarios(readFileSync(join(RAIZ, rutaRelativa), 'utf8'));

/**
 * El fichero TAL CUAL, comentarios incluidos.
 *
 * Solo para cuando lo que se comprueba ES el comentario -- que en esta
 * auditoria pasa: hay notas que explican por que una consulta NO lleva un
 * filtro, y que ese texto siga ahi es parte de lo que se verifica.
 */
export const crudo = (rutaRelativa: string): string =>
  readFileSync(join(RAIZ, rutaRelativa), 'utf8');

/**
 * El bloque `{ ... }` que sigue a un marcador, con las llaves emparejadas.
 *
 * POR QUE HACE FALTA
 * ------------------
 * Los bancos comprobaban trozos de codigo con ventanas de N caracteres:
 *
 *     /else\s*\{[\s\S]{0,1200}?securityCode:/.test(src)
 *
 * y eso falla en las dos direcciones. Se queda corto (y no ve lo que busca) o
 * se pasa de largo (y encuentra la misma palabra en el bloque siguiente, dando
 * por bueno algo que ya no esta). Medido: al borrar `securityCode` del bloque
 * que le tocaba, la comprobacion seguia pasando. Un detector que no distingue
 * el codigo bueno del malo no es un detector.
 *
 * Con las llaves emparejadas el bloque es el bloque, sin ventanas que ajustar.
 * Se salta llaves dentro de cadenas y comentarios porque recibe la fuente ya
 * limpia de `fuente()`.
 */
export function bloque(src: string, marcador: string | RegExp): string {
  const i = typeof marcador === 'string'
    ? src.indexOf(marcador)
    : (src.match(marcador)?.index ?? -1);
  if (i < 0) return '';
  const abre = src.indexOf('{', i);
  if (abre < 0) return '';
  let n = 0;
  for (let j = abre; j < src.length; j++) {
    if (src[j] === '{') n++;
    else if (src[j] === '}') {
      n--;
      if (n === 0) return src.slice(abre, j + 1);
    }
  }
  return '';
}
