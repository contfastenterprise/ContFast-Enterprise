/**
 * Lote 269 -- los colores del tema existian solo de nombre.
 *
 * Salio de la auditoria de UI pedida por el dueño (2026-10-03). `globals.css` tiene DOS bloques
 * `@theme`: el primero envuelve cada color en `hsl()`; el segundo (`@theme inline`, que dejo la
 * instalacion de shadcn el 2026-07-01, `75ccbe7`) va despues, gana, y los usaba SIN envolver. Las
 * variables de `:root` son tripletes sueltos ("221 83% 53%"), asi que Tailwind escribia
 * `background-color: var(--primary)` = "221 83% 53%", que no es un color: el navegador lo descarta.
 * Medido en el navegador: `<Button>` transparente con texto negro, el destructivo y la barra de
 * acciones de e-CF con texto BLANCO sobre transparente (invisibles), y todo `border` sin color en
 * negro (la "linea oscura" del lote 216).
 *
 * El banco RESUELVE el tema como el navegador: junta los dos bloques (gana el ultimo), sigue cada
 * `var()` hasta `:root` y exige que lo que queda sea un color de verdad.
 *
 * Se ejecuta con: npx tsx scratch/verificar_colores_del_tema.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const raiz = resolve(__dirname, '..');
const css = readFileSync(resolve(raiz, 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };

/** Las declaraciones `--nombre: valor;` de un bloque que empieza en `cabecera`. */
function bloque(cabecera: RegExp): Map<string, string> {
  const m = cabecera.exec(css);
  if (!m) throw new Error(`Precondicion: no esta el bloque ${cabecera}`);
  const ini = m.index + m[0].length;
  const fin = css.indexOf('}', ini);
  const decl = new Map<string, string>();
  for (const d of css.slice(ini, fin).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) decl.set(d[1], d[2].trim());
  return decl;
}
const tema = bloque(/@theme\s*\{/);
const inline = bloque(/@theme inline\s*\{/);
const root = bloque(/:root\s*\{/);
/** Lo que ve Tailwind: los dos bloques, y en conflicto gana el segundo (va despues). */
const efectivo = new Map([...tema, ...inline]);

const TRIPLETE = /^-?[\d.]+\s+[\d.]+%\s+[\d.]+%$/;
/** El valor final de un --color-*, o el motivo por el que no es un color. */
function resolver(valor: string): { color: boolean; motivo: string } {
  const envuelto = valor.match(/^hsl\(var\((--[a-z0-9-]+)\)\)$/);
  if (envuelto) {
    const r = root.get(envuelto[1]);
    return r && TRIPLETE.test(r) ? { color: true, motivo: '' } : { color: false, motivo: `${envuelto[1]} no es un triplete en :root (${r})` };
  }
  const suelto = valor.match(/^var\((--[a-z0-9-]+)\)$/);
  if (suelto) {
    const r = root.get(suelto[1]) ?? tema.get(suelto[1]);
    if (r === undefined) return { color: false, motivo: `${suelto[1]} no existe` };
    return TRIPLETE.test(r) ? { color: false, motivo: `${suelto[1]} = "${r}", un triplete sin hsl()` } : resolver(r);
  }
  if (/^(#[0-9a-fA-F]{3,8}|hsl\(|rgb|oklch\(|oklab\(|transparent|white|black)/.test(valor)) return { color: true, motivo: '' };
  return { color: false, motivo: `"${valor}" no es un color` };
}

function main() {
  console.log('\n1) Cada color del tema es un color de verdad\n');
  const colores = [...efectivo].filter(([k]) => k.startsWith('--color-'));
  const malos = colores.filter(([, v]) => !resolver(v).color).map(([k, v]) => `${k} (${resolver(v).motivo})`);
  ok('ningun --color-* del tema resuelve a algo que no es un color', malos.length === 0, malos.slice(0, 4).join('; '));
  for (const k of ['--color-primary', '--color-border', '--color-ring', '--color-destructive', '--color-background']) {
    ok(`  ${k} en concreto`, resolver(efectivo.get(k) ?? '').color, resolver(efectivo.get(k) ?? '').motivo);
  }

  console.log('\n2) La paleta es la de la casa\n');
  ok('el primario es el azul marino de la marca (#003366 = 210 100% 20%)', root.get('--primary') === '210 100% 20%', root.get('--primary'));
  ok('  y el texto sobre el primario, blanco', root.get('--primary-foreground') === '0 0% 100%');
  ok('el hover suave (accent) es gris claro, no el violeta de la plantilla', root.get('--accent') === '210 40% 96.1%', root.get('--accent'));
  ok('el destructivo pasa AA con texto blanco (rose-600)', root.get('--destructive') === '347 77% 50%', root.get('--destructive'));

  console.log('\n3) Los colores que el codigo nombra existen\n');
  //  Los que salian transparentes daban igual; con el primario de vuelta, "bg-primary text-on-primary"
  //  seria texto negro sobre azul marino.
  ok('text-on-primary es blanco', efectivo.get('--color-on-primary') === '#ffffff', efectivo.get('--color-on-primary'));
  ok('bg-primary-variant (el hover de "Agregar" en Departamentos) existe', resolver(efectivo.get('--color-primary-variant') ?? '').color);
  //  Barrido: toda clase de color de los className de src nombra la paleta de Tailwind o un --color-*.
  const definidos = new Set([...efectivo.keys()].filter((k) => k.startsWith('--color-')).map((k) => k.slice(8)));
  const PALETA = /^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}$/;
  //  Tolerados, anotados: solo existen tras `dark:` (el modo oscuro no se activa nunca) o no son color.
  const TOLERADOS = new Set(['surface-dark', 'surface-dark-bright', 'body-sm']);
  const NO_COLOR = /^(repeat(-[xy])?|no-repeat|hidden|xs|sm|md|base|lg|[2-9]?xl|left|right|center|justify|start|end|none|solid|dashed|dotted|double|collapse|transparent|white|black|current|inherit|offset-\d|inset|clip|\d|[trblxy]|[trblxy]-\d|gradient-to-[trbl]{1,2})$/;
  const sueltos = new Set<string>();
  (function andar(d: string) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) andar(p);
      else if (p.endsWith('.tsx')) {
        const s = readFileSync(p, 'utf8');
        for (const cn of s.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
          for (const c of (cn[1] ?? cn[2]).split(/\s+/)) {
            const m = c.replace(/^([a-z-]+:)+/, '').match(/^(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|from|to|via|fill|stroke|divide(?:-[xy])?|outline)-([a-z][a-z0-9-]*)(?:\/\d+)?$/);
            if (!m || NO_COLOR.test(m[1]) || PALETA.test(m[1]) || definidos.has(m[1]) || TOLERADOS.has(m[1])) continue;
            sueltos.add(`${c} (${p.slice(raiz.length + 1).replace(/\\/g, '/')})`);
          }
        }
      }
    }
  })(join(raiz, 'src'));
  ok('ninguna clase de color de src nombra un color que no existe', sueltos.size === 0, [...sueltos].slice(0, 12).join('; '));

  console.log('\n4) Lo que no cambia (invariantes)\n');
  invariante('los radios de la casa siguen (rounded-lg = --radius = 0.625rem)', root.get('--radius') === '0.625rem' && efectivo.get('--radius-lg') === 'var(--radius)');
  invariante('el modo oscuro no se toca (no se activa en ningun sitio)', css.includes('.dark {'));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main();
