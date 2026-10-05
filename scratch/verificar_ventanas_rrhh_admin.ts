/**
 * Lote 280 -- las ventanas escritas a mano de RRHH, administracion y sistema pasan al `Modal` comun
 * (`src/components/ui/dialog.tsx`, lote 276).
 *
 * Las once ventanas del grupo (todas eran un `fixed inset-0` con fondo oscuro y una caja encima):
 *   - departamentos: alta/edicion de departamento y de puesto;
 *   - nomina: generar la nomina de un periodo (solo la ventana: lo que calcula y paga no se toca);
 *   - vacaciones: movimiento de vacaciones;
 *   - empresas: suscripcion SaaS (en la capa 100, como estaba);
 *   - administracion: nuevo usuario, modificar usuario, nuevo rol, plan SaaS;
 *   - configuracion: crear/editar tipo de gasto;
 *   - el inicio: alertas del sistema.
 *
 * Lo que el lote afirma, y este banco comprueba:
 *   1. en los ficheros del grupo no queda ningun `fixed inset-0` de ventana (se barren TODOS los .tsx
 *      de hr/, admin/, settings/, tools/ y support/, mas el inicio). Sin excepciones;
 *   2. cada ventana es un `<Modal>` abierto por LA MISMA variable de antes, con `title`, y su `onClose`
 *      es EXACTAMENTE lo que hacia su X (y su "Cancelar");
 *   3. ninguna de las once cerraba al pulsar el fondo (ningun fondo llevaba `onClick`): las once
 *      llevan `cerrarAlPulsarFuera={false}`, comprobado ventana por ventana;
 *   4. las que tienen estado de guardando (`submitting`, `savingType`) llevan `bloqueada`;
 *   5. no queda `AnimatePresence`/`motion` importado sin uso;
 *   6. EJECUTADO: el tipo de gasto se dibuja como ventana de la casa (role="dialog", titulo enlazado).
 * Y como INVARIANTE (codigo 3): textos, `placeholder`, `title`, avisos y direcciones de la API iguales a
 * la base. Los titulos que pasan a la prop `title`/`description` del Modal cuentan como texto.
 *
 * Detalle que obliga a una forma concreta: vacaciones y empresas se abrian con `x && seleccionado`, y
 * los hijos de un componente se evaluan aunque la ventana este cerrada (`seleccionado.firstName` con
 * `null` revienta). Por eso el `Modal` va dentro de `{seleccionado && (...)}` con `isOpen={showModal}`:
 * la condicion de apertura es la misma de antes.
 *
 * Se ejecuta con: node node_modules/tsx/dist/cli.mjs scratch/verificar_ventanas_rrhh_admin.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { enCommit, huella, diferencia } from './huellaDePantalla';

const raiz = resolve(__dirname, '..');
const BASE = 'ab9e5fd' /* lote 276: commit fijo, la rama se borro al fusionar */;
const DESPUES = '85d5dc1' /* lote 280: el commit de este banco (lo usa la invariante 7, desde el lote 290) */;
let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const intenta = async (t: string, f: () => boolean | Promise<boolean>) => { try { ok(t, await f()); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message.split('\n')[0]}`); } };

const FICHEROS = [
  'src/app/dashboard/hr/departments/page.tsx',
  'src/app/dashboard/hr/payroll/page.tsx',
  'src/app/dashboard/hr/vacations/page.tsx',
  'src/app/dashboard/admin/companies/page.tsx',
  'src/app/dashboard/admin/page.tsx',
  'src/app/dashboard/settings/components/ModalTipoDeGasto.tsx',
  'src/app/dashboard/page.tsx',
] as const;
type Fichero = typeof FICHEROS[number];

/** Cada ventana: su fichero, la variable que la abre, lo que hace su X, y su estado de guardando. */
const VENTANAS: { nombre: string; f: Fichero; abre: string; cierra: string; bloqueada?: string; capa?: number }[] = [
  { nombre: 'departamento', f: 'src/app/dashboard/hr/departments/page.tsx', abre: 'showDeptModal', cierra: 'setShowDeptModal(false)' },
  { nombre: 'puesto', f: 'src/app/dashboard/hr/departments/page.tsx', abre: 'showPosModal', cierra: 'setShowPosModal(false)' },
  { nombre: 'generar nomina', f: 'src/app/dashboard/hr/payroll/page.tsx', abre: 'showCreateModal', cierra: 'setShowCreateModal(false)', bloqueada: 'submitting' },
  { nombre: 'movimiento de vacaciones', f: 'src/app/dashboard/hr/vacations/page.tsx', abre: 'showModal', cierra: 'setShowModal(false)', bloqueada: 'submitting' },
  { nombre: 'suscripcion SaaS', f: 'src/app/dashboard/admin/companies/page.tsx', abre: 'showSubscriptionModal', cierra: 'setShowSubscriptionModal(false)', bloqueada: 'submitting', capa: 100 },
  { nombre: 'nuevo usuario', f: 'src/app/dashboard/admin/page.tsx', abre: 'showNewUserModal', cierra: 'setShowNewUserModal(false)', bloqueada: 'submitting' },
  { nombre: 'modificar usuario', f: 'src/app/dashboard/admin/page.tsx', abre: 'showEditUserModal', cierra: 'setShowEditUserModal(false)', bloqueada: 'submitting' },
  { nombre: 'nuevo rol', f: 'src/app/dashboard/admin/page.tsx', abre: 'showNewRoleModal', cierra: 'setShowNewRoleModal(false)', bloqueada: 'submitting' },
  { nombre: 'plan SaaS', f: 'src/app/dashboard/admin/page.tsx', abre: 'showPlanModal', cierra: 'setShowPlanModal(false)', bloqueada: 'submitting' },
  { nombre: 'tipo de gasto', f: 'src/app/dashboard/settings/components/ModalTipoDeGasto.tsx', abre: 'g.showTypeModal', cierra: 'g.setShowTypeModal(false)', bloqueada: 'g.savingType' },
  { nombre: 'alertas del inicio', f: 'src/app/dashboard/page.tsx', abre: 'showAlertsModal', cierra: 'setShowAlertsModal(false)' },
];

const leer = (f: string) => (existsSync(resolve(raiz, f)) ? readFileSync(resolve(raiz, f), 'utf8').replace(/\r\n/g, '\n') : '');
const sinComentarios = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** La etiqueta de apertura de cada `<Modal`, entera (las llaves equilibradas: `icono={<X />}` lleva un `>`). */
function modales(src: string): string[] {
  const s = sinComentarios(src);
  const out: string[] = [];
  const re = /<Modal\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    let k = m.index + m[0].length, prof = 0;
    for (; k < s.length; k++) { const c = s[k]; if (c === '{') prof++; else if (c === '}') prof--; else if (c === '>' && prof === 0) break; }
    out.push(s.slice(m.index, k + 1));
  }
  return out;
}
/** El valor de una prop `x={...}` en una etiqueta (con llaves equilibradas), o `"..."`. */
function prop(tag: string, nombre: string): string | null {
  const m = new RegExp(`\\s${nombre}=`).exec(tag);
  if (!m) return null;
  let i = m.index + m[0].length;
  if (tag[i] === '"') return tag.slice(i + 1, tag.indexOf('"', i + 1));
  if (tag[i] !== '{') return null;
  let prof = 0, j = i;
  for (; j < tag.length; j++) { if (tag[j] === '{') prof++; else if (tag[j] === '}') { prof--; if (prof === 0) break; } }
  return tag.slice(i + 1, j).trim();
}
const norm = (s: string | null) => (s ?? '').replace(/\s+/g, '');

/** Todos los .tsx de los directorios del grupo, mas el inicio. */
function barrido(): string[] {
  const out: string[] = ['src/app/dashboard/page.tsx'];
  const anda = (d: string) => {
    if (!existsSync(resolve(raiz, d))) return;
    for (const x of readdirSync(resolve(raiz, d))) {
      const p = join(d, x).replace(/\\/g, '/');
      if (statSync(resolve(raiz, p)).isDirectory()) anda(p);
      else if (p.endsWith('.tsx')) out.push(p);
    }
  };
  for (const d of ['src/app/dashboard/hr', 'src/app/dashboard/admin', 'src/app/dashboard/settings', 'src/app/dashboard/tools', 'src/app/dashboard/support']) anda(d);
  return out;
}

/** Lo visible, con los titulos y descripciones que pasan a props del Modal contados como texto. */
function textos(src: string): string[] {
  const h = huella(src).filter((x) => !x.startsWith('clase:') && !x.startsWith('aria-label:'));
  for (const tag of modales(src)) {
    for (const p of ['title', 'description']) {
      const v = new RegExp(`\\s${p}="([^"]*)"`).exec(tag)?.[1];
      if (v === undefined) continue;
      //  `huella` ya lo cogio como `title:...`: pasa a ser el texto que era.
      const i = h.indexOf(`title:${v}`);
      if (i >= 0) h.splice(i, 1);
      h.push(`texto:${v}`);
    }
  }
  //  `huella` no ve el texto que va DETRAS de una expresion (`{stats.alertCount} avisos para...`): un
  //  mutante que cambiaba la descripcion de las alertas sobrevivia. Se toma aqui, igual en los dos lados.
  const s = src.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of s.matchAll(/\}([^<>{}]*[A-Za-zÁÉÍÓÚáéíóúñÑ][^<>{}]*)(?=<\/)/g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (/\s/.test(t) && !/[;=()]/.test(t)) h.push(`tras-expresion:${t}`);
  }
  return h.sort();
}

