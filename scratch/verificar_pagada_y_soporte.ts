/**
 * Lote 297 -- dos fallos que encontro el agente del manual de nomina.
 *
 *  1. La nomina pagada salia como "PAID" en el detalle (`status.toUpperCase()`) y "paid" en la
 *     lista (que traducia a mano solo "aprobada" y "calculada"). Ahora los dos leen UNA regla,
 *     `etiquetaDelEstado` (services/nomina/estadoDeNomina.ts, sobre los mismos `NOMBRES` que
 *     `nombreDelEstado`), y la insignia de la lista lleva un color por estado.
 *  2. La pantalla de Soporte (lote 288) no tenia entrada: ahora es un enlace del menu del avatar.
 *
 * Se EJECUTA la regla con los estados del esquema, se DIBUJAN la lista, el detalle y el menu del
 * avatar (abierto) con react-dom/server. Las negaciones ("no sale PAID") van ATADAS a una marca
 * positiva (seccion 3 del metodo): antes del lote, "no sale PAID" en una pieza que no carga seria
 * cierto de balde.
 *
 * Se ejecuta con: npx tsx scratch/verificar_pagada_y_soporte.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const raiz = resolve(__dirname, '..');
const leer = (r: string) => readFileSync(resolve(raiz, r), 'utf8');
let fallos = 0;
let llegoAlFinal = false;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const intenta = (t: string, f: () => boolean) => { try { ok(t, f()); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message.slice(0, 120)}`); } };
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
/** Identificador entero (no prefijo): la trampa de `includes()` de la seccion 3. */
const nombra = (f: string, id: string) => new RegExp(`\\b${id}\\b`).test(f);

process.on('beforeExit', () => { if (!llegoAlFinal) { console.log(' FALLA  el banco no llego al final'); process.exitCode = 1; } });

//  Lo que se espera ver. No se copia de `NOMBRES`: si se copiara, el banco aceptaria
//  cualquier cosa que el modulo dijera.
const ESPERADO: Record<string, string> = {
  draft: 'Borrador', calculated: 'Calculada', approved: 'Aprobada', paid: 'Pagada', cancelled: 'Cancelada',
};

const NOMINA = { periodStart: '2026-10-01', periodEnd: '2026-10-15', paymentDate: '2026-10-15', frequency: 'quincenal', createdAt: '2026-10-01' };
const DETALLE = [
  { id: 'd1', employeeId: 'e1', firstName: 'Ana', lastName: 'Pérez', employeeCode: 'E1', baseSalary: '10000', overtimeAmount: '0', bonusAmount: '0', commissionAmount: '0', afpEmployee: '287', sfsEmployee: '304', isrAmount: '0', otherDeductions: '0', netSalary: '9409.00', grossSalary: '10000' },
];

function estadoDetalle(status: string): AnyRec {
  return {
    selectedPayroll: { id: 'n1', ...NOMINA, status }, payrollDetailsList: DETALLE, loadingDetails: false, avisoIsr: null,
    asiento: null, motivoRechazo: null, pago: null, handleRecalculate: () => {}, handleApprove: () => {}, alPagar: () => {},
  };
}
function estadoLista(estados: string[]): AnyRec {
  const nominas = estados.map((s, i) => ({ id: `n${i}`, ...NOMINA, status: s }));
  return {
    payrolls: nominas, pagedPayrolls: nominas, loading: false, page: 1, setPage: () => {}, itemsPerPage: 10,
    totalPages: 1, handleSelectPayroll: () => {}, handleDelete: () => {},
  };
}

