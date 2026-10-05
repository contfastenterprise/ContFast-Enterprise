/**
 * Lote 294 -- la pagina de nomina, partida en componentes sin cambiar lo que hace.
 *
 * Pedido del dueño (2026-10-05), antes del lote D (el pago de la nomina). `hr/payroll/page.tsx`
 * tenia 607 lineas; el guion `scratch/_to_delete/partir294.py` la corta por rangos de lineas:
 * el estado y las acciones pasan TAL CUAL a `hooks/useNominas.ts`, y el JSX a cinco piezas de
 * `components/` que reciben el hook (`h`) y sacan de el lo que pintan. Ninguna linea de JSX se
 * reescribe: se mueve.
 *
 * Lo que se demuestra:
 *  1. INVARIANTE (codigo 3): lo visible -- clases, textos, ejemplos, titulos, aria-label, avisos y
 *     direcciones de la API, uno por uno y con repetidos, mas el texto que va DETRAS de una
 *     expresion, que `huella` no ve (el hueco que cubrio el banco del lote 280) -- es lo mismo en
 *     `42730af` (antes) que en `97bdf14` (el commit del corte). Dos commits fijos y no la carpeta:
 *     el lote D cambiara esta pantalla a proposito.
 *  2. Ningun fichero de la pantalla pasa de 300 lineas, y la pagina es solo el armazon.
 *  3. El cableado: la pagina usa el hook y le pasa `h` a cada pieza; el detalle lleva sus acciones
 *     y sus volantes; nadie mas guarda estado.
 *  4. EJECUTADO: las llamadas que se encadenan, que un corte podia romper sin que compilara peor
 *     -- al abrir carga la lista; crear la recarga y abre la nueva; aprobar recarga la lista y
 *     RELEE el detalle (lote 293: asi sale el asiento); un rechazo deja su motivo a la vista;
 *     recalcular relee el detalle; eliminar vuelve a la lista y la recarga. El hook corre sobre un
 *     motor de React minimo (solo `useState`/`useEffect`, que es lo que usa) contra un `fetch`
 *     sustituido; la confirmacion y los avisos tambien se sustituyen, solo para el hook.
 *  5. DIBUJADO con `react-dom/server`: cada pieza, con el `h` que dejo el motor.
 *
 * Se ejecuta con: node node_modules/tsx/dist/cli.mjs scratch/verificar_partir_nomina.ts
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { diferencia, enCommit, huella } from './huellaDePantalla';
import { DIR_NOMINA, ficherosDePantallaDeNomina } from './pantallaDeNomina';

const raiz = join(__dirname, '..');
const ANTES = '42730af';
const CORTE = '97bdf14';
let fallos = 0;
let total = 0;
let terminado = false;
const ok = (t: string, c: boolean, d = '') => { total++; console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d && !c ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};
/** Una seccion entera: si lanza (el modulo no existe, la accion revienta), todas sus etiquetas FALLAN. */
async function seccion(etiquetas: string[], f: () => void | Promise<void>) {
  const antes = total;
  try { await f(); } catch (e) {
    const hechas = total - antes;
    for (const t of etiquetas.slice(hechas)) ok(t, false, `lanzo: ${(e as Error).message.split('\n')[0]}`);
  }
}
const leer = (f: string) => (existsSync(join(raiz, f)) ? readFileSync(join(raiz, f), 'utf8').replace(/\r\n/g, '\n') : '');
const sinComentarios = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

//  `huella` no ve el texto que va DETRAS de una expresion (`{d.firstName} {d.lastName}`, `- {fecha}`):
//  se toma aqui, igual en los dos lados (lote 280).
function visible(src: string): string[] {
  const h = huella(src);
  const s = src.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of s.matchAll(/\}([^<>{}]*[A-Za-zÁÉÍÓÚáéíóúñÑ|\-][^<>{}]*)(?=[<{])/g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (t && !/[;=()]/.test(t)) h.push(`tras-expresion:${t}`);
  }
  return h.sort();
}

/** Los ficheros de la pantalla en un commit, menos la tarjeta del asiento (es del lote 293, igual en los dos). */
function pantallaEnCommit(commit: string): string {
  const fs = execFileSync('git', ['ls-tree', '-r', '--name-only', commit, '--', DIR_NOMINA], { cwd: raiz, encoding: 'utf8' })
    .split('\n').map((x) => x.trim()).filter((x) => /\.tsx?$/.test(x) && !/AsientoDeLaNomina\.tsx$/.test(x));
  return fs.map((f) => enCommit(commit, f)).join('\n');
}