async function main() {
  for (const f of FICHEROS) if (!existsSync(resolve(raiz, f))) throw new Error(`Precondicion: no esta ${f}`);
  //  Precondicion valida en los dos estados: la ventana comun existe (la trae la base).
  if (!/export function Modal\b/.test(leer('src/components/ui/dialog.tsx'))) throw new Error('Precondicion: no esta el Modal comun');
  const fuentes = new Map(FICHEROS.map((f) => [f, leer(f)] as const));

  console.log('\n1) Ningun `fixed inset-0` de ventana en el grupo\n');
  const sueltas = barrido().filter((f) => /fixed inset-0/.test(sinComentarios(leer(f))));
  ok(`en los ${barrido().length} ficheros del grupo, cero ventanas escritas a mano`, sueltas.length === 0, sueltas.join(', '));
  for (const f of FICHEROS) {
    const s = sinComentarios(fuentes.get(f) ?? '');
    ok(`  ${f.replace(/^src\/app\/dashboard\//, '')}: importa el Modal comun y lo usa`,
      /import \{ Modal \} from '@\/components\/ui\/dialog';/.test(s) && modales(s).length === VENTANAS.filter((v) => v.f === f).length);
  }

  console.log('\n2-4) Cada ventana: la misma variable, el mismo cierre, title, sin cerrar al pulsar fuera, bloqueada\n');
  for (const v of VENTANAS) {
    const tag = modales(fuentes.get(v.f) ?? '').find((t) => norm(prop(t, 'isOpen')) === norm(v.abre));
    ok(`${v.nombre}: <Modal isOpen={${v.abre}}> con onClose={() => ${v.cierra}}`, !!tag && norm(prop(tag, 'onClose')) === norm(`() => ${v.cierra}`));
    ok(`  con title`, !!tag && !!prop(tag, 'title'));
    ok(`  cerrarAlPulsarFuera={false} (su fondo no cerraba)`, !!tag && norm(prop(tag, 'cerrarAlPulsarFuera')) === 'false');
    if (v.bloqueada) ok(`  bloqueada={${v.bloqueada}} (no se cierra mientras guarda)`, !!tag && norm(prop(tag, 'bloqueada')) === norm(v.bloqueada));
    if (v.capa) ok(`  en la capa ${v.capa}, como estaba (z-[${v.capa}])`, !!tag && norm(prop(tag, 'capa')) === String(v.capa));
  }
  //  Las dos que dependen de un seleccionado: el Modal dentro de `{x && (`, para no evaluar `null.campo`.
  for (const [f, sel, abre] of [['src/app/dashboard/hr/vacations/page.tsx', 'seleccionado', 'showModal'], ['src/app/dashboard/admin/companies/page.tsx', 'selectedCompany', 'showSubscriptionModal']] as const) {
    const s = sinComentarios(fuentes.get(f) ?? '');
    ok(`  ${f.replace(/^src\/app\/dashboard\//, '')}: el Modal va dentro de {${sel} && (...)}`, new RegExp(`\\{${sel} && \\(\\s*<Modal\\s+isOpen=\\{${abre}\\}`).test(s));
  }

  console.log('\n5) Sin animaciones a mano sobrantes\n');
  const sobrantes = FICHEROS.filter((f) => {
    const s = sinComentarios(fuentes.get(f) ?? '');
    const imp = /import \{([^}]*)\} from 'framer-motion'/.exec(s)?.[1] ?? '';
    return imp.split(',').map((x) => x.trim()).filter(Boolean).some((n) => !new RegExp(`<${esc(n)}\\b|<${esc(n)}\\.`).test(s.replace(/import [^\n]*\n/g, '')));
  });
  //  Cierto tambien en la base (alli se usaban): invariante, no `ok()` (regalaria un OK en la contraprueba).
  invariante('ningun AnimatePresence/motion importado sin uso', sobrantes.length === 0, sobrantes.join(', '));
  ok('  administracion ya no importa framer-motion (sus cuatro ventanas eran lo unico animado)', !/from 'framer-motion'/.test(fuentes.get('src/app/dashboard/admin/page.tsx') ?? '') && modales(fuentes.get('src/app/dashboard/admin/page.tsx') ?? '').length === 4);

  console.log('\n6) Ejecutado: el tipo de gasto se dibuja como la ventana de la casa\n');
  await intenta('role="dialog", aria-modal, el titulo enlazado y la X con aria-label', async () => {
    const [React, { renderToStaticMarkup }, M] = await Promise.all([
      import('react'), import('react-dom/server'),
      import('../src/app/dashboard/settings/components/ModalTipoDeGasto').catch(() => null),
    ]);
    if (!M) return false;
    const g = { showTypeModal: true, setShowTypeModal: () => {}, editingType: null, typeCode: '', setTypeCode: () => {}, typeName: '', setTypeName: () => {},
      typeStatus: 'active', setTypeStatus: () => {}, handleSaveType: () => {}, savingType: false } as unknown as Parameters<typeof M.ModalTipoDeGasto>[0]['g'];
    const x = renderToStaticMarkup(React.createElement(M.ModalTipoDeGasto, { g }));
    const lab = /aria-labelledby="([^"]+)"/.exec(x)?.[1];
    return /role="dialog"/.test(x) && /aria-modal="true"/.test(x) && !!lab && new RegExp(`id="${esc(lab)}"[^>]*>[\\s\\S]*?Crear Tipo de Gasto`).test(x)
      && /aria-label="Cerrar"/.test(x) && /placeholder="Ej\. 11"/.test(x);
  });

  console.log('\n7) Lo que no cambia: textos, placeholder, title, avisos y API (invariante)\n');
  const cambiados: string[] = [];
  for (const f of FICHEROS) {
    let antes: string;
    try { antes = enCommit(BASE, f); } catch { cambiados.push(`${f}: no esta en ${BASE}`); continue; }
    //  Lote 290: comparaba contra la CARPETA, y el 290 toca a proposito la pantalla
    //  de nomina (un `useState<string | null>` que la huella lee como texto). Como
    //  en los lotes 227, 230 y 237, la equivalencia de ESTE lote se mide entre sus
    //  dos commits (antes `ab9e5fd`, despues `85d5dc1`, el del lote 280): asi vale
    //  para siempre y no se rompe con el siguiente cambio de esas pantallas.
    let despues: string;
    try { despues = enCommit(DESPUES, f); } catch { cambiados.push(`${f}: no esta en ${DESPUES}`); continue; }
    const { faltan, sobran } = diferencia(textos(antes), textos(despues));
    if (faltan.length || sobran.length) cambiados.push(`${f.replace(/^src\//, '')}: faltan ${JSON.stringify(faltan)} sobran ${JSON.stringify(sobran)}`);
  }
  invariante(`los ${FICHEROS.length} ficheros dicen lo mismo en ${DESPUES} que en ${BASE}`, cambiados.length === 0, cambiados.join(' | '));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