async function main() {
  // ─────────────────────────────────────────────────────────────────────────
  //  PRECONDICION, cierta en los dos estados: la lista de estados del modulo es la del esquema.
  //  Si alguien anade un estado a la columna sin darle nombre, esto se niega a correr.
  // ─────────────────────────────────────────────────────────────────────────
  const esquema = leer('src/db/schema/hr.ts');
  //  Acotado a la tabla `payrolls`: otras tablas del fichero tienen su propia columna `status`.
  const iTabla = esquema.search(/pgTable\(\s*'payrolls'/);
  const finTabla = iTabla < 0 ? -1 : esquema.indexOf('pgTable(', iTabla + 10);
  const tabla = iTabla < 0 ? '' : esquema.slice(iTabla, finTabla < 0 ? undefined : finTabla);
  const linea = tabla.match(/status: varchar\('status'[^\n]*\/\/\s*([a-z| ]+)/);
  if (!linea) throw new Error('PRECONDICION: no se encuentra la columna payrolls.status con su lista de estados');
  const delEsquema = linea[1].split('|').map((x) => x.trim()).filter(Boolean);
  const regla: AnyRec = await import('../src/services/nomina/estadoDeNomina');
  const delModulo = [...(regla.ESTADOS_DE_NOMINA as readonly string[])];
  if (delEsquema.slice().sort().join() !== delModulo.slice().sort().join() || delModulo.slice().sort().join() !== Object.keys(ESPERADO).sort().join()) {
    throw new Error(`PRECONDICION: estados del esquema (${delEsquema}) y del modulo (${delModulo}) no coinciden`);
  }

  console.log('\n1) La regla de nombres, con todos los estados del esquema\n');
  const etiqueta = regla.etiquetaDelEstado as ((s: string) => string) | undefined;
  ok('existe UNA regla de rotulo, `etiquetaDelEstado`', typeof etiqueta === 'function');
  for (const s of delEsquema) {
    intenta(`  ${s} -> "${ESPERADO[s]}"`, () => !!etiqueta && etiqueta(s) === ESPERADO[s]);
  }
  intenta('  y dice lo mismo que `nombreDelEstado` (los nombres viven en un solo sitio)', () =>
    !!etiqueta && delEsquema.every((s) => etiqueta(s).toLowerCase() === (regla.nombreDelEstado as (x: string) => string)(s)));

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n2) La lista de nominas\n');
  // ─────────────────────────────────────────────────────────────────────────
  let Lista: AnyRec | null = null, Detalle: AnyRec | null = null;
  try {
    Lista = (await import('../src/app/dashboard/hr/payroll/components/ListaDeNominas')).ListaDeNominas;
    Detalle = (await import('../src/app/dashboard/hr/payroll/components/DetalleDeLaNomina')).DetalleDeLaNomina;
  } catch (e) { console.log(`  (no cargan las piezas: ${(e as Error).message.slice(0, 120)})`); }
  const dibuja = (C: AnyRec | null, h: AnyRec) => { if (!C) throw new Error('pieza ausente'); return renderToStaticMarkup(React.createElement(C as never, { h } as never)).replace(/<!-- -->/g, ''); };

  let listaPagada = '';
  try { listaPagada = dibuja(Lista, estadoLista(['paid'])); } catch (e) { console.log(`  (la lista no se dibuja: ${(e as Error).message.slice(0, 120)})`); }
  const vecesPagada = (listaPagada.match(/>Pagada</g) || []).length;
  ok('una nomina pagada sale "Pagada" en las DOS vistas (movil y escritorio)', vecesPagada === 2, `${vecesPagada} veces`);
  ok('  y no sale "paid" ni "PAID" (atada: solo cuenta si sale "Pagada")', vecesPagada > 0 && !/\bpaid\b/i.test(listaPagada));
  intenta('los cinco estados salen en espanol en la lista', () => {
    const x = dibuja(Lista, estadoLista(delEsquema));
    return Object.values(ESPERADO).every((n) => (x.match(new RegExp(`>${n}<`, 'g')) || []).length === 2)
      && !delEsquema.some((s) => new RegExp(`>${s}<`, 'i').test(x));
  });
  //  El COLOR por estado: la clase de la insignia que lleva cada rotulo.
  const claseDe = (html: string, n: string) => { const m = html.match(new RegExp(`<span class="([^"]*)">${n}</span>`)); return m ? m[1] : null; };
  intenta('la insignia de la pagada no es la ambar de lo pendiente (antes caia ahi)', () => { const c = claseDe(listaPagada, 'Pagada'); return !!c && !/amber/.test(c); });
  intenta('  cada estado tiene su color: cinco insignias, cinco colores', () => {
    const x = dibuja(Lista, estadoLista(delEsquema));
    const colores = Object.values(ESPERADO).map((n) => (claseDe(x, n) || '').replace(/text-\[\d+px\]/, ''));
    return colores.every(Boolean) && new Set(colores).size === 5;
  });
  intenta('  y la cancelada va en rojo (rose), no en ambar', () => /rose/.test(claseDe(dibuja(Lista, estadoLista(['cancelled'])), 'Cancelada') || ''));

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n3) El detalle de la nomina\n');
  // ─────────────────────────────────────────────────────────────────────────
  let detPagada = '';
  try { detPagada = dibuja(Detalle, estadoDetalle('paid')); } catch (e) { console.log(`  (el detalle no se dibuja: ${(e as Error).message.slice(0, 120)})`); }
  ok('el detalle de una pagada dice "Estado: Pagada"', /Estado: <span[^>]*>Pagada<\/span>/.test(detPagada));
  ok('  y no "PAID" (atada a la marca de arriba)', /Estado: <span[^>]*>Pagada</.test(detPagada) && !/PAID|>paid</.test(detPagada));
  intenta('  una aprobada dice "Aprobada" (antes "APPROVED")', () => /Estado: <span[^>]*>Aprobada<\/span>/.test(dibuja(Detalle, estadoDetalle('approved'))));

  console.log('\n4) Las dos pantallas leen la MISMA regla, sin toUpperCase del valor crudo\n');
  const lista = sinComentarios(leer('src/app/dashboard/hr/payroll/components/ListaDeNominas.tsx'));
  const detalle = sinComentarios(leer('src/app/dashboard/hr/payroll/components/DetalleDeLaNomina.tsx'));
  let insignia = '';
  try { insignia = sinComentarios(leer('src/app/dashboard/hr/payroll/components/InsigniaDeEstado.tsx')); } catch { /* aun no existe */ }
  const importaRegla = (f: string) => /import \{[^}]*\betiquetaDelEstado\b[^}]*\} from '@\/services\/nomina\/estadoDeNomina'/.test(f);
  ok('el detalle importa `etiquetaDelEstado` y la usa con el estado', importaRegla(detalle) && /etiquetaDelEstado\(selectedPayroll\.status\)/.test(detalle));
  ok('la lista pinta la insignia comun, que importa y usa la regla',
    /import \{ InsigniaDeEstado \} from '\.\/InsigniaDeEstado'/.test(lista) && /<InsigniaDeEstado status=\{pr\.status\}/.test(lista)
    && importaRegla(insignia) && /\{etiquetaDelEstado\(status\)\}/.test(insignia));
  //  Atadas al positivo de arriba: sin el import, "no hay toUpperCase" tambien lo cumple un fichero vacio.
  ok('  ni la lista ni el detalle hacen toUpperCase del estado ni traducen a mano',
    importaRegla(detalle) && nombra(lista, 'InsigniaDeEstado')
    && !/status\.toUpperCase\(\)/.test(detalle + lista) && !/'Aprobada'|'Calculada'/.test(lista));

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n5) Soporte, en el menu del avatar\n');
  // ─────────────────────────────────────────────────────────────────────────
  //  El menu arranca CERRADO (`useState(false)`): para dibujarlo abierto se sustituye
  //  `useState` del modulo CommonJS de React (el que carga el componente transpilado por tsx;
  //  un `import()` daria otro objeto, la trampa del lote 230) solo durante este dibujo.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  let Menu: AnyRec | null = null;
  try { Menu = (await import('../src/components/ui/menu-del-usuario')).default; } catch (e) { console.log(`  (no carga el menu: ${(e as Error).message.slice(0, 120)})`); }
  const dibujaMenu = (abierto: boolean) => {
    if (!Menu) throw new Error('menu ausente');
    const original = R.useState;
    R.useState = (v: unknown) => (v === false && abierto ? [true, () => {}] : original(v));
    try {
      return renderToStaticMarkup(React.createElement(Menu as never, { nombre: 'Ana', rol: 'cajero', onCerrarSesion: () => {} } as never));
    } finally { R.useState = original; }
  };
  let abierto = '';
  try { abierto = dibujaMenu(true); } catch (e) { console.log(`  (el menu no se dibuja: ${(e as Error).message.slice(0, 120)})`); }
  const enlace = abierto.match(/<a [^>]*href="\/dashboard\/support"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? '';
  //  PRECONDICION del dibujo: la sustitucion abrio el menu de verdad (sale "Cerrar Sesión", que esta
  //  en los dos estados). Si no, todo lo de abajo fallaria por el banco y no por el codigo.
  if (!/Cerrar Sesión/.test(abierto)) throw new Error('PRECONDICION: el menu del avatar no se dibuja abierto');
  ok('el menu abierto lleva un ENLACE a /dashboard/support', enlace !== '');
  ok('  que dice "Soporte" y es un elemento del menu (role="menuitem")', /role="menuitem"/.test(enlace) && />Soporte<\/a>$/.test(enlace.replace(/\s+/g, ' ').replace(/ <\/a>$/, '</a>')));
  ok('  con su icono de lucide, decorativo', /<svg[^>]*class="[^"]*lucide[^"]*"[^>]*aria-hidden="true"/.test(enlace));
  //  Teclado: un <a href> se alcanza con Tab y se abre con Enter. Lo que lo romperia es sacarlo del
  //  orden de tabulacion.
  ok('  se navega con el teclado: es un <a href>, sin tabindex="-1"', enlace.startsWith('<a ') && !/tabindex="-1"/i.test(enlace));
  const menuCodigo = sinComentarios(leer('src/components/ui/menu-del-usuario.tsx'));
  const bloqueLink = menuCodigo.match(/<Link\b[\s\S]*?<\/Link>/)?.[0] ?? '';
  ok('  y al pulsarlo el menu se cierra', /href="\/dashboard\/support"/.test(bloqueLink) && /onClick=\{\(\) => setAbierto\(false\)\}/.test(bloqueLink));
  ok('  es el Link de Next (navega sin recargar la aplicacion)', /import Link from 'next\/link'/.test(menuCodigo) && bloqueLink !== '');
  //  Atada al positivo: cerrado no sale (es lo que hace un menu), pero sin el enlace tampoco.
  intenta('con el menu cerrado el enlace no se pinta', () => enlace !== '' && !/\/dashboard\/support/.test(dibujaMenu(false)));
  //  NO se toco `route_mappings` ni el menu lateral: la entrada no depende de ningun permiso.
  ok('  y no depende de un permiso (el menu no consulta rbac)', enlace !== '' && !/useRbac|canAccessRoute|hasPermission/.test(menuCodigo));

  llegoAlFinal = true;
  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { llegoAlFinal = true; console.error(e); process.exit(2); });
