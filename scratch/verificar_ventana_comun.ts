/**
 * Lote 276 -- la ventana comun (`Modal`, `dialog.tsx`), lista para que las 28 pantallas con ventanas
 * escritas a mano pasen a ella (lotes 277-280).
 *
 * Lo que tenia que ganar, y ninguna ventana escrita a mano tenia entero: anunciarse como ventana,
 * llevar el foco dentro y devolverlo, no dejar que Tab se escape, que Escape cierre SOLO la de arriba,
 * no cerrarse mientras se guarda, poder no cerrarse al pulsar fuera, y un bloqueo del desplazamiento
 * que cuente ventanas. Lo que no depende del navegador vive en `ventanasAbiertas.ts` y se EJECUTA; la
 * ventana se DIBUJA con react-dom/server.
 *
 * Se ejecuta con: npx tsx scratch/verificar_ventana_comun.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const raiz = resolve(__dirname, '..');
let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const intenta = (t: string, f: () => boolean) => { try { ok(t, f()); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); } };
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const h = React.createElement;

async function main() {
  const fuente = readFileSync(resolve(raiz, 'src/components/ui/dialog.tsx'), 'utf8');
  if (!/export function Modal\(/.test(fuente)) throw new Error('Precondicion: no esta el Modal compartido');
  const RUTA_PILA = 'src/components/ui/ventanasAbiertas.ts';
  const V: AnyRec | null = existsSync(resolve(raiz, RUTA_PILA)) ? await import('../src/components/ui/ventanasAbiertas') : null;
  const D: AnyRec = await import('../src/components/ui/dialog');

  console.log('\n1) La pila de ventanas y el foco (ejecutados)\n');
  const E1 = ['con dos ventanas abiertas, solo la de arriba atiende Escape', '  y al cerrar la de arriba, la de abajo vuelve a ser la de arriba',
    'el desplazamiento se bloquea con la primera y se devuelve con la ULTIMA (no al cerrar una de dos)', 'Tab da la vuelta en los extremos y Mayus+Tab al reves',
    '  y con el foco fuera de la ventana, Tab entra por el primero (o Mayus+Tab por el ultimo)'];
  if (!V) for (const t of E1) ok(t, false, `no existe ${RUTA_PILA}`);
  else {
    const v = V;
    v.vaciarVentanas();
    intenta(E1[0], () => { v.abrirVentana('a'); v.abrirVentana('b'); return v.esLaDeArriba('b') && !v.esLaDeArriba('a'); });
    intenta(E1[1], () => { v.cerrarVentana('b'); return v.esLaDeArriba('a'); });
    intenta(E1[2], () => { v.vaciarVentanas(); const p1 = v.abrirVentana('x'); const p2 = v.abrirVentana('y'); const u1 = v.cerrarVentana('y'); const u2 = v.cerrarVentana('x'); return p1 && !p2 && !u1 && u2; });
    intenta(E1[3], () => v.siguienteFoco(3, 2, false) === 0 && v.siguienteFoco(3, 0, true) === 2 && v.siguienteFoco(3, 1, false) === 2 && v.siguienteFoco(3, 1, true) === 0);
    intenta(E1[4], () => v.siguienteFoco(3, -1, false) === 0 && v.siguienteFoco(3, -1, true) === 2 && v.siguienteFoco(0, -1, false) === -1);
  }

  console.log('\n2) La ventana, dibujada\n');
  const dibuja = (props: AnyRec, hijos: React.ReactNode = h('input', { 'aria-label': 'Nombre' })) =>
    renderToStaticMarkup(h(D.Modal, { isOpen: true, onClose: () => {}, ...props }, hijos));
  const x = dibuja({ title: 'Nuevo cliente', description: 'Datos de facturacion', icono: h('svg') });
  intenta('se anuncia como ventana: role="dialog" y aria-modal', () => /role="dialog"/.test(x) && /aria-modal="true"/.test(x));
  intenta('  con su titulo y su descripcion ENLAZADOS (aria-labelledby / aria-describedby apuntan a ellos)', () => {
    const lb = /aria-labelledby="([^"]+)"/.exec(x)?.[1], db = /aria-describedby="([^"]+)"/.exec(x)?.[1];
    return !!lb && !!db && new RegExp(`<h2 id="${lb.replace(/[:]/g, '\\:')}"`).test(x) && x.includes(`id="${db}"`);
  });
  intenta('la X dice que cierra (aria-label) y el fondo no se anuncia', () => /<button type="button"[^>]*aria-label="Cerrar"/.test(x) && /aria-hidden="true" class="fixed inset-0 bg-black\/60/.test(x));
  intenta('bloqueada (guardando): la X se desactiva', () => /<button type="button" disabled=""[^>]*aria-label="Cerrar"/.test(dibuja({ title: 'T', bloqueada: true })));
  intenta('sin relleno y en una capa mas alta, cuando se pide (ventana encima de otra)',
    () => { const s = dibuja({ title: 'T', sinRelleno: true, capa: 60 }); return /class="fixed inset-0 flex[^"]*z-\[60\]/.test(s) && /data-cuerpo-ventana="[^"]*" class="overflow-y-auto flex-1"/.test(s); });
  intenta('el icono va en la cabecera, decorativo', () => /<h2[^>]*><span aria-hidden="true" class="shrink-0 text-\[#C5A059\]/.test(x));

  console.log('\n3) Cerrar: quien puede, y quien no (lo que el navegador ejecuta)\n');
  ok('cerrar pasa siempre por una guarda que mira `bloqueada` (Escape, el fondo y la X)',
    /const cerrar = React\.useCallback\(\(\) => \{\s*if \(!actual\.current\.bloqueada\) actual\.current\.onClose\(\);/.test(fuente)
    && (fuente.match(/onClick=\{cerrar\}/g) ?? []).length === 2);
  ok('pulsar fuera solo cierra si `cerrarAlPulsarFuera`', /onClick=\{cerrarAlPulsarFuera \? cerrar : undefined\}/.test(fuente));
  ok('Escape y Tab solo los atiende la ventana de arriba', /if \(!esLaDeArriba\(id\)\) return;\s*if \(e\.key === "Escape"\)/.test(fuente));
  ok('al cerrar, el foco vuelve a donde estaba', /if \(previo && document\.contains\(previo\)\) previo\.focus\(\);/.test(fuente));
  ok('el desplazamiento se devuelve solo con la ultima ventana', /if \(cerrarVentana\(id\)\) document\.body\.style\.overflow = "";/.test(fuente) && !/window\.addEventListener\("keydown"/.test(fuente));

  console.log('\n4) Lo que no cambia (invariantes)\n');
  invariante('la API de siempre sigue (isOpen, onClose, title, description, footer, maxWidth, className): la usan 4 pantallas',
    ['isOpen', 'onClose', 'title', 'description', 'footer', 'maxWidth', 'className'].every((p) => new RegExp(`\\b${p}\\??:`).test(fuente)));
  invariante('el fondo oscurece como siempre (bg-black/60), y lo que el pie pinta', /bg-black\/60/.test(fuente) && /justify-end gap-3 p-4 px-6 bg-white border-t border-slate-200/.test(fuente));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