// ─── El motor de React minimo, solo para el hook ─────────────────────────────
type Ajuste<T> = T | ((x: T) => T);
const motor = { estado: [] as unknown[], i: 0, efectos: [] as (() => void)[] };
const ReactFalso = {
  useState<T>(inicial: T | (() => T)) {
    const k = motor.i++;
    if (!(k in motor.estado)) motor.estado[k] = typeof inicial === 'function' ? (inicial as () => T)() : inicial;
    const poner = (v: Ajuste<T>) => { motor.estado[k] = typeof v === 'function' ? (v as (x: T) => T)(motor.estado[k] as T) : v; };
    return [motor.estado[k] as T, poner] as const;
  },
  useEffect(f: () => void) { motor.efectos.push(f); },
};
const avisos: string[] = [];
const toastFalso = Object.assign((m: string) => { avisos.push(`toast:${m}`); }, {
  success: (m: string) => { avisos.push(`success:${m}`); }, error: (m: string) => { avisos.push(`error:${m}`); },
  warning: (m: string) => { avisos.push(`warning:${m}`); }, loading: (m: string) => { avisos.push(`loading:${m}`); return 'id'; },
});
//  Hace lo que el ConfirmProvider: ejecuta la accion y se traga su error (avisa con onErrorMessage).
const confirmFalso = async (o: { action?: () => Promise<void>; onSuccessMessage?: string; onErrorMessage?: string }) => {
  try { await o.action?.(); avisos.push(`success:${o.onSuccessMessage}`); return true; } catch { avisos.push(`error:${o.onErrorMessage}`); return false; }
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module') as { _load: (r: string, p: { filename?: string } | null, m: boolean) => unknown };
const cargaOriginal = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent?.filename && /[\\/]hooks[\\/]useNominas\.ts$/.test(parent.filename)) {
    if (request === 'react') return ReactFalso;
    if (request === 'sonner') return { toast: toastFalso };
    if (request === '@/providers/confirm-provider') return { useConfirm: () => confirmFalso };
  }
  return cargaOriginal.call(this, request, parent, isMain);
};

// ─── El fetch sustituido ─────────────────────────────────────────────────────
const pedidos: string[] = [];
let responder: (metodo: string, url: string, cuerpo: unknown) => unknown = () => ({ success: true, data: [] });
globalThis.fetch = (async (url: string, init?: { method?: string; body?: string }) => {
  const metodo = init?.method ?? 'GET';
  const cuerpo = init?.body ? JSON.parse(init.body) : undefined;
  pedidos.push(`${metodo} ${url}${cuerpo && (cuerpo as { action?: string }).action ? ` ${(cuerpo as { action: string }).action}` : ''}`);
  const datos = responder(metodo, url, cuerpo);
  return { ok: true, status: 200, json: async () => datos } as Response;
}) as typeof fetch;
const espera = () => new Promise((r) => setTimeout(r, 0));

const NOMINA = { id: 'n1', periodStart: '2026-10-01', periodEnd: '2026-10-15', paymentDate: '2026-10-15', frequency: 'quincenal', status: 'calculated', createdAt: '2026-10-01' };
const APROBADA = { ...NOMINA, id: 'n0', periodStart: '2026-09-16', periodEnd: '2026-09-30', status: 'approved' };
const DETALLE = { id: 'd1', employeeId: 'e1', employeeCode: 'EMP-001', firstName: 'Ana', lastName: 'Pérez', baseSalary: '30000', overtimeAmount: '0', bonusAmount: '1500', commissionAmount: '0', afp: '861', sfs: '912', isr: '0', otherDeductions: '0', netSalary: '29727' };
const ASIENTO = { id: 'a1', fecha: '2026-10-15', descripcion: 'Nómina', total: 31500, lineas: [{ codigo: '6.1.01.01', cuenta: 'Sueldos y Salarios', debe: 31500, haber: 0 }] };

