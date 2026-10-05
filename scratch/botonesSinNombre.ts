/**
 * Lote 284 -- que botones de `src` NO tienen un nombre que se lea, en alguna anchura de pantalla.
 *
 * Lo comparte `verificar_iconos_con_nombre.ts`. Sustituye, para esta pregunta, al recuento del lote 270
 * (`verificar_estandar_de_botones.ts`), que daba 19 y de ellos 18 eran falsos: no veia el texto que
 * llega por una variable (`{tab.label}`) ni el que va dentro de un fragmento (`<>... Enviando</>`).
 * Y al reves, no veia el unico de verdad: un texto que EXISTE pero va escondido en el movil
 * (`<span className="hidden sm:inline">`), que deja el boton como un icono suelto en un telefono.
 *
 * Un boton tiene nombre si lleva `aria-label`, `aria-labelledby` o `title`, o si su contenido deja
 * texto a la vista en TODA anchura. Lo que cuenta como texto:
 *  - letras sueltas entre etiquetas, y lo que va en `sr-only` (es justo para eso);
 *  - una cadena dentro de `{...}`;
 *  - una variable o una llamada dentro de `{...}`, salvo que se llame `icon`/`icono` (es un dibujo).
 * Lo que NO cuenta: el contenido de un elemento con `hidden` en su clase, con o sin prefijo
 * (`hidden sm:inline` esconde en el movil; `sm:hidden`, en el escritorio), y los comentarios.
 *
 * Es una heuristica sobre el texto del fichero, no un analizador de JSX: se queda con lo que se
 * escribe en este repositorio. Lo que no sabe leer lo da por NOMBRADO (si duda, no acusa).
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

/** Indice del `>` que cierra la etiqueta que empieza en `i`, saltando llaves (`=>` dentro de `{}`). */
function finDeEtiqueta(s: string, i: number): number {
  let prof = 0;
  for (let k = i + 1; k < s.length; k++) {
    const c = s[k];
    if (c === '{') prof++;
    else if (c === '}') prof--;
    else if (c === '>' && prof === 0) return k;
  }
  return s.length;
}

/** Indice de la `}` que cierra la `{` de `i`. */
function finDeLlave(s: string, i: number): number {
  let prof = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === '{') prof++;
    else if (s[k] === '}') { prof--; if (prof === 0) return k; }
  }
  return s.length;
}

