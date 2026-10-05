/**
 * Lote 284 -- los botones sin nombre, contados de verdad (2026-10-04).
 *
 * El trinquete del lote 270 decia 19 botones de solo icono sin nombre, y el lote 274 los atribuyo
 * "casi todos" a la tienda publica. Mirados uno a uno: NINGUNO era de la tienda, y 18 de 19 eran
 * falsos -- el recuento no veia el texto que llega por variable (`{tab.label}`) ni el que va dentro
 * de un fragmento. Y no veia los de verdad: un texto que existe pero va ESCONDIDO EN EL MOVIL
 * (`hidden sm:inline`), que en un telefono deja un icono suelto que un lector de pantalla anuncia
 * como "boton", sin decir cual. Eran tres:
 *  - las cuatro pestañas de la Central e-CF (un solo `<button>` en un `map`);
 *  - "Anterior" y "Siguiente" de la paginacion COMPARTIDA, que usan diecisiete pantallas.
 *
 * El recuento nuevo vive en `scratch/botonesSinNombre.ts`; aqui se EJECUTA contra casos escritos a
 * proposito (para que la heuristica no se afloje sin que se note), se DIBUJA la paginacion, y el
 * trinquete queda en CERO.
 *
 * Se ejecuta con: npx tsx scratch/verificar_iconos_con_nombre.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { botonesSinNombre, textoVisible } from './botonesSinNombre';

const raiz = resolve(__dirname, '..');
let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  console.log('\n1) El recuento distingue lo que se lee de lo que no (invariantes de la herramienta)\n');
  //  Ciertas antes y despues del arreglo: son de la herramienta, no de las pantallas. Si alguien la
  //  afloja (o la aprieta de mas), el banco se niega en vez de dar un cero de balde.
  const casos: [string, string, boolean][] = [
    ['solo un icono', '<Pencil className="h-4 w-4" />', false],
    ['texto suelto', '<Plus /> Registrar', true],
    ['texto por variable', '{tab.label}', true],
    ['un icono por variable no es texto', '{tab.icon}', false],
    ['texto dentro de un ternario de fragmentos', "{cargando ? (<><Loader2 /> Enviando…</>) : (<><Send /> Enviar</>)}", true],
    ['escondido en el movil y nada mas', '<ChevronLeft /><span className="hidden sm:inline">Anterior</span>', false],
    ['escondido en el escritorio y nada mas', '<X /><span className="sm:hidden">Cerrar</span>', false],
    ['alternado: uno en el movil y otro en el escritorio', '<span className="hidden sm:inline">Ver todo</span><span className="sm:hidden">Todo</span>', true],
    ['sr-only es un nombre', '<Trash2 /><span className="sr-only">Eliminar</span>', true],
    ['un comentario no es texto', '{/* nada */}<Pencil />', false],
  ];
  for (const [t, cuerpo, esperado] of casos) invariante(`${t}: ${esperado ? 'tiene nombre' : 'sin nombre'}`, !!textoVisible(cuerpo) === esperado, `leyo «${textoVisible(cuerpo)}»`);

  console.log('\n2) La paginacion compartida (diecisiete pantallas)\n');
  const P: AnyRec = await import('../src/components/ui/pagination');
  const html = renderToStaticMarkup(React.createElement(P.Pagination, { currentPage: 2, totalPages: 5, totalItems: 70, pageSize: 15, onPageChange: () => {} }));
  const botones = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]);
  const conTexto = (t: string) => botones.find((b) => b.includes(`>${t}<`));
  const anterior = conTexto('Anterior'), siguiente = conTexto('Siguiente');
  ok('"Anterior": la flecha dice que es la pagina anterior aunque el texto se esconda en el movil',
    !!anterior && /aria-label="Página anterior"/.test(anterior), anterior ? '' : 'no encuentro el boton');
  ok('"Siguiente": igual', !!siguiente && /aria-label="Página siguiente"/.test(siguiente), siguiente ? '' : 'no encuentro el boton');
  invariante('el texto sigue a la vista en pantalla grande (no se cambio por el aria-label)',
    !!anterior && !!siguiente && /hidden sm:inline">Anterior/.test(anterior) && /hidden sm:inline">Siguiente/.test(siguiente));

  console.log('\n3) Las pestañas de la Central e-CF\n');
  const ecf = readFileSync(resolve(raiz, 'src/app/dashboard/ecf/page.tsx'), 'utf8');
  const i = ecf.indexOf('{TABS.map((tab) => (');
  if (i < 0) throw new Error('Precondicion: no encuentro las pestañas de e-CF (TABS.map)');
  const tag = ecf.slice(ecf.indexOf('<button', i), ecf.indexOf('</button>', i));
  ok('cada pestaña lleva su nombre en aria-label (el rotulo es `hidden sm:inline`)', /aria-label=\{tab\.label\}/.test(tag));
  ok('  y dice cual esta elegida', /aria-pressed=\{activeTab === tab\.id\}/.test(tag));
  invariante('el rotulo visible sigue ahi en pantalla grande', /<span className="hidden sm:inline[^"]*">\{tab\.label\}<\/span>/.test(tag));

  console.log('\n4) Trinquete: ningun boton de src sin nombre, en ninguna anchura\n');
  const hoy = botonesSinNombre(raiz);
  ok(`botones sin nombre: ${hoy.length} (techo 0)`, hoy.length === 0, hoy.map((b) => `${b.fichero}:${b.linea}`).join(', '));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