/** La API de siempre, con lo que cada escenario le cambie. */
function api(o: { aprobar?: 'ok' | 'niega'; estadoTrasAprobar?: string } = {}) {
  let estado = 'calculated';
  return (metodo: string, url: string, cuerpo: unknown) => {
    const c = cuerpo as { action?: string } | undefined;
    if (metodo === 'GET' && url === '/api/v1/hr/payroll') return { success: true, data: [NOMINA, APROBADA] };
    if (metodo === 'GET' && url.startsWith('/api/v1/hr/payroll?id=')) {
      const id = url.split('=')[1];
      return { success: true, data: { payroll: { ...NOMINA, id, status: estado }, details: [DETALLE], avisoIsr: 'Escala de 2025', asiento: estado === 'approved' ? ASIENTO : null } };
    }
    if (metodo === 'POST') return { success: true, data: { ...NOMINA, id: 'n2' } };
    if (metodo === 'PUT' && c?.action === 'approve') {
      if (o.aprobar === 'niega') return { success: false, error: { message: 'No se puede aprobar: falta la cuenta de Sueldos por Pagar.' } };
      estado = o.estadoTrasAprobar ?? 'approved';
      return { success: true, data: { asiento: ASIENTO } };
    }
    if (metodo === 'PUT') return { success: true, data: {} };
    if (metodo === 'DELETE') return { success: true };
    return { success: false };
  };
}

