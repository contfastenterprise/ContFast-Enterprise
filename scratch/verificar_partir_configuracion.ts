/**
 * Lote 238 -- la pagina de Configuracion, partida en componentes sin cambiar lo
 * que hace. Pedido del dueño: cerrar las advertencias de React Doctor de esa
 * pantalla; dos de ellas (componente gigante, complejidad alta) solo se van
 * partiendola, y se hace antes y aparte, como con conduces (226) y caja (229).
 *
 * `settings/page.tsx` tenia 1.481 lineas. Queda el armazon -- las pestanas y que
 * se pinta en cada una -- y salen tres hooks (`useAjustes`, `useCuentasPuente`,
 * `useTiposDeGasto`) y once componentes. El codigo se MOVIO tal cual, cortado
 * por rangos de lineas (`scratch/_to_delete/partir238.py`); lo unico que cambia
 * es el prefijo `a.` / `p.` / `g.` de lo que viene de cada hook.
 *
 * Lo que un corte asi puede romper sin que se vea: las cuentas puente se
 * cargaban DENTRO de la carga de los ajustes (y otra vez al guardar). Ahora son
 * dos hooks y esa llamada cruza de uno a otro; si se pierde, compila igual y la
 * pestana sale con los desplegables vacios.
 */
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (ts: string[], m: string) => { for (const t of ts) ok(t, false, m); };
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};
let terminado = false;
process.on('beforeExit', () => { if (!terminado) { console.log(' FALLA  el banco se quedo colgado y no llego al final'); process.exit(1); } });

const DIR = 'src/app/dashboard/settings';
/** La pagina entera, antes de partirla. */
const ANTES = '5600b9e';
const HOOKS = ['useAjustes.ts', 'useCuentasPuente.ts', 'useTiposDeGasto.ts'];
const PIEZAS = ['MiPerfil', 'FormularioEmpresa', 'IdentidadFiscal', 'AvisosDelSistema', 'IntegracionMseller', 'ParametrosOperativos', 'CodigosDeBarra',
  'PlanYSuscripcion', 'CuentasPuente', 'TiposDeGastos', 'ModalTipoDeGasto'];
/** Lo que era de la pagina y ahora esta repartido (la tarjeta de la portada ya vivia aparte y no entra). */
const AHORA = [`${DIR}/page.tsx`, ...HOOKS.map((h) => `${DIR}/hooks/${h}`), ...PIEZAS.map((p) => `${DIR}/components/${p}.tsx`)];

/** Lo que se ve y lo que se pide: clases, textos, ejemplos, titulos, avisos y direcciones de la API. Con repetidos. */
function huella(src: string): string[] {
  //  El prefijo del hook no es algo que se vea: `${a.formData.x}` es `${formData.x}`.
  //  Y `=> Promise<void>` es un tipo, no un texto entre etiquetas (la firma del hook nuevo lo parecia).
  const s = sinComentarios(src.replace(/\r\n/g, '\n')).replace(/(?<![\w.$])[apg]\.(?=[A-Za-z_])/g, '').replace(/Promise<void>/g, 'Promise');
  const out: string[] = [];
  const tomar = (re: RegExp, pref: string) => { for (const m of s.matchAll(re)) out.push(`${pref}:${(m[1] ?? m[2] ?? '').replace(/\s+/g, ' ').trim()}`); };
  tomar(/className="([^"]*)"/g, 'clase');
  tomar(/className=\{`([^`]*)`\}/g, 'clase');
  tomar(/placeholder=(?:"([^"]*)"|\{([^}]*)\})/g, 'ejemplo');
  tomar(/title=(?:"([^"]*)"|\{([^}]*)\})/g, 'titulo');
  tomar(/toast\.(?:success|error|warning|info)\(\s*(?:'([^']*)'|`([^`]*)`)/g, 'aviso');
  tomar(/fetch\(\s*(?:'([^']*)'|`([^`]*)`)/g, 'api');
  tomar(/>\s*([A-ZÁÉÍÓÚÑa-záéíóúñ¿¡$][^<>{}\n]{2,})\s*</g, 'texto');
  return out.sort();
}