/** `hidden` sin prefijo: escondido en el movil (y visible desde `sm:` si lo reabre). `sm:hidden`: visible solo en el movil. */
const ESCONDE_BASE = /(?:^|[\s"'`])hidden(?=[\s"'`]|$)/;
const ESCONDE_ANCHO = /(?:^|[\s"'`])(?:[\w-]+:)+hidden(?=[\s"'`]|$)/;
const ES_DIBUJO = /^[\w$.]*\b(?:icon|icono)\b$/i;

type Textos = { siempre: string; movil: string; escritorio: string };

/** El texto que el contenido deja a la vista en TODA anchura (vacio si solo hay dibujos). Un texto que
 *  se alterna -- uno `hidden sm:inline` y otro `sm:hidden` -- cuenta: siempre hay uno a la vista. */
export function textoVisible(cuerpo: string): string {
  const t = textos(cuerpo);
  if (t.siempre) return t.siempre;
  return t.movil && t.escritorio ? `${t.movil} / ${t.escritorio}` : '';
}

function textos(cuerpo: string): Textos {
  let out = '';
  let movil = '';
  let escritorio = '';
  for (let i = 0; i < cuerpo.length; i++) {
    const c = cuerpo[i];
    if (c === '<' && /[A-Za-z>/]/.test(cuerpo[i + 1] ?? '')) {
      const fin = finDeEtiqueta(cuerpo, i);
      const tag = cuerpo.slice(i, fin + 1);
      const nombre = /^<([A-Za-z][\w.]*)/.exec(tag)?.[1];
      const clase = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/.exec(tag);
      const cls = clase ? (clase[1] ?? clase[2] ?? clase[3] ?? '') : '';
      const base = ESCONDE_BASE.test(` ${cls} `), ancho = ESCONDE_ANCHO.test(` ${cls} `);
      if (nombre && !tag.endsWith('/>') && (base || ancho)) {
        //  Elemento escondido en alguna anchura: su texto va aparte, segun donde SI se ve.
        const cierre = cuerpo.indexOf(`</${nombre}>`, fin);
        const dentro = textoVisible(cuerpo.slice(fin + 1, cierre < 0 ? cuerpo.length : cierre));
        if (base && !ancho) escritorio += ' ' + dentro; // `hidden sm:inline`
        else if (ancho && !base) movil += ' ' + dentro; // `sm:hidden`
        i = cierre < 0 ? cuerpo.length : cierre + nombre.length + 2;
        continue;
      }
      i = fin;
      continue;
    }
    if (c === '{') {
      const fin = finDeLlave(cuerpo, i);
      out += ' ' + textoDeExpresion(cuerpo.slice(i + 1, fin)) + ' ';
      i = fin;
      continue;
    }
    out += c;
  }
  const limpio = (x: string) => x.replace(/\s+/g, ' ').trim();
  return { siempre: limpio(out), movil: limpio(movil), escritorio: limpio(escritorio) };
}

function textoDeExpresion(e: string): string {
  const x = e.trim();
  if (!x || x.startsWith('/*')) return '';
  if (/<[A-Za-z>]/.test(x)) {
    //  Lleva JSX (un ternario de fragmentos, un `&&`): cuenta lo que haya DENTRO de las etiquetas.
    const partes: string[] = [];
    let k = x.search(/<[A-Za-z>]/);
    while (k >= 0) {
      const desde = k;
      //  Hasta el ultimo cierre de esta rama: el texto entre `<` y el `)`/`:` que la acaba.
      let hasta = x.length;
      for (let j = desde, prof = 0; j < x.length; j++) {
        if (x[j] === '(' || x[j] === '{') prof++;
        else if (x[j] === ')' || x[j] === '}') { if (prof === 0) { hasta = j; break; } prof--; }
        else if ((x[j] === ':' || x[j] === '?') && prof === 0 && x[j - 1] !== '<' && /\s/.test(x[j - 1] ?? '') && /\s/.test(x[j + 1] ?? '')) { hasta = j; break; }
      }
      partes.push(textoVisible(x.slice(desde, hasta)));
      const sig = x.slice(hasta + 1).search(/<[A-Za-z>]/);
      k = sig < 0 ? -1 : hasta + 1 + sig;
    }
    return partes.join(' ');
  }
  const cadenas = x.match(/'[^']*[A-Za-zÁÉÍÓÚáéíóúñ][^']*'|"[^"]*[A-Za-zÁÉÍÓÚáéíóúñ][^"]*"|`[^`]*[A-Za-zÁÉÍÓÚáéíóúñ][^`]*`/g);
  if (cadenas) return cadenas.join(' ');
  if (ES_DIBUJO.test(x)) return '';
  //  Una variable o una llamada: se da por texto (si duda, no acusa).
  return 'texto';
}

export type SinNombre = { fichero: string; linea: number };

/** Botones (`<button>` y `<Button>`) sin nombre en alguna anchura. `IconButton` no entra: el tipo exige `aria-label`. */
export function botonesSinNombre(raiz: string): SinNombre[] {
  const out: SinNombre[] = [];
  (function andar(d: string) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (!p.includes('prueba-ui')) andar(p); continue; }
      if (!p.endsWith('.tsx') || p.endsWith(join('components', 'ui', 'button.tsx'))) continue;
      const s = readFileSync(p, 'utf8');
      for (const m of s.matchAll(/<(button|Button)\b/g)) {
        const ini = m.index!;
        const fin = finDeEtiqueta(s, ini);
        const attrs = s.slice(ini, fin + 1);
        if (/\baria-label(?:ledby)?=|\btitle=/.test(attrs)) continue;
        const cuerpo = attrs.endsWith('/>') ? '' : s.slice(fin + 1, s.indexOf(`</${m[1]}>`, fin));
        //  Un envoltorio que reenvia `{...props}` (o `asChild` con un hijo que las reenvia): el texto y el
        //  aria-label llegan de quien lo usa. Si duda, no acusa.
        if (/\{\s*\.\.\./.test(attrs) || (/\basChild\b/.test(attrs) && /\{\s*\.\.\./.test(cuerpo))) continue;
        if (!textoVisible(cuerpo)) out.push({ fichero: p.slice(raiz.length + 1).replace(/\\/g, '/'), linea: s.slice(0, ini).split('\n').length });
      }
    }
  })(resolve(raiz, 'src'));
  return out;
}
