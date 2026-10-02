/**
 * Lote 239 -- las advertencias de React Doctor de la pantalla de Configuracion,
 * cerradas. Pedido del dueño; la pagina se partio antes, en el lote 238.
 *
 * Eran unas 65 (las mismas que tenia la pagina vieja). Medido despues con React
 * Doctor en local: 0 en la carpeta. Las que cambian comportamiento:
 *
 *  · GUARDAR LAS CUENTAS PUENTE decia "guardadas exitosamente" sin mirar una
 *    sola respuesta: con un 403 o un 500 en todas, el mismo aviso verde;
 *  · las lecturas `await res.json()` antes de mirar el estado pasan por
 *    `leerRespuesta`: un 5xx con pagina de error al guardar decia "Error de
 *    conexion" (la red funciono), y si los tipos de gasto no se podian leer la
 *    pantalla decia "No hay tipos de gastos registrados";
 *  · el error del correo de avisos llegaba como TEXTO y la pantalla buscaba
 *    `error.message`: se leia "Error al guardar" a secas;
 *  · dos clics seguidos en Guardar mandaban dos peticiones (guarda en `useRef`);
 *  · un importe a medio escribir se guardaba como vacio (`NaN` viaja como
 *    `null`), y uno negativo no significa nada: los dos son 0;
 *  · accesibilidad: cada etiqueta con su campo, el interruptor es un
 *    interruptor, y los botones sin texto dicen que hacen.
 *
 * El banco EJECUTA las reglas y las acciones de los hooks contra un `fetch`
 * sustituido, y DIBUJA las piezas para mirar las etiquetas en el HTML.
 */
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { ficherosDePantallaDeAjustes } from './pantallaDeAjustes';

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
/** La pantalla ya partida (lote 238), antes de cerrar las advertencias. */
const ANTES = 'aa43cbb';

type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Fn = (p: unknown) => unknown;
const nada = () => {};
const json = (estado: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });
const paginaDeError = () => new Response('<html><body>Bad Gateway</body></html>', { status: 502, headers: { 'Content-Type': 'text/html' } });