type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Fn = (p: unknown) => unknown;
const nada = () => {};

async function main() {
  //  Vale en los dos estados: la pagina de Configuracion con su pestana de cuentas puente.
  const pagina = leer(`${DIR}/page.tsx`);
  if (!/activeTab === 'puente'/.test(pagina) || !/activeTab === 'gastos'/.test(pagina)) throw new Error('Precondicion: la pagina de Configuracion ya no tiene sus pestanas');

  console.log('\n1) La pagina es el armazon\n');
  const lineas = (f: string) => leer(f).split(/\r?\n/).length;
  ok('la pagina no pasa de 200 lineas (eran 1.481)', lineas(`${DIR}/page.tsx`) <= 200, `${lineas(`${DIR}/page.tsx`)} lineas`);
  const largas = AHORA.slice(1).filter((f) => lineas(f) <= 1 || lineas(f) > 240);
  ok('  y ninguna pieza pasa de 240', largas.length === 0, largas.map((f) => `${f.split('/').pop()} ${lineas(f)}`).join(', ') || AHORA.slice(1).map((f) => lineas(f)).join(' '));
  const pag = sinComentarios(pagina);
  ok('el estado lo crea la PAGINA: lo escrito en una pestana sobrevive a cambiar a otra',
    /const p = useCuentasPuente\(\);/.test(pag) && /const a = useAjustes\(p\.cargar\);/.test(pag) && /const g = useTiposDeGasto\(\);/.test(pag)
    && /<FormularioEmpresa a=\{a\} \/>/.test(pag) && /<CuentasPuente p=\{p\} \/>/.test(pag) && /<TiposDeGastos g=\{g\} \/>/.test(pag));
  const vistas = PIEZAS.map((p) => sinComentarios(leer(`${DIR}/components/${p}.tsx`)));
  ok('  y las piezas solo pintan: ni estado, ni efectos, ni red', vistas.every((v) => v.length > 0 && !/\buse(State|Effect|Ref)\b/.test(v) && !/\bfetch\(/.test(v)));

  console.log('\n2) Lo que cruza de un hook a otro\n');
  const ajustes = sinComentarios(leer(`${DIR}/hooks/useAjustes.ts`));
  const carga = (() => { const i = ajustes.indexOf('async function fetchSettings()'); return i < 0 ? '' : ajustes.slice(i, ajustes.indexOf('useEffect(', i)); })();
  ok('las cuentas puente se cargan al terminar de leer los ajustes, y solo si se pudieron leer',
    /export function useAjustes\(cargarPuentes: \(\) => Promise<void>\)/.test(ajustes)
    && /if \(data\.success && data\.data\) \{[\s\S]*setAvailablePlans\([\s\S]*await cargarPuentes\(\);\s*\}\s*\} catch/.test(carga));
  const guardar = (() => { const i = ajustes.indexOf('const handleSave = async'); return i < 0 ? '' : ajustes.slice(i, ajustes.indexOf('const handleLogoUpload', i)); })();
  ok('  y guardar los ajustes sigue releyendo del servidor (con ellas)', /if \(data\.success\) \{[\s\S]*await fetchSettings\(\);\s*\} else \{/.test(guardar));
  ok('los tipos de gasto se piden al abrir su pestana', /const \{ fetchExpenseTypes \} = g;/.test(pag) && /if \(activeTab === 'gastos'\) \{\s*fetchExpenseTypes\(\);/.test(pag));

  console.log('\n3) Dibujadas\n');
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const cargar = async (n: string): Promise<Fn | null> => {
    try { return ((await import(`../src/app/dashboard/settings/components/${n}`)) as Record<string, Fn>)[n] ?? null; } catch { return null; }
  };
  const dibujar = (C: Fn, props: object) => { try { return renderToStaticMarkup(React.createElement(C as never, props)); } catch (e) { return `LANZO ${(e as Error).message}`; } };
  const a: AnyRec = {
    loading: false, submitting: false, userRole: 'administracion', currentUser: null, setCurrentUser: nada, entornosMseller: ['TesteCF'],
    credencialesEntorno: 'TesteCF', setCredencialesEntorno: nada, hasMsellerPassword: true, claveYaConfigurada: true, showMsellerPassword: false,
    setShowMsellerPassword: nada, subscription: null, availablePlans: [], setFormData: nada, correoDeAvisos: 'avisos@latin.do',
    isSistemas: false, isAdministracion: true, isNameDisabled: true, isRncDisabled: true, fetchSettings: nada, handleSave: nada, handleLogoUpload: nada,
    formData: { name: 'Latin Doors', rnc: '131000001', businessActivity: 'Puertas', address: 'Santiago', phone: '8095550000', email: 'info@latin.do', logoUrl: '',
      dgiiEnv: 'PRODUCCION', printLayout: 'carta', printCopies: 2, autoDeliveryNotes: true, maxCreditNoteApprovalAmount: 500, maxCashOutApprovalAmount: 100,
      msellerUrl: 'https://ecf.api.mseller.app/v1', msellerEmail: 'u@latin.do', msellerApiKey: '', msellerPassword: '', barcodeDefaultType: 'code128',
      barcodePrefix: 'COD', barcodeLength: 9, avisosCorreo: 'avisos@latin.do' },
  };
  const Formulario = await cargar('FormularioEmpresa');
  const E3 = ['el formulario de Empresa: sus tres tarjetas en orden, los avisos y los codigos de barra dentro, y UN boton de guardar',
    '  con lo que hay escrito, y lo que no es de sistemas no se puede tocar'];
  if (!Formulario) falta(E3, 'no existe FormularioEmpresa');
  else {
    const h = dibujar(Formulario, { a });
    const pos = ['Identidad Fiscal', 'Avisos del sistema', 'Integración mSeller API', 'Parámetros Operativos', 'Códigos de Barra', 'Guardar Cambios'].map((t) => h.indexOf(t));
    ok(E3[0], pos.every((x, i) => x > 0 && (i === 0 || x > pos[i - 1])) && (h.match(/<form\b/g) ?? []).length === 1 && (h.match(/type="submit"/g) ?? []).length === 1, pos.join(' '));
    ok(E3[1], /value="Latin Doors"/.test(h) && /Se enviará a avisos@latin\.do/.test(h) && /eCF — ambiente REAL/.test(h) && /Con clave: TesteCF\./.test(h)
      && /<input type="text" disabled=""[^>]*value="https:\/\/ecf\.api\.mseller\.app\/v1"/.test(h) && /placeholder="•••••••• \(Configurada\)"/.test(h)
      && /Cantidad de Copias/.test(h));
  }
  const Puentes = await cargar('CuentasPuente');
  const E4 = 'las cuentas puente: un desplegable por cuenta, con solo las del tipo esperado y la ya elegida';
  if (!Puentes) ok(E4, false, 'no existe CuentasPuente');
  else {
    const { GRUPOS_DE_PUENTES } = await import('../src/services/accounting/cuentasDelSistema');
    const todos = GRUPOS_DE_PUENTES.flatMap((gr) => gr.puentes);
    const uno = todos[0];
    const otroTipo = todos.find((x) => x.tipo !== uno.tipo)!;
    const p = { draftMappings: { [uno.claves[0]]: 'c-rara' }, setDraftMappings: nada, mappingSubmitting: false, handleSaveMappings: nada, cargar: nada,
      accounts: [{ id: 'c-buena', code: '9.9.01', name: 'Del tipo', type: uno.tipo, isTransactional: true },
        { id: 'c-rara', code: '9.9.02', name: 'Elegida de otro tipo', type: otroTipo.tipo, isTransactional: false },
        //  Las dos que NO deben salir: una de otro tipo sin elegir, y una del tipo que es de agrupacion.
        { id: 'c-ajena', code: '9.9.03', name: 'De otro tipo', type: otroTipo.tipo, isTransactional: true },
        { id: 'c-grupo', code: '9.9.04', name: 'De agrupacion', type: uno.tipo, isTransactional: false }] };
    const h = dibujar(Puentes, { p });
    const primero = /<select[^>]*>([\s\S]*?)<\/select>/.exec(h)?.[1] ?? '';
    ok(E4, (h.match(/<select\b/g) ?? []).length === todos.length && /9\.9\.01 - Del tipo/.test(primero) && /9\.9\.02 - Elegida de otro tipo/.test(primero)
      && !/9\.9\.03/.test(primero) && !/9\.9\.04/.test(primero)
      && /Guardar Cuentas Puente/.test(h), `${(h.match(/<select\b/g) ?? []).length} desplegables de ${todos.length}`);
  }
  const Lista = await cargar('TiposDeGastos');
  const Modal = await cargar('ModalTipoDeGasto');
  const E5 = ['los tipos de gasto: uno estandar se desactiva, uno propio se elimina', 'el modal: al editar no se cambia el codigo y sale el estado; al crear, no'];
  if (!Lista || !Modal) falta(E5, 'no existen las piezas de tipos de gasto');
  else {
    const g: AnyRec = { expenseTypes: [{ id: '1', code: '02', name: 'Gastos por trabajos', status: 'active' }, { id: '2', code: '44', name: 'Propio', status: 'inactive' }],
      loadingExpenseTypes: false, handleOpenTypeModal: nada, handleDeleteType: nada, showTypeModal: true, setShowTypeModal: nada, editingType: null,
      typeCode: '', setTypeCode: nada, typeName: '', setTypeName: nada, typeStatus: 'active', setTypeStatus: nada, savingType: false, handleSaveType: nada };
    const h = dibujar(Lista, { g });
    ok(E5[0], /title="Desactivar"/.test(h) && /title="Eliminar"/.test(h) && /Gastos por trabajos/.test(h) && />Inactivo</.test(h)
      && /No hay tipos de gastos registrados/.test(dibujar(Lista, { g: { ...g, expenseTypes: [] } })));
    const crear = dibujar(Modal, { g });
    const editar = dibujar(Modal, { g: { ...g, editingType: g.expenseTypes[0], typeCode: '02', typeName: 'Gastos por trabajos' } });
    ok(E5[1], /Crear Tipo de Gasto/.test(crear) && !/<select\b/.test(crear) && !/disabled=""[^>]*maxLength/.test(crear)
      && /Editar Tipo de Gasto/.test(editar) && /<select\b/.test(editar) && /<input type="text" disabled=""[^>]*value="02"/.test(editar));
  }

  console.log('\n4) Lo que se ve y lo que se pide no cambio\n');
  //  Cierto antes y despues por definicion: como `ok()` regalaria un OK en la contraprueba.
  const antes = huella(execSync(`git show ${ANTES}:${DIR}/page.tsx`, { cwd: raiz, encoding: 'utf8', maxBuffer: 1 << 26 }));
  const ahora = huella(AHORA.map(leer).join('\n'));
  const resto = [...ahora];
  const perdidas = antes.filter((x) => { const i = resto.indexOf(x); if (i < 0) return true; resto.splice(i, 1); return false; });
  invariante(`las ${antes.length} clases, textos, ejemplos, titulos, avisos y direcciones de la pagina de antes siguen ahi, una por una`,
    antes.length > 400 && perdidas.length === 0 && resto.length === 0, `faltan: ${perdidas.slice(0, 4).join(' | ') || '-'} ; sobran: ${resto.slice(0, 4).join(' | ') || '-'}`);

  terminado = true;
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
