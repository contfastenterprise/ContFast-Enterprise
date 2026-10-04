/**
 * Lote 274 -- RRHH, administracion y sistema al estandar de UI (auditoria de UI del 2026-10-03,
 * `docs/estandar_ui.md`).
 *
 * El grupo: recursos humanos, administracion, configuracion, herramientas, soporte, el inicio y su
 * marco (ClientLayout), las pantallas sueltas (403, 404, error global, acceso, asistente de
 * configuracion), inteligencia de negocio y el agente, y los componentes compartidos del panel que
 * no son del estandar (menu lateral, campana, buscadores, confirmacion, boton de la DGII...).
 *
 * Lo que el lote afirma, y este banco comprueba:
 *   1. ningun boton de accion pintado a mano con los colores de la casa (salvo las excepciones
 *      anotadas aqui, por nombre y con su porque);
 *   2. todo boton de solo icono dice que hace (`aria-label`);
 *   3. ningun pie con la accion principal antes que Cancelar;
 *   4. las cabeceras convertidas usan `CabeceraDePagina`, y ningun `<h1>` es dorado (2,4:1);
 *   5. todo boton lleva `type` explicito (dentro de un <form>, sin el, envia);
 *   6. los iconos del estandar (Pencil, no Edit/Edit2) y ningun `text-body-sm` (no existe);
 *   7. los componentes compartidos del grupo usan `Button` por dentro, sin cambiar su API.
 * Y como INVARIANTE (codigo 3): los textos visibles, `placeholder`, `title`, avisos y direcciones
 * de la API de cada fichero son los mismos que en la rama base. Las CLASES cambian a proposito y
 * no se comparan; los `aria-label` nuevos son añadidos y se excluyen.
 *
 * Se ejecuta con: npx tsx scratch/verificar_ui_rrhh_admin.ts
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { enCommit, huella, diferencia } from './huellaDePantalla';

const raiz = resolve(__dirname, '..');
const BASE = '57f741d' /* lote 270: commit fijo, la rama se borro al fusionar */;
let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const intenta = async (t: string, f: () => boolean | Promise<boolean>, d = '') => { try { ok(t, await f(), d); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message.split('\n')[0]}`); } };

const FICHEROS = [
  'src/app/dashboard/admin/companies/page.tsx',
  'src/app/dashboard/admin/page.tsx',
  'src/app/dashboard/hr/config/page.tsx',
  'src/app/dashboard/hr/departments/page.tsx',
  'src/app/dashboard/hr/employees/page.tsx',
  'src/app/dashboard/hr/overtime/page.tsx',
  'src/app/dashboard/hr/page.tsx',
  'src/app/dashboard/hr/payroll/page.tsx',
  'src/app/dashboard/hr/settlements/page.tsx',
  'src/app/dashboard/hr/vacations/page.tsx',
  'src/app/dashboard/settings/components/AvisosDelSistema.tsx',
  'src/app/dashboard/settings/components/CamposDeLaPortada.tsx',
  'src/app/dashboard/settings/components/CodigosDeBarra.tsx',
  'src/app/dashboard/settings/components/ContenidoDeLaPestana.tsx',
  'src/app/dashboard/settings/components/CuentasPuente.tsx',
  'src/app/dashboard/settings/components/FormularioEmpresa.tsx',
  'src/app/dashboard/settings/components/IdentidadFiscal.tsx',
  'src/app/dashboard/settings/components/ImagenDeLaPortada.tsx',
  'src/app/dashboard/settings/components/IntegracionMseller.tsx',
  'src/app/dashboard/settings/components/MiPerfil.tsx',
  'src/app/dashboard/settings/components/ModalTipoDeGasto.tsx',
  'src/app/dashboard/settings/components/ParametrosOperativos.tsx',
  'src/app/dashboard/settings/components/PestanasDeAjustes.tsx',
  'src/app/dashboard/settings/components/PlanYSuscripcion.tsx',
  'src/app/dashboard/settings/components/PortadaDeLaTienda.tsx',
  'src/app/dashboard/settings/components/TiposDeGastos.tsx',
  'src/app/dashboard/settings/page.tsx',
  'src/app/dashboard/support/page.tsx',
  'src/app/dashboard/tools/desglose/puertas/page.tsx',
  'src/app/dashboard/tools/desglose/puertas/TablaPuertaComercial.tsx',
  'src/app/dashboard/tools/desglose/ventanas/page.tsx',
  'src/app/dashboard/tools/desglose/ventanas/TablaDesglose.tsx',
  'src/app/dashboard/tools/glass-cutting/page.tsx',
  'src/app/dashboard/tools/qr-store/components/QRControls.tsx',
  'src/app/dashboard/tools/qr-store/components/QRPreview.tsx',
  'src/app/dashboard/tools/qr-store/components/QRPrintStand.tsx',
  'src/app/dashboard/tools/qr-store/page.tsx',
  'src/app/dashboard/tools/qr-store/QRStoreClient.tsx',
  'src/app/auth/forgot-password/page.tsx',
  'src/app/auth/login/page.tsx',
  'src/app/auth/register/page.tsx',
  'src/app/auth/reset-password/page.tsx',
  'src/components/bi/bi-alerts.tsx',
  'src/components/bi/bi-customers.tsx',
  'src/components/bi/bi-general.tsx',
  'src/components/bi/bi-inventory.tsx',
  'src/components/bi/bi-invoices.tsx',
  'src/components/bi/bi-products.tsx',
  'src/components/bi/bi-purchases.tsx',
  'src/components/bi/vista-inteligencia-negocio.tsx',
  'src/components/agente/vista-agente-empresarial.tsx',
  'src/app/dashboard/page.tsx',
  'src/app/dashboard/ClientLayout.tsx',
  'src/app/403/page.tsx',
  'src/app/setup/page.tsx',
  'src/app/not-found.tsx',
  'src/app/global-error.tsx',
  'src/components/PwaInstallPrompt.tsx',
  'src/components/ui/AvatarUploader.tsx',
  'src/components/ui/campana-avisos.tsx',
  'src/components/ui/menu-del-usuario.tsx',
  'src/components/ui/new-app-sidebar.tsx',
  'src/components/ui/selector-de-empresa.tsx',
  'src/components/ui/boton-buscar-dgii.tsx',
  'src/components/ui/confirm-dialog.tsx',
  'src/components/ui/date-range-picker.tsx',
  'src/components/ui/search-bar.tsx',
  'src/components/ui/estado-carga.tsx',
  'src/components/ui/autocomplete-select.tsx',
  'src/components/ui/editable-price-select.tsx',
  'src/components/ui/product-autocomplete.tsx',
] as const;

/** Las cabeceras de pagina que el lote pasa a `CabeceraDePagina`, con su titulo. */
const CABECERAS: Record<string, string> = {
  'src/app/dashboard/admin/companies/page.tsx': 'Gestión de Empresas (Multi-Tenant)',
  'src/app/dashboard/admin/page.tsx': 'Gestión de Acceso y Planes',
  'src/app/dashboard/hr/config/page.tsx': 'Configuraciones de Ley TSS e ISR',
  'src/app/dashboard/hr/departments/page.tsx': 'Departamentos y Puestos',
  'src/app/dashboard/hr/employees/page.tsx': 'Colaboradores / Empleados',
  'src/app/dashboard/hr/overtime/page.tsx': 'Ingresos, Deducciones y Horas Extras',
  'src/app/dashboard/hr/page.tsx': 'Dashboard de Recursos Humanos',
  'src/app/dashboard/hr/payroll/page.tsx': 'Procesamiento de Nóminas',
  'src/app/dashboard/hr/settlements/page.tsx': 'Prestaciones y Salario de Navidad',
  'src/app/dashboard/hr/vacations/page.tsx': 'Vacaciones',
  'src/app/dashboard/settings/page.tsx': 'Ajustes del Sistema',
  'src/app/dashboard/support/page.tsx': 'Soporte y Centro de Ayuda',
  'src/app/dashboard/tools/desglose/puertas/page.tsx': 'Desglose de Puertas Comerciales',
  'src/app/dashboard/tools/desglose/ventanas/page.tsx': 'Optimizador & Desglose de Ventanas',
  'src/app/dashboard/tools/glass-cutting/page.tsx': 'Optimizador de Corte de Vidrio',
  'src/app/dashboard/tools/qr-store/QRStoreClient.tsx': 'QR Tienda Online',
  'src/components/bi/vista-inteligencia-negocio.tsx': 'Inteligencia de Negocios',
  'src/components/agente/vista-agente-empresarial.tsx': 'Agente Empresarial (IA)',
  'src/app/dashboard/page.tsx': 'Dashboard Principal',
};

/**
 * EXCEPCIONES a "ningun boton pintado a mano", por fichero y por el texto que distingue al boton.
 *  - Acceso (login, recuperar y nueva contraseña): el dorado de la marca sobre el fondo oscuro de la
 *    pantalla de entrada es deliberado (lote 173) y lo vigila `verificar_pantalla_acceso.ts`.
 *  - El panel de diagnostico RBAC del menu: herramienta de depuracion, solo para sistemas.
 *  - El indicador "N de M" de la paginacion propia del inicio: la excepcion del lote 133 (lleva el
 *    "(Historial total: N)"), y no es una accion.
 */
const EXCEPCIONES: { fichero: string; marca: RegExp }[] = [
  { fichero: 'src/app/auth/login/page.tsx', marca: /Acceder al Sistema/ },
  { fichero: 'src/app/auth/forgot-password/page.tsx', marca: /type="submit"/ },
  { fichero: 'src/app/auth/reset-password/page.tsx', marca: /type="submit"/ },
  { fichero: 'src/components/ui/new-app-sidebar.tsx', marca: /Diagnóstico RBAC/ },
  { fichero: 'src/app/dashboard/page.tsx', marca: /\{currentPage\} de \{totalPages\}/ },
];

const sinComentarios = (s: string) =>
  s.replace(/\r\n/g, '\n').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const leer = (f: string) => (existsSync(resolve(raiz, f)) ? readFileSync(resolve(raiz, f), 'utf8').replace(/\r\n/g, '\n') : '');

/** Cada boton del fichero: la etiqueta de apertura entera y su contenido. */
type Boton = { tag: string; nombre: string; abre: string; cuerpo: string; pos: number };
function botones(src: string): Boton[] {
  const s = sinComentarios(src);
  const out: Boton[] = [];
  const re = /<(button|Button|IconButton)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    let k = m.index + m[0].length, prof = 0;
    for (; k < s.length; k++) { const c = s[k]; if (c === '{') prof++; else if (c === '}') prof--; else if (c === '>' && prof === 0) break; }
    const abre = s.slice(m.index, k + 1);
    const cierre = abre.endsWith('/>') ? k + 1 : s.indexOf(`</${m[1]}>`, k);
    out.push({ tag: m[1], nombre: m[1], abre, cuerpo: abre.endsWith('/>') ? '' : s.slice(k + 1, cierre < 0 ? k + 1 : cierre), pos: m.index });
  }
  return out;
}

/** ¿El boton dice algo con texto? Una expresion sin elementos (`{item.name}`) cuenta como texto. */
function tieneTexto(cuerpo: string): boolean {
  let resto = '';
  let i = 0;
  while (i < cuerpo.length) {
    if (cuerpo[i] === '{') {
      let j = i, prof = 0;
      for (; j < cuerpo.length; j++) { if (cuerpo[j] === '{') prof++; else if (cuerpo[j] === '}') { prof--; if (prof === 0) break; } }
      const expr = cuerpo.slice(i + 1, j);
      if (!/</.test(expr) && /[A-Za-z]/.test(expr)) return true;
      //  Texto JSX dentro de la expresion: lo que va entre el cierre de una etiqueta y la siguiente.
      if (/>[^<>{}]*[A-Za-zÁÉÍÓÚáéíóúñ][^<>{}]*</.test(expr.replace(/=>/g, ''))) return true;
      if (/'[^']*[A-Za-zÁÉÍÓÚáéíóúñ][^']*'|"[^"]*[A-Za-z][^"]*"/.test(expr.replace(/className=(\{[^}]*\}|"[^"]*")/g, ''))) return true;
      i = j + 1;
      continue;
    }
    resto += cuerpo[i++];
  }
  return /[A-Za-zÁÉÍÓÚáéíóúñ0-9+\-]/.test(resto.replace(/<[^>]*>/g, ''));
}

/** Un boton de accion pintado a mano: clase escrita a pelo con un relleno de la casa (o la firma del secundario). */
const PINTADO = /className="[^"]*(bg-\[#003366\]|bg-\[#001e40\]|bg-\[#c5a059\]|bg-primary(?![-/\w])|bg-indigo-600|bg-emerald-600|bg-amber-600|bg-slate-800|bg-white text-slate-700 border border-slate-300|bg-white border border-slate-200 text-slate-700)/i;

function textosDe(src: string, despues: boolean): string[] {
  const limpio = src.replace(/\r\n/g, '\n');
  const h = huella(limpio).filter((x) => !x.startsWith('clase:') && !x.startsWith('aria-label:'));
  //  Lo que dice cada boton desde una expresion (`{guardando ? 'Guardando...' : 'Guardar'}`): `huella`
  //  solo ve el texto entre etiquetas, y este lote reescribe justo los botones (un mutante que cambiaba
  //  'Guardar Empleado' sobrevivia).
  for (const b of botones(limpio)) {
    for (const m of b.cuerpo.replace(/className=(\{`[^`]*`\}|\{[^}]*\}|"[^"]*")/g, '').matchAll(/'([^'\n]*[A-Za-zÁÉÍÓÚáéíóúñ][^'\n]*)'/g)) h.push(`dice:${m[1]}`);
  }
  if (!despues) return h.sort();
  //  Lo que la cabecera y el boton de icono pintan a partir de sus props.
  const s = limpio.replace(/\/\*[\s\S]*?\*\//g, ' ');
  //  Con el mismo criterio que `huella`: una sola palabra sin espacios se toma por codigo, no por texto.
  const esTexto = (t: string) => (t && !/^[\w.]+$/.test(t.replace(/\s/g, ''))) || /\s/.test(t);
  for (const m of s.matchAll(/<CabeceraDePagina\b[\s\S]*?\btitulo="([^"]*)"/g)) if (esTexto(m[1])) h.push(`texto:${m[1]}`);
  for (const m of s.matchAll(/<CabeceraDePagina\b[\s\S]*?\bdescripcion="([^"]*)"/g)) if (esTexto(m[1])) h.push(`texto:${m[1]}`);
  for (const m of s.matchAll(/<AccionesDeFormulario\b[\s\S]*?\btextoPrincipal="([^"]*)"/g)) if (esTexto(m[1])) h.push(`texto:${m[1]}`);
  //  Lote 280: el titulo y la descripcion de una ventana pasan a props del Modal comun. `huella` los
  //  toma por `title:`; vuelven a ser el texto que eran. La etiqueta se recorta con llaves
  //  equilibradas (`icono={<X />}` lleva un `>`).
  for (const mm of s.matchAll(/<Modal\b/g)) {
    let k = mm.index! + 6, prof = 0;
    for (; k < s.length; k++) { const c = s[k]; if (c === '{') prof++; else if (c === '}') prof--; else if (c === '>' && prof === 0) break; }
    const tag = s.slice(mm.index!, k);
    for (const p of ['title', 'description']) {
      const v = new RegExp(`\\s${p}="([^"]*)"`).exec(tag)?.[1];
      if (v === undefined) continue;
      const i = h.indexOf(`title:${v}`);
      if (i >= 0) h.splice(i, 1);
      if (esTexto(v)) h.push(`texto:${v}`);
    }
  }
  for (const b of botones(limpio)) {
    if (b.tag !== 'IconButton' || /\btitle=/.test(b.abre)) continue;
    const al = /aria-label="([^"]*)"/.exec(b.abre);
    if (al) h.push(`title:${al[1]}`);
  }
  return h.sort();
}