/** Etiquetas del HTML: las que apuntan a un campo que no existe, y las que ni apuntan ni envuelven uno. */
function etiquetas(html: string) {
  const todas = [...html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)];
  const huerfanas = todas.map((m) => /\bfor="([^"]+)"/.exec(m[1])?.[1]).filter((f): f is string => !!f).filter((f) => !new RegExp(`\\bid="${f}"`).test(html));
  const sueltas = todas.filter((m) => !/\bfor="/.test(m[1]) && !/<input\b/.test(m[2])).length;
  const conFor = todas.filter((m) => /\bfor="/.test(m[1])).length;
  return { total: todas.length, conFor, sueltas, huerfanas };
}

async function main() {
  //  Vale en los dos estados: la pantalla ya partida del lote 238.
  if (ficherosDePantallaDeAjustes(raiz).length < 14 || !leer(`${DIR}/hooks/useAjustes.ts`)) throw new Error('Precondicion: la pantalla de Configuracion no esta partida (lote 238)');

  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- el hook carga la version CommonJS de sonner (lote 230)
  const { toast } = require('sonner');
  const avisos: string[] = [];
  for (const k of ['error', 'success', 'warning']) (toast as AnyRec)[k] = (m: string) => { avisos.push(`${k}:${m}`); return 0; };
  const errorDeConsola = console.error;
  console.error = nada;

  const fetchDeVerdad = globalThis.fetch;
  let pedidos: string[] = [];
  let responder: (metodo: string, url: string) => Promise<Response> = async () => json(200, { success: true, data: [] });
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';
    pedidos.push(`${metodo} ${String(u).replace('/api/v1/', '')}`);
    return responder(metodo, String(u));
  }) as typeof fetch;
  const intenta = async (t: string, f: () => Promise<[boolean, string]>) => {
    try { const [c, d] = await f(); ok(t, c, d); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); }
  };
  //  Lo que YA era cierto antes del lote y tiene que seguir siendolo: como `ok()` regalaria un OK en la contraprueba.
  const sigue = async (t: string, f: () => Promise<[boolean, string]>) => {
    let r: [boolean, string];
    try { r = await f(); } catch (e) { r = [false, `lanzo: ${(e as Error).message}`]; }
    invariante(t, r[0], r[1]);
  };
  const importar = async (ruta: string): Promise<AnyRec | null> => { try { return (await import(ruta)) as AnyRec; } catch { return null; } };

  console.log('\n1) Las reglas, ejecutadas\n');
  const R = await importar('../src/app/dashboard/settings/ajustes');
  const E1 = ['un importe a medio escribir, vacio o negativo es 0; uno valido es el', 'un tipo de gasto estandar es uno de los diez de la DGII, con sus dos cifras',
    'guardar las cuentas puente dice cuantas NO se guardaron y por que; solo dice "guardadas" si lo estan todas', 'las pestanas: Mi Perfil para cualquiera, las otras cinco de configuracion'];
  if (!R?.importeDelCampo || !R?.esTipoEstandar || !R?.avisoDeCuentasPuente || !R?.PESTANAS) falta(E1, 'no existe settings/ajustes.ts');
  else {
    const im = R.importeDelCampo as (v: string) => number;
    ok(E1[0], [im(''), im('-'), im('1e'), im('-5'), im('abc'), im('Infinity')].every((x) => x === 0) && im('12.5') === 12.5 && im('500') === 500,
      ['', '-', '1e', '-5', '12.5'].map((v) => `"${v}"→${im(v)}`).join(' '));
    const es = R.esTipoEstandar as (c: string) => boolean;
    ok(E1[1], es('01') && es('10') && !es('11') && !es('00') && !es('2') && !es(''));
    const av = R.avisoDeCuentasPuente as (r: unknown[]) => { bien: boolean; texto: string };
    const todas = av([{ bien: true }, { bien: true }]);
    const una = av([{ bien: true }, { bien: false, mensaje: 'Permiso denegado' }, { bien: false }]);
    const sinMotivo = av([{ bien: false }]);
    ok(E1[2], todas.bien && todas.texto === 'Cuentas puente guardadas exitosamente.' && !una.bien && una.texto === 'No se guardaron 2 de 3 cuentas puente: Permiso denegado'
      && !sinMotivo.bien && sinMotivo.texto === 'No se guardaron 1 de 1 cuentas puente.' && av([]).bien, `${una.texto} | ${sinMotivo.texto}`);
    const P = R.PESTANAS as Array<{ id: string; deConfiguracion: boolean }>;
    ok(E1[3], P.map((x) => x.id).join(',') === 'perfil,empresa,tienda,puente,suscripcion,gastos' && P.filter((x) => !x.deConfiguracion).map((x) => x.id).join() === 'perfil');
  }

  console.log('\n2) Guardar y cargar los ajustes, ejecutados\n');
  const H = await importar('../src/app/dashboard/settings/hooks/useAjustes');
  const E2 = ['dos clics seguidos en "Guardar Cambios" mandan UN solo PATCH, y despues se relee del servidor', 'un 502 con pagina de error al guardar NO es "Error de conexión"',
    'un rechazo del servidor se dice con su motivo', 'al cargar: un 403 se calla (quien no administra solo ve su perfil), un 502 se dice',
    'las cuentas puente se cargan si los ajustes se leyeron, y no si no'];
  const evento = { preventDefault: nada } as never;
  if (!H?.useAjustes) falta(E2, 'no existe useAjustes');
  else {
    let puentes = 0;
    const nuevo = (): AnyRec => { let h: AnyRec = {}; renderToStaticMarkup(React.createElement(() => { h = H.useAjustes(async () => { puentes++; }); return null; })); return h; };
    const AJUSTES = { company: { name: 'Latin Doors', rnc: '1' }, settings: { dgiiEnv: 'PRUEBA', printLayout: 'carta', autoDeliveryNotes: false, maxCreditNoteApprovalAmount: '0', maxCashOutApprovalAmount: '0' } };
    const lectura = (url: string) => (url.endsWith('/auth/me') ? json(200, { success: true, data: { user: { id: 'u', name: 'N', email: 'e', role: 'administracion' } } })
      : json(200, { success: true, data: AJUSTES }));

    await intenta(E2[0], async () => {
      const h = nuevo(); pedidos = []; avisos.length = 0;
      const enEspera: Array<() => void> = [];
      responder = (metodo, url) => (metodo === 'PATCH' ? new Promise<Response>((r) => { enEspera.push(() => r(json(200, { success: true, avisos: ['La copia en caché no se pudo tirar.'] }))); })
        : Promise.resolve(lectura(url)));
      const uno = h.handleSave(evento); const dos = h.handleSave(evento);
      await new Promise((r) => setTimeout(r, 20));
      const enVuelo = pedidos.join(' | ');
      for (const s of enEspera.splice(0)) s();
      await Promise.all([uno, dos]);
      const patch = pedidos.filter((x) => x.startsWith('PATCH')).length;
      const relee = pedidos.indexOf('GET admin/settings') > pedidos.indexOf('PATCH admin/settings');
      return [enVuelo === 'PATCH admin/settings' && patch === 1 && relee && avisos.includes('success:Configuración guardada exitosamente')
        && avisos.includes('warning:La copia en caché no se pudo tirar.'), `${pedidos.join(' | ')} ; ${avisos.join(' · ')}`];
    });
    await intenta(E2[1], async () => {
      avisos.length = 0; responder = async () => paginaDeError();
      await nuevo().handleSave(evento);
      return [avisos.join('|') === 'error:Error al guardar', avisos.join('|')];
    });
    await sigue(E2[2], async () => {
      avisos.length = 0; responder = async () => json(400, { success: false, error: { message: 'El correo para avisos no es una dirección válida.' } });
      await nuevo().handleSave(evento);
      return [avisos.join('|') === 'error:El correo para avisos no es una dirección válida.', avisos.join('|')];
    });
    await sigue(E2[3], async () => {
      avisos.length = 0;
      responder = async (_m, url) => (url.endsWith('/auth/me') ? lectura(url) : json(403, { success: false, error: { message: 'Permiso denegado' } }));
      await nuevo().fetchSettings();
      const callado = avisos.join('|');
      responder = async (_m, url) => (url.endsWith('/auth/me') ? lectura(url) : paginaDeError());
      await nuevo().fetchSettings();
      return [callado === '' && avisos.join('|') === 'error:Error al cargar configuración', `403: "${callado}" ; 502: "${avisos.join('|')}"`];
    });
    await sigue(E2[4], async () => {
      puentes = 0; responder = async (_m, url) => lectura(url);
      await nuevo().fetchSettings();
      const tras = puentes;
      responder = async (_m, url) => (url.endsWith('/auth/me') ? lectura(url) : json(403, { success: false }));
      await nuevo().fetchSettings();
      return [tras === 1 && puentes === 1, `leidos: ${tras}, tras un 403: ${puentes}`];
    });
  }

  console.log('\n3) Los tipos de gasto, ejecutados\n');
  const T = await importar('../src/app/dashboard/settings/hooks/useTiposDeGasto');
  const { ConfirmProvider } = (await importar('../src/providers/confirm-provider')) ?? {};
  const E3 = 'si la lista no se puede leer se dice el motivo (antes: "No hay tipos de gastos registrados")';
  if (!T?.useTiposDeGasto || !ConfirmProvider) ok(E3, false, 'no existe useTiposDeGasto');
  else {
    await intenta(E3, async () => {
      let g: AnyRec = {};
      renderToStaticMarkup(React.createElement(ConfirmProvider as never, null, React.createElement(() => { g = T.useTiposDeGasto(); return null; })));
      avisos.length = 0; responder = async () => json(403, { success: false, error: { message: 'Permiso denegado' } });
      await g.fetchExpenseTypes();
      const con403 = avisos.join('|');
      avisos.length = 0; responder = async () => paginaDeError();
      await g.fetchExpenseTypes();
      return [con403 === 'error:Permiso denegado' && avisos.join('|') === 'error:Error al cargar tipos de gastos', `403: ${con403} ; 502: ${avisos.join('|')}`];
    });
  }
  globalThis.fetch = fetchDeVerdad;
  console.error = errorDeConsola;

  console.log('\n4) Dibujadas: cada etiqueta con su campo\n');
  const pieza = async (n: string): Promise<Fn | null> => ((await importar(`../src/app/dashboard/settings/components/${n}`)) ?? {})[n] ?? null;
  const dibujar = (C: Fn | null, props: object) => { if (!C) return 'NO EXISTE'; try { return renderToStaticMarkup(React.createElement(C as never, props)); } catch (e) { return `LANZO ${(e as Error).message}`; } };
  const a: AnyRec = {
    loading: false, submitting: false, userRole: 'administracion', currentUser: null, setCurrentUser: nada, entornosMseller: [], credencialesEntorno: 'TesteCF',
    setCredencialesEntorno: nada, hasMsellerPassword: false, claveYaConfigurada: false, showMsellerPassword: false, setShowMsellerPassword: nada, subscription: null,
    availablePlans: [], setFormData: nada, correoDeAvisos: '', isSistemas: true, isAdministracion: false, isNameDisabled: false, isRncDisabled: false,
    fetchSettings: nada, handleSave: nada, handleLogoUpload: nada,
    formData: { name: 'Latin Doors', rnc: '1', businessActivity: '', address: '', phone: '', email: 'info@latin.do', logoUrl: 'data:image/png;base64,AAAA', dgiiEnv: 'PRUEBA',
      printLayout: 'carta', printCopies: 2, autoDeliveryNotes: true, maxCreditNoteApprovalAmount: 0, maxCashOutApprovalAmount: 0, msellerUrl: 'https://x', msellerEmail: '',
      msellerApiKey: '', msellerPassword: '', barcodeDefaultType: 'code128', barcodePrefix: 'COD', barcodeLength: 9, avisosCorreo: '' },
  };
  const form = dibujar(await pieza('FormularioEmpresa'), { a });
  const ef = etiquetas(form);
  ok('el formulario de Empresa: veinte etiquetas, cada una apunta a un campo que existe, y ninguna queda suelta',
    ef.conFor === 20 && ef.sueltas === 0 && ef.huerfanas.length === 0 && new Set([...form.matchAll(/\bid="(ajuste-[^"]+)"/g)].map((m) => m[1])).size === 20,
    `${ef.conFor} con campo, ${ef.sueltas} sueltas, huerfanas: ${ef.huerfanas.join(',') || '-'}`);
  ok('  "Logo de la Empresa" encabeza el boton de subir, no etiqueta un campo', /<p class="[^"]*">Logo de la Empresa \(Facturas y Reportes\)<\/p>/.test(form) && /aria-label="Remover logo"/.test(form));
  const interruptor = /<button type="button" role="switch" aria-checked="(true|false)" aria-label="Conduces automáticos"/.exec(form)?.[1];
  const apagado = /role="switch" aria-checked="(true|false)"/.exec(dibujar(await pieza('FormularioEmpresa'), { a: { ...a, formData: { ...a.formData, autoDeliveryNotes: false } } }))?.[1];
  ok('  el interruptor de conduces automaticos dice que lo es y como esta', interruptor === 'true' && apagado === 'false', `${interruptor} / ${apagado}`);
  ok('  y el ojo de la contraseña dice que hace', /aria-label="Mostrar la contraseña"/.test(form)
    && /aria-label="Ocultar la contraseña"/.test(dibujar(await pieza('FormularioEmpresa'), { a: { ...a, showMsellerPassword: true } })));

  const { GRUPOS_DE_PUENTES } = await import('../src/services/accounting/cuentasDelSistema');
  const filas = GRUPOS_DE_PUENTES.flatMap((gr) => gr.puentes).length;
  const puentes = dibujar(await pieza('CuentasPuente'), { p: { draftMappings: {}, setDraftMappings: nada, mappingSubmitting: false, handleSaveMappings: nada, cargar: nada, accounts: [] } });
  const ep = etiquetas(puentes);
  ok('las cuentas puente: una etiqueta por desplegable, cada una con el suyo', ep.conFor === filas && ep.sueltas === 0 && ep.huerfanas.length === 0
    && new Set([...puentes.matchAll(/<select id="(puente-[^"]+)"/g)].map((m) => m[1])).size === filas, `${ep.conFor} de ${filas}`);

  const g: AnyRec = { expenseTypes: [], loadingExpenseTypes: false, handleOpenTypeModal: nada, handleDeleteType: nada, showTypeModal: true, setShowTypeModal: nada,
    editingType: { id: '1', code: '02', name: 'X', status: 'active' }, typeCode: '02', setTypeCode: nada, typeName: 'X', setTypeName: nada, typeStatus: 'active', setTypeStatus: nada,
    savingType: false, handleSaveType: nada };
  const modal = dibujar(await pieza('ModalTipoDeGasto'), { g });
  const em = etiquetas(modal);
  ok('el modal de tipos de gasto: sus tres etiquetas con su campo, y el boton de cerrar dice que cierra y no envia el formulario',
    em.conFor === 3 && em.sueltas === 0 && em.huerfanas.length === 0 && /<button type="button" aria-label="Cerrar"/.test(modal), `${em.conFor} con campo, ${em.sueltas} sueltas`);

  console.log('\n5) Las pestanas\n');
  const Pest = await pieza('PestanasDeAjustes');
  const admin = dibujar(Pest, { activa: 'tienda', puedeConfigurar: true, alElegir: nada });
  const cajero = dibujar(Pest, { activa: 'perfil', puedeConfigurar: false, alElegir: nada });
  const nombres = (h: string) => [...h.matchAll(/<button type="button"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  const activa = /<button type="button" class="([^"]*)">Tienda<\/button>/.exec(admin)?.[1] ?? '';
  ok('quien administra ve las seis, en su orden; quien no, solo "Mi Perfil"',
    nombres(admin).join('|') === 'Mi Perfil|Configuración Empresa|Tienda|Cuentas Puente|Plan & Suscripción|Tipos de Gastos' && nombres(cajero).join('|') === 'Mi Perfil'
    && /border-\[#003366\] text-\[#003366\]/.test(activa) && (admin.match(/border-\[#003366\] text-\[#003366\]/g) ?? []).length === 1, nombres(admin).join('|') || admin.slice(0, 60));
  const Cont = await pieza('ContenidoDeLaPestana');
  const base = { a, p: { draftMappings: {}, accounts: [], setDraftMappings: nada, mappingSubmitting: false, handleSaveMappings: nada, cargar: nada }, g,
    portada: { datos: null, errorDeCarga: null, f: {}, cargar: nada }, puedeConfigurar: true };
  ok('  cada pestana pinta lo suyo; la tienda no, para quien no puede configurar, y el perfil no, sin usuario',
    /Identidad Fiscal/.test(dibujar(Cont, { ...base, pestana: 'empresa' })) && /Cuentas Puente/.test(dibujar(Cont, { ...base, pestana: 'puente' }))
    && /Cargando la portada/.test(dibujar(Cont, { ...base, pestana: 'tienda' })) && dibujar(Cont, { ...base, pestana: 'tienda', puedeConfigurar: false }) === ''
    && dibujar(Cont, { ...base, pestana: 'perfil' }) === '' && /Plan y Suscripción/.test(dibujar(Cont, { ...base, pestana: 'suscripcion' }))
    && /Tipos de Gastos/.test(dibujar(Cont, { ...base, pestana: 'gastos' })));
  const pagina = sinComentarios(leer(`${DIR}/page.tsx`));
  ok('  lo que una pestana pide, se pide al ELEGIRLA: la pagina no tiene efectos',
    /if \(pestana === 'tienda'\) void portada\.cargar\(\);/.test(pagina) && /if \(pestana === 'gastos'\) void g\.fetchExpenseTypes\(\);/.test(pagina)
    && /alElegir=\{elegir\}/.test(pagina) && !/\buseEffect\b/.test(pagina));

  console.log('\n6) Lo demas\n');
  const hooks = ['useAjustes.ts', 'useCuentasPuente.ts', 'useTiposDeGasto.ts'].map((h) => sinComentarios(leer(`${DIR}/hooks/${h}`)));
  ok('ninguna respuesta se lee sin mirar su estado, y los tres guardados llevan su guarda en un ref',
    hooks.every((h) => !/\.json\(\)/.test(h) && /leerRespuesta/.test(h) && /if \(guardandoYa\.current\) return;/.test(h) && /guardandoYa\.current = false;/.test(h)));
  ok('  la carga inicial es un `useCallback`, y el efecto que la lanza declara de que depende',
    /const fetchSettings = useCallback\(async \(\) => \{/.test(hooks[0]) && /\}, \[cargarPuentes\]\);\s*useEffect\(\(\) => \{\s*fetchSettings\(\);\s*\}, \[fetchSettings\]\);/.test(hooks[0])
    && /const cargar = useCallback\(/.test(hooks[1]));
  const ruta = sinComentarios(leer('src/app/api/v1/admin/settings/route.ts'));
  ok('la ruta de ajustes da TODOS sus errores con la misma forma ({ message })', ruta.length > 0 && !/error: ['"`]/.test(ruta) && /error: \{ message: 'El correo para avisos no es una dirección válida/.test(ruta));
  const lista = sinComentarios(leer(`${DIR}/components/TiposDeGastos.tsx`));
  ok('"estandar" es UNA regla: nadie lleva su copia de los diez codigos',
    (lista.match(/esTipoEstandar\(type\.code\)/g) ?? []).length === 2 && /esTipoEstandar\(type\.code\)/.test(hooks[2])
    && ficherosDePantallaDeAjustes(raiz).filter((f) => !f.endsWith('/ajustes.ts')).every((f) => !/'01', '02', '03'/.test(leer(f))));

  console.log('\n7) Lo que se ve no cambio\n');
  //  Cierto antes y despues por definicion: como `ok()` regalaria un OK en la contraprueba.
  const visibles = (src: string) => {
    const s = sinComentarios(src.replace(/\r\n/g, '\n'));
    return [
      ...[...s.matchAll(/className="([^"]*)"/g)].map((m) => `clase:${m[1]}`),
      ...[...s.matchAll(/className=\{`([^`]*)`\}/g)].map((m) => `clase:${m[1].replace(/\s+/g, ' ').replace(/\b[a-z]+\.(?=[a-zA-Z])/g, '')}`),
      ...[...s.matchAll(/placeholder="([^"]*)"/g)].map((m) => `ejemplo:${m[1]}`),
      ...[...s.matchAll(/>\s*([A-ZÁÉÍÓÚÑa-záéíóúñ¿¡$][^<>{}\n]{2,})\s*</g)].map((m) => `texto:${m[1].trim()}`),
    ];
  };
  const deAntes = execSync(`git ls-tree -r --name-only ${ANTES} -- ${DIR}`, { cwd: raiz, encoding: 'utf8' }).split(/\r?\n/).filter((f) => /\.tsx$/.test(f))
    .map((f) => execSync(`git show ${ANTES}:${f}`, { cwd: raiz, encoding: 'utf8', maxBuffer: 1 << 26 })).join('\n');
  const deAhora = ficherosDePantallaDeAjustes(raiz).map(leer).join('\n') + leer(`${DIR}/ajustes.ts`);
  //  CON REPETIDOS, uno por uno: la misma clase vive en varias tarjetas, y con un conjunto bastaba
  //  que quedara UNA para dar por buenas todas (un mutante que cambiaba una de dos sobrevivio asi).
  const antes = visibles(deAntes);
  const quedan = visibles(deAhora);
  //  Los nombres de las pestanas pasan de texto entre etiquetas a datos (`PESTANAS`): se miran aparte, arriba, dibujadas.
  const DE_LAS_PESTANAS = ['texto:Mi Perfil', 'texto:Configuración Empresa', 'texto:Tienda', 'texto:Cuentas Puente', 'texto:Plan & Suscripción', 'texto:Tipos de Gastos'];
  //  Y sus seis clases llevaban dentro la condicion (`activeTab === 'perfil' ? ...`); ahora es una sola, con `activa === t.id`.
  const perdidas = antes.filter((x) => {
    if (DE_LAS_PESTANAS.includes(x) || x.includes("activeTab === '")) return false;
    const i = quedan.indexOf(x);
    if (i < 0) return true;
    quedan.splice(i, 1);
    return false;
  });
  invariante(`las ${antes.length} clases, ejemplos y textos de la pantalla del lote 238 siguen ahi`, antes.length > 250 && perdidas.length === 0, perdidas.slice(0, 5).join(' | '));

  terminado = true;
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