async function main() {
  console.log('\n1) Lo visible no cambia (invariante, entre dos commits fijos)\n');
  const antes = visible(enCommit(ANTES, `${DIR_NOMINA}/page.tsx`));
  const { faltan, sobran } = diferencia(antes, visible(pantallaEnCommit(CORTE)));
  invariante(`lo visible en ${CORTE} es lo de ${ANTES} (${antes.length} elementos, uno por uno y con repetidos)`,
    faltan.length === 0 && sobran.length === 0, `faltan ${JSON.stringify(faltan.slice(0, 4))} sobran ${JSON.stringify(sobran.slice(0, 4))}`);

  console.log('\n2) El tamaño\n');
  const ficheros = ficherosDePantallaDeNomina(raiz);
  const lineas = ficheros.map((f) => ({ f: f.replace(`${DIR_NOMINA}/`, ''), n: leer(f).split('\n').length }));
  ok(`ningun fichero de la pantalla pasa de 300 lineas (${lineas.map((x) => `${x.f} ${x.n}`).join(', ')})`, lineas.every((x) => x.n <= 300));
  ok('la pagina es el armazon (menos de 100 lineas y sin estado propio)',
    leer(`${DIR_NOMINA}/page.tsx`).split('\n').length < 100 && !/\buse(State|Effect)\b/.test(sinComentarios(leer(`${DIR_NOMINA}/page.tsx`))));

  console.log('\n3) El cableado\n');
  const pagina = sinComentarios(leer(`${DIR_NOMINA}/page.tsx`));
  const detalle = sinComentarios(leer(`${DIR_NOMINA}/components/DetalleDeLaNomina.tsx`));
  ok('la pagina crea el hook una vez y le pasa `h` a la lista, al detalle y a la ventana de generar',
    /import \{ useNominas \} from '\.\/hooks\/useNominas';/.test(pagina) && (pagina.match(/useNominas\(\)/g) ?? []).length === 1
      && /const h = useNominas\(\);/.test(pagina)
      && /\{!selectedPayroll \? \(\s*<ListaDeNominas h=\{h\} \/>\s*\) : \(\s*<DetalleDeLaNomina h=\{h\} \/>\s*\)\}/.test(pagina)
      && /<GenerarNomina h=\{h\} \/>/.test(pagina));
  ok('el detalle lleva sus acciones (AccionesDeLaNomina, donde ira "Pagar") y sus volantes, solo cuando ya cargo',
    /<AccionesDeLaNomina h=\{h\} \/>/.test(detalle)
      && /\{loadingDetails \? \([\s\S]*?\) : \(\s*<VolantesDeLaNomina h=\{h\} \/>\s*\)\}/.test(detalle));
  //  Lote 295: las piezas que trajo EL CORTE (las que existen en ${CORTE}). Una pieza que llega
  //  despues con su propio formulario -- `PagarNomina`, la ventana del pago, que guarda lo que se
  //  escribe en ella -- no es estado del corte que se quedo fuera del hook.
  const delCorte = (f: string) => { try { execFileSync('git', ['cat-file', '-e', `${CORTE}:${f}`], { cwd: raiz, stdio: 'ignore' }); return true; } catch { return false; } };
  const conEstado = ficheros.filter((f) => delCorte(f) && !/hooks\/useNominas\.ts$/.test(f) && /\buse(State|Effect)\b/.test(sinComentarios(leer(f))));
  ok('nadie mas que el hook guarda estado (no hay una copia del estado en una pieza)', conEstado.length === 0 && existsSync(join(raiz, DIR_NOMINA, 'hooks/useNominas.ts')), conEstado.join(', '));

  console.log('\n4) Ejecutado: las llamadas que se encadenan\n');
  type H = Record<string, unknown> & {
    selectedPayroll: { id: string; status: string } | null; showCreateModal: boolean; motivoRechazo: string | null;
    asiento: unknown; payrolls: unknown[]; payrollDetailsList: unknown[];
    handleSelectPayroll: (p: object) => Promise<void>; handleCreatePayroll: (e: { preventDefault: () => void }) => Promise<void>;
    handleApprove: (id: string) => Promise<void>; handleRecalculate: (id: string) => Promise<void>; handleDelete: (id: string) => Promise<void>;
    setShowCreateModal: (v: boolean) => void;
  };
  let usarHook: (() => H) | null = null;
  const pinta = (): H => { motor.i = 0; motor.efectos = []; return usarHook!(); };
  const monta = async (r: ReturnType<typeof api>) => {
    motor.estado = []; pedidos.length = 0; avisos.length = 0; responder = r;
    const h = pinta();
    for (const e of motor.efectos) e();
    await espera(); await espera();
    return h;
  };
  const E4 = [
    'al abrir, carga la lista (GET /api/v1/hr/payroll) y la guarda',
    'generar: POST, recarga la lista y abre la nomina NUEVA (la relee del servidor); la ventana se cierra',
    'aprobar: PUT approve, recarga la lista y RELEE el detalle (sale aprobada y con su asiento, lote 293)',
    'un rechazo al aprobar deja su motivo a la vista, sin recargar ni releer',
    'recalcular: PUT recalculate y relee el detalle de la nomina abierta',
    'eliminar: DELETE, vuelve a la lista y la recarga',
  ];
  await seccion(E4, async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    usarHook = (require(join(raiz, DIR_NOMINA, 'hooks/useNominas.ts')) as { useNominas: () => H }).useNominas;
    let h = await monta(api());
    h = pinta();
    ok(E4[0], pedidos.join(' | ') === 'GET /api/v1/hr/payroll' && h.payrolls.length === 2, pedidos.join(' | '));

    pedidos.length = 0;
    h.setShowCreateModal(true);
    h = pinta();
    await h.handleCreatePayroll({ preventDefault: () => {} });
    await espera(); await espera();
    h = pinta();
    ok(E4[1], pedidos.join(' | ') === 'POST /api/v1/hr/payroll | GET /api/v1/hr/payroll | GET /api/v1/hr/payroll?id=n2'
      && h.selectedPayroll?.id === 'n2' && h.showCreateModal === false && h.payrollDetailsList.length === 1, `${pedidos.join(' | ')} / ${h.selectedPayroll?.id} / ${h.showCreateModal}`);

    h = await monta(api());
    await pinta().handleSelectPayroll(NOMINA);
    h = pinta();
    pedidos.length = 0;
    await h.handleApprove('n1');
    await espera(); await espera();
    h = pinta();
    ok(E4[2], pedidos.join(' | ') === 'PUT /api/v1/hr/payroll?id=n1 approve | GET /api/v1/hr/payroll | GET /api/v1/hr/payroll?id=n1'
      && h.selectedPayroll?.status === 'approved' && h.asiento !== null && h.motivoRechazo === null, `${pedidos.join(' | ')} / ${h.selectedPayroll?.status}`);

    h = await monta(api({ aprobar: 'niega' }));
    await pinta().handleSelectPayroll(NOMINA);
    h = pinta();
    pedidos.length = 0;
    await h.handleApprove('n1');
    await espera();
    h = pinta();
    ok(E4[3], pedidos.join(' | ') === 'PUT /api/v1/hr/payroll?id=n1 approve' && h.motivoRechazo === 'No se puede aprobar: falta la cuenta de Sueldos por Pagar.'
      && h.selectedPayroll?.status === 'calculated', `${pedidos.join(' | ')} / ${h.motivoRechazo}`);

    h = await monta(api());
    await pinta().handleSelectPayroll(NOMINA);
    h = pinta();
    pedidos.length = 0;
    await h.handleRecalculate('n1');
    await espera(); await espera();
    ok(E4[4], pedidos.join(' | ') === 'PUT /api/v1/hr/payroll?id=n1 recalculate | GET /api/v1/hr/payroll?id=n1', pedidos.join(' | '));

    h = await monta(api());
    await pinta().handleSelectPayroll(NOMINA);
    h = pinta();
    pedidos.length = 0;
    await h.handleDelete('n1');
    await espera(); await espera();
    h = pinta();
    ok(E4[5], pedidos.join(' | ') === 'DELETE /api/v1/hr/payroll?id=n1 | GET /api/v1/hr/payroll' && h.selectedPayroll === null, `${pedidos.join(' | ')} / ${h.selectedPayroll?.id}`);
  });

  console.log('\n5) Dibujado\n');
  const E5 = [
    'la lista: cada nomina con su estado, "Ver" en todas, "Eliminar" solo donde la regla lo deja, y "de 2 nóminas"',
    'el detalle: periodo, el aviso del ISR, imprimir, recalcular y aprobar, y el volante de cada colaborador',
    'aprobada: el asiento a la vista, y ni recalcular ni aprobar',
    'mientras carga el detalle no se ofrece aprobar',
    'la ventana de generar: role="dialog", su titulo y "Generar y Calcular"',
  ];
  await seccion(E5, async () => {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const pieza = async (n: string) => (await import(`../src/app/dashboard/hr/payroll/components/${n}`))[n] as (p: { h: unknown }) => React.ReactElement;
    const [Lista, Detalle, Generar] = await Promise.all([pieza('ListaDeNominas'), pieza('DetalleDeLaNomina'), pieza('GenerarNomina')]);
    const dibuja = (C: (p: { h: unknown }) => React.ReactElement, h: unknown) => renderToStaticMarkup(React.createElement(C, { h })).replace(/<!-- -->/g, "");

    let h = await monta(api());
    h = pinta();
    const lista = dibuja(Lista, h);
    ok(E5[0], (lista.match(/>Calculada</g) ?? []).length === 2 && (lista.match(/>Aprobada</g) ?? []).length === 2
      && (lista.match(/aria-label="Eliminar nómina"/g) ?? []).length === 2 && (lista.match(/ Ver</g) ?? []).length === 4 && /Mostrando 1 - 2 de 2 nóminas/.test(lista.replace(/<[^>]+>/g, "")), lista.slice(0, 120));

    await h.handleSelectPayroll(NOMINA);
    h = pinta();
    const det = dibuja(Detalle, h);
    ok(E5[1], /Nómina Período: 01-10-2026 - 15-10-2026/.test(det) && /Escala de 2025/.test(det) && /Imprimir Todos los Volantes/.test(det)
      && /Recalcular Todo/.test(det) && /Aprobar Nómina/.test(det) && /href="\/api\/v1\/hr\/payroll\/n1\/receipts\?employeeId=e1"/.test(det) && /Ana Pérez|Ana<!-- --> <!-- -->Pérez/.test(det), det.slice(0, 200));

    await h.handleApprove('n1');
    await espera(); await espera();
    h = pinta();
    const apr = dibuja(Detalle, h);
    ok(E5[2], /Sueldos y Salarios/.test(apr) && /Imprimir Todos los Volantes/.test(apr) && !/Recalcular Todo/.test(apr) && !/Aprobar Nómina/.test(apr), apr.slice(0, 200));

    h = await monta(api());
    await pinta().handleSelectPayroll(NOMINA);
    h = { ...pinta(), loadingDetails: true };
    const cargando = dibuja(Detalle, h);
    ok(E5[3], /Recalcular Todo/.test(cargando) && !/Aprobar Nómina/.test(cargando) && /animate-spin/.test(cargando));

    h = pinta();
    h.setShowCreateModal(true);
    h = pinta();
    const ventana = dibuja(Generar, h);
    ok(E5[4], /role="dialog"/.test(ventana) && /Generar Nómina de Período/.test(ventana) && /Generar y Calcular/.test(ventana) && /value="quincenal"/.test(ventana));
  });

  terminado = true;
  console.log(`\n${total - fallos} OK, ${fallos} FALLA de ${total}`);
  console.log(fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`);
  process.exit(fallos === 0 ? 0 : 1);
}

//  Un banco que se queda sin nada que esperar a medias sale con 0 (lote 236): eso es un FALLA.
process.on('beforeExit', () => { if (!terminado) { console.log(' FALLA  el banco no llego al final'); process.exit(1); } });
main().catch((e) => { console.error(e); process.exit(2); });