async function main() {
  for (const f of FICHEROS) if (!existsSync(resolve(raiz, f))) throw new Error(`Precondicion: no esta ${f}`);
  const fuentes = new Map(FICHEROS.map((f) => [f, leer(f)] as const));

  console.log('\n1) Ningun boton de accion pintado a mano\n');
  const aMano: string[] = [];
  for (const [f, src] of fuentes) {
    for (const b of botones(src)) {
      if (b.tag !== 'button' || !PINTADO.test(b.abre)) continue;
      if (EXCEPCIONES.some((e) => e.fichero === f && (e.marca.test(b.abre) || e.marca.test(b.cuerpo)))) continue;
      aMano.push(`${f.replace(/^src\//, '')}@${src.slice(0, b.pos).split('\n').length}`);
    }
  }
  ok('en los 71 ficheros del grupo, cero botones con las clases de la casa a mano (salvo las excepciones anotadas)', aMano.length === 0, aMano.slice(0, 6).join(', '));
  ok('  y las excepciones siguen existiendo (si una desaparece, se quita de la lista)',
    aMano.length === 0 && EXCEPCIONES.every((e) => botones(fuentes.get(e.fichero as typeof FICHEROS[number]) ?? '').some((b) => e.marca.test(b.abre) || e.marca.test(b.cuerpo))));

  console.log('\n2) Todo boton de solo icono dice que hace\n');
  const mudos: string[] = [];
  for (const [f, src] of fuentes) {
    for (const b of botones(src)) {
      if (/\baria-label=|aria-labelledby=/.test(b.abre) || tieneTexto(b.cuerpo)) continue;
      mudos.push(`${f.replace(/^src\//, '')}@${src.slice(0, b.pos).split('\n').length}`);
    }
  }
  ok('ningun boton de solo icono sin aria-label', mudos.length === 0, `${mudos.length}: ${mudos.slice(0, 6).join(', ')}`);

  console.log('\n3) Los pies: [Cancelar] [Principal]\n');
  const alReves: string[] = [];
  for (const [f, src] of fuentes) {
    const s = sinComentarios(src);
    const bs = botones(src);
    for (let i = 1; i < bs.length; i++) {
      const b = bs[i], a = bs[i - 1];
      if (!/^\s*(<[^>]*>\s*)*(Cancelar|Quizás luego|Descartar)\s*(<|$)/.test(b.cuerpo.trim()) && !/^(Cancelar|Quizás luego|Descartar)$/.test(b.cuerpo.replace(/<[^>]*>/g, '').trim())) continue;
      const finA = s.indexOf(a.tag === 'button' ? '</button>' : `</${a.tag}>`, a.pos);
      const entre = s.slice(finA + a.tag.length + 3, b.pos);
      if (/^\s*$/.test(entre)) alReves.push(`${f.replace(/^src\//, '')}@${src.slice(0, b.pos).split('\n').length}`);
    }
  }
  ok('ningun pie del grupo con la principal antes que Cancelar', alReves.length === 0, alReves.join(', '));
  //  Los pies limpios (Cancelar + una principal, sin texto de "Guardando..." propio) pasan al componente.
  const PIES_LIMPIOS: Record<string, number> = {
    'src/app/dashboard/hr/departments/page.tsx': 2,
    'src/app/dashboard/settings/components/ModalTipoDeGasto.tsx': 1,
  };
  const sinPie = Object.entries(PIES_LIMPIOS).filter(([f, n]) => {
    const s = sinComentarios(fuentes.get(f as typeof FICHEROS[number]) ?? '');
    return !(/import \{ AccionesDeFormulario \} from '@\/components\/ui\/acciones-de-formulario'/.test(s)
      && (s.match(/<AccionesDeFormulario\b(?:[^>{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\balCancelar=\{/g) ?? []).length === n
      && !/>\s*Cancelar\s*<\/(button|Button)>/.test(s));
  }).map(([f]) => f.replace(/^src\//, ''));
  ok('  y los pies limpios usan AccionesDeFormulario (departamentos, puestos y tipo de gasto)', sinPie.length === 0, sinPie.join(', '));

  console.log('\n4) Las cabeceras\n');
  const sinCab = Object.entries(CABECERAS).filter(([f, t]) => {
    const s = sinComentarios(fuentes.get(f as typeof FICHEROS[number]) ?? '');
    return !(/import \{[^}]*\bCabeceraDePagina\b[^}]*\} from '@\/components\/ui\/cabecera-de-pagina'/.test(s)
      && new RegExp(`<CabeceraDePagina\\b[^>]*?titulo="${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(s)
      && !/<h1\b/.test(s));
  }).map(([f]) => f.replace(/^src\//, ''));
  ok(`las ${Object.keys(CABECERAS).length} cabeceras del grupo usan CabeceraDePagina (y no les queda un <h1> propio)`, sinCab.length === 0, sinCab.join(', '));
  const dorados = [...fuentes].filter(([, s]) => /<h1\b[^>]*(#c5a059|amber-\d00)/i.test(sinComentarios(s))).map(([f]) => f.replace(/^src\//, ''));
  ok('ningun <h1> del grupo es dorado (2,4:1 sobre blanco)', dorados.length === 0, dorados.join(', '));

  console.log('\n5) type explicito\n');
  const sinTipo: string[] = [];
  for (const [f, src] of fuentes) {
    for (const b of botones(src)) if (!/\btype=/.test(b.abre) && !/\basChild\b/.test(b.abre)) sinTipo.push(`${f.replace(/^src\//, '')}@${src.slice(0, b.pos).split('\n').length}`);
  }
  ok('todo boton del grupo lleva type (el que no envia, "button")', sinTipo.length === 0, `${sinTipo.length}: ${sinTipo.slice(0, 5).join(', ')}`);

  console.log('\n6) Iconos y clases del estandar\n');
  const iconos = [...fuentes].filter(([, s]) => /import \{[^}]*\b(Edit|Edit2|ListFilter|SlidersHorizontal)\b[^}]*\} from 'lucide-react'/.test(s) || /\btext-body-sm\b/.test(s)).map(([f]) => f.replace(/^src\//, ''));
  ok('ni Edit/Edit2 (es Pencil) ni ListFilter/SlidersHorizontal, ni text-body-sm', iconos.length === 0, iconos.join(', '));

  console.log('\n7) Los componentes compartidos usan Button por dentro\n');
  const usaButton = (f: string) => /import \{[^}]*\bButton\b[^}]*\} from '@\/components\/ui\/button'/.test(leer(f)) && !/<button\b/.test(sinComentarios(leer(f)));
  ok('boton-buscar-dgii, confirm-dialog y estado-carga: Button, sin <button> a mano',
    ['src/components/ui/boton-buscar-dgii.tsx', 'src/components/ui/confirm-dialog.tsx', 'src/components/ui/estado-carga.tsx'].every(usaButton));
  await intenta('  y "Buscar DGII" se dibuja con la variante documento y el tamaño sm (misma API)', async () => {
    const [React, { renderToStaticMarkup }, M] = await Promise.all([import('react'), import('react-dom/server'), import('../src/components/ui/boton-buscar-dgii')]);
    const x = renderToStaticMarkup(React.createElement(M.BotonBuscarDgii, { onClick: () => {}, buscando: false }));
    const c = new Set((/class="([^"]*)"/.exec(x)?.[1] ?? '').split(/\s+/));
    return /variant="documento"[\s\S]*size="sm"|size="sm"[\s\S]*variant="documento"/.test(leer('src/components/ui/boton-buscar-dgii.tsx'))
      && ['bg-[#C5A059]', 'text-slate-950', 'h-8', 'rounded-lg', 'font-bold', 'focus-visible:ring-2'].every((k) => c.has(k));
  });

  console.log('\n8) Lo que no cambia: textos, placeholder, title, avisos y API (invariante)\n');
  const cambiados: string[] = [];
  for (const f of FICHEROS) {
    let antes: string;
    try { antes = enCommit(BASE, f); } catch { cambiados.push(`${f}: no esta en ${BASE}`); continue; }
    const a = textosDe(antes, false), d = textosDe(fuentes.get(f) ?? '', true);
    const { faltan, sobran } = diferencia(a, d);
    //  Los title que pinta un IconButton a partir de su aria-label son añadidos, como el aria-label.
    const sobranDeVerdad = sobran.filter((x) => !(x.startsWith('title:') && botones(fuentes.get(f) ?? '').some((b) => b.tag === 'IconButton' && !/\btitle=/.test(b.abre) && b.abre.includes(`aria-label="${x.slice(6)}"`))));
    if (faltan.length || sobranDeVerdad.length) cambiados.push(`${f.replace(/^src\//, '')}: faltan ${JSON.stringify(faltan)} sobran ${JSON.stringify(sobranDeVerdad)}`);
  }
  invariante(`los ${FICHEROS.length} ficheros dicen lo mismo que en ${BASE}`, cambiados.length === 0, cambiados.slice(0, 4).join(' | '));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS, ${rotas} invariante(s) rota(s)`}\n`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
