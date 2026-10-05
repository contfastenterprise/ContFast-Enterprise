/**
 * Lote 304 -- Antigüedad de saldos: los datos no coincidian y el rojo no era correcto.
 *
 * Pedido del dueño (2026-10-05): *"/dashboard/antiguedad-saldos: los datos no coinciden, por lo
 * menos en cuentas por cobrar; los estados en rojo no son correctos, y otros datos"*.
 *
 * Medido en Latin Doors (PRODUCCION, solo lectura, `scratch/_to_delete/medir_antiguedad_304*.ts`) y
 * contrastado con una referencia independiente calculada desde los datos en bruto:
 *   - JUNIO JOSE FLORENTINO NICACIO salia con 1.060.446,79 y debe 957.830,12: se sumaba la CxC de
 *     E310000000029, RECHAZADA por la DGII. Lo mismo en Cuentas por Cobrar, el reporte, el estado de
 *     cuenta y el panel financiero: ninguna fuente miraba el estado de la factura.
 *   - El vencimiento era el de la CxC (`ahora + 1 mes`, en UTC), no el PACTADO en la factura.
 *   - Los dias se contaban contra `CURRENT_DATE` (UTC en Postgres) o `hoyDia()` (hora del proceso,
 *     UTC en Vercel): desde las 20:00 de RD todo llevaba un dia mas de atraso.
 *   - "1 a 15 dias de atraso" pintaba en ROJO, con un icono ambar al lado; el saldo del estado de
 *     cuenta salia en rojo siempre; y "Cartera en riesgo / mas de 15 dias de atraso" y el "Balance
 *     Operativo" sumaban el saldo ENTERO del cliente, incluidas las facturas por vencer.
 *   - La pantalla no tenia tramos de antiguedad (1-30, 31-60, 61-90, +90), que son los de las demas.
 *
 * Las reglas nuevas (`services/cartera/reglasDeCartera.ts` y `sqlDeCartera.ts`) se EJECUTAN, los
 * componentes se DIBUJAN y el cableado de cada fuente de CxC/CxP se lee acotado a su bloque.
 *
 * Se ejecuta con: npx tsx scratch/verificar_antiguedad_de_saldos.ts
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { fuente, bloque } from './_fuente';

const raiz = resolve(__dirname, '..');
const existe = (r: string) => existsSync(resolve(raiz, r));
const leer = (r: string) => (existe(r) ? fuente(r) : '');

let fallos = 0;
let rotas = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const invariante = (t: string, c: boolean, d = '') => { console.log(`${c ? '  inv ' : ' ROTA '}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) rotas++; };
const intenta = (t: string, f: () => boolean) => { try { ok(t, f()); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message}`); } };
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Carga un modulo que el lote crea; si no existe, cada etiqueta sale en FALLA (no revienta). */
async function cargar(ruta: string, etiquetas: string[]): Promise<AnyRec | null> {
  if (existe(ruta)) return (await import(pathToFileURL(resolve(raiz, ruta)).href)) as AnyRec;
  for (const t of etiquetas) ok(t, false, `no existe ${ruta}`);
  return null;
}

const HOY = '2026-10-05';
const doc = (entidadId: string, saldo: number, vence: string | null) => ({ entidadId, saldo, vence, creado: '2026-09-01T12:00:00Z' });

async function main() {
  // Lo que ya existia antes del lote: si falta, no hay nada que comprobar.
  if (!existe('src/services/cartera/vencimiento.ts') || !existe('src/repositories/carteraRepository.ts')
      || !existe('src/app/dashboard/antiguedad-saldos/page.tsx')) {
    throw new Error('PRECONDICION: no estan la pantalla, el repositorio o vencimiento.ts');
  }
  const V = (await import('../src/services/cartera/vencimiento')) as AnyRec;
  const riesgo = (await import('../src/services/cartera/riesgo')) as AnyRec;
  invariante('los tramos de vencimiento.ts siguen siendo 1-30, 31-60, 61-90 y +90',
    V.tramoDeAtraso(30) === '1-30' && V.tramoDeAtraso(31) === '31-60' && V.tramoDeAtraso(91) === '90+');
  invariante('los umbrales de riesgo siguen siendo 15 y 45', riesgo.nivelPorAtraso(15) === 'medio' && riesgo.nivelPorAtraso(16) === 'alto' && riesgo.nivelPorAtraso(46) === 'critico');

  // ─────────────────────────────── 1. reglas ───────────────────────────────
  console.log('\n1) Que documento es deuda, y cuando vence\n');
  const E1 = [
    'aceptada, enviada y firmada son deuda',
    'rechazada, dada de baja (void) y borrador NO son deuda',
    'una factura borrada no es deuda, y un estado desconocido tampoco',
    'el vencimiento PACTADO en la factura manda sobre el de la CxC (E320000000078)',
    'sin vencimiento pactado se usa el de la CxC (facturas anteriores a la columna)',
    'la CxC sin fecha pactada vence un mes despues del DIA DE RD (emitida a las 21:00 de RD no cuenta desde mañana)',
    '  y el 31 de enero vence el 28 de febrero, no el 3 de marzo',
  ];
  const R = await cargar('src/services/cartera/reglasDeCartera.ts', E1);
  if (R) {
    intenta(E1[0], () => R.facturaEsDeuda('accepted') && R.facturaEsDeuda('submitted') && R.facturaEsDeuda('signed'));
    intenta(E1[1], () => !R.facturaEsDeuda('rejected') && !R.facturaEsDeuda('void') && !R.facturaEsDeuda('draft'));
    intenta(E1[2], () => !R.facturaEsDeuda('accepted', true) && !R.facturaEsDeuda('pendiente') && !R.facturaEsDeuda(null));
    intenta(E1[3], () => R.vencimientoDeCxc('2026-09-25', '2026-10-28') === '2026-09-25');
    intenta(E1[4], () => R.vencimientoDeCxc(null, '2026-09-27') === '2026-09-27' && R.vencimientoDeCxc(null, null) === null);
    intenta(E1[5], () => R.vencimientoPorDefecto(new Date('2026-09-23T00:30:00Z')) === '2026-10-22');
    intenta(E1[6], () => R.vencimientoPorDefecto(new Date('2026-02-01T01:00:00Z')) === '2026-02-28'
      && R.vencimientoPorDefecto(new Date('2026-01-31T15:00:00Z')) === '2026-02-28');
  }

  console.log('\n2) Dias de atraso y tramos, documento a documento\n');
  const E2 = [
    'vence HOY: 0 dias, por vencer, riesgo bajo',
    'vencio AYER: 1 dia, tramo 1-30, riesgo medio',
    'limites exactos: 30 en 1-30, 31 en 31-60, 60/61, 90/91',
    'pago parcial: cuenta el saldo que queda, no el monto',
    'un documento saldado (o de 0,01) no cuenta, ni para el atraso ni para los tramos',
    'un saldo a favor (negativo) NO resta de los tramos',
    'dos clientes con el MISMO nombre no se mezclan: se agrupa por id',
    'el nivel lo marca el documento mas atrasado, pero cada saldo va a SU nivel y SU tramo',
    'la suma de varias entidades cuadra por tramo y por nivel',
  ];
  if (!R) for (const t of E2) ok(t, false, 'no existe reglasDeCartera.ts');
  else {
    const res = (docs: ReturnType<typeof doc>[]) => R.resumirPorEntidad(docs, HOY) as Map<string, AnyRec>;
    intenta(E2[0], () => { const r = res([doc('a', 100, HOY)]).get('a')!; return r.diasAtraso === 0 && r.tramos['por-vencer'] === 100 && r.nivelRiesgo === 'bajo'; });
    intenta(E2[1], () => { const r = res([doc('a', 100, '2026-10-04')]).get('a')!; return r.diasAtraso === 1 && r.tramos['1-30'] === 100 && r.nivelRiesgo === 'medio'; });
    intenta(E2[2], () => {
      const r = res([doc('a', 1, '2026-09-05'), doc('a', 2, '2026-09-04'), doc('a', 4, '2026-08-06'), doc('a', 8, '2026-08-05'),
        doc('a', 16, '2026-07-07'), doc('a', 32, '2026-07-06')]).get('a')!;
      return r.tramos['1-30'] === 1 && r.tramos['31-60'] === 2 + 4 && r.tramos['61-90'] === 8 + 16 && r.tramos['90+'] === 32 && r.diasAtraso === 91;
    });
    intenta(E2[3], () => { const r = res([doc('a', 40.5, '2026-10-20')]).get('a')!; return r.saldo === 40.5 && r.documentosPendientes === 1; });
    intenta(E2[4], () => { const r = res([doc('a', 100, HOY), doc('a', 0, '2026-01-01'), doc('a', 0.01, '2026-01-02')]).get('a')!;
      return r.diasAtraso === 0 && r.documentosPendientes === 1 && r.tramos['90+'] === 0 && !res([doc('b', 0.01, '2026-01-01')]).has('b'); });
    intenta(E2[5], () => { const r = res([doc('a', 100, '2026-09-01'), doc('a', -30, '2026-09-01')]).get('a')!; return r.saldo === 100 && r.tramos['31-60'] === 100; });
    intenta(E2[6], () => { const m = res([doc('id-1', 10, HOY), doc('id-2', 20, HOY)]); return m.size === 2 && m.get('id-1')!.saldo === 10 && m.get('id-2')!.saldo === 20; });
    intenta(E2[7], () => {
      // D` Luis, el 05/10: 067 (10 dias), 068 (8), 078 (10, por la fecha pactada) y dos por vencer.
      const r = res([doc('l', 3631.90, '2026-09-25'), doc('l', 5697.48, '2026-09-27'), doc('l', 1158.02, '2026-09-25'),
        doc('l', 9480.03, '2026-10-14'), doc('l', 4740.01, '2026-10-19')]).get('l')!;
      return r.nivelRiesgo === 'medio' && r.diasAtraso === 10 && r.saldo === 24707.44
        && r.tramos['1-30'] === 10487.4 && r.tramos['por-vencer'] === 14220.04
        && r.saldoPorNivel.medio === 10487.4 && r.saldoPorNivel.bajo === 14220.04;
    });
    intenta(E2[8], () => {
      const lista = [{ tramos: { ...V.tramosEnCero(), '1-30': 5, 'por-vencer': 1 }, saldoPorNivel: { bajo: 1, medio: 5, alto: 0, critico: 0 } },
        { tramos: { ...V.tramosEnCero(), '90+': 7 }, saldoPorNivel: { bajo: 0, medio: 0, alto: 0, critico: 7 } }];
      const t = R.sumarTramos(lista); const n = R.sumarPorNivel(lista);
      return t['1-30'] === 5 && t['90+'] === 7 && t['por-vencer'] === 1 && n.critico === 7 && n.medio === 5;
    });
  }

  console.log('\n3) El dia de RD, a las 21:00\n');
  {
    // El servidor corre en UTC. A las 21:00 de RD del 05/10 son las 01:00 UTC del 06/10.
    process.env.TZ = 'UTC';
    const Real = Date;
    const fijo = Real.parse('2026-10-06T01:00:00Z');
    class Falso extends Real {
      constructor(...a: unknown[]) { if (a.length === 0) super(fijo); else super(...(a as [string])); }
      static now() { return fijo; }
    }
    globalThis.Date = Falso as unknown as DateConstructor;
    try {
      intenta('sin "hoy", lo que vence el 05/10 a las 21:00 de RD aun NO esta vencido', () => V.analizarVencimiento('2026-10-05').atraso === 0 && !V.analizarVencimiento('2026-10-05').vencida);
      intenta('  y lo que vencio el 04/10 lleva 1 dia, no 2', () => V.analizarVencimiento('2026-10-04').atraso === 1);
      intenta('  repartirEnTramos sin "hoy" tambien cuenta en dia de RD', () => V.repartirEnTramos([{ s: 10, v: '2026-10-05' }], (x: AnyRec) => x.s, (x: AnyRec) => x.v)['por-vencer'] === 10);
    } finally {
      globalThis.Date = Real;
    }
  }

  console.log('\n4) El color del atraso\n');
  const E4 = ['de 1 a 15 dias (riesgo medio) es AMBAR, no rojo', 'mas de 15 dias es ROJO', 'sin atraso no es rojo ni ambar'];
  if (!R) for (const t of E4) ok(t, false, 'no existe reglasDeCartera.ts');
  else {
    intenta(E4[0], () => /amber/.test(R.clasesDeAtraso(1)) && /amber/.test(R.clasesDeAtraso(15)) && !/rose|red/.test(R.clasesDeAtraso(10)));
    intenta(E4[1], () => /rose/.test(R.clasesDeAtraso(16)) && /rose/.test(R.clasesDeAtraso(100)));
    intenta(E4[2], () => !/rose|amber|red/.test(R.clasesDeAtraso(0)));
  }

  console.log('\n5) Las mismas reglas en SQL\n');
  const E5 = ['facturaEsDeudaSql: estado en (accepted, submitted, signed) y no borrada', 'vencimientoDeCxcSql: COALESCE(pactado, de la cuenta)'];
  const S = await cargar('src/services/cartera/sqlDeCartera.ts', E5);
  if (S && R) {
    const { PgDialect } = await import('drizzle-orm/pg-core');
    const { sql } = await import('drizzle-orm');
    const d = new PgDialect();
    const q = (x: unknown) => d.sqlToQuery(x as never);
    intenta(E5[0], () => {
      const r = q(S.facturaEsDeudaSql(sql`inv.status`, sql`inv.deleted_at`));
      return /inv\.status IN \(\$1, \$2, \$3\) AND inv\.deleted_at IS NULL/.test(r.sql)
        && JSON.stringify(r.params) === JSON.stringify([...R.ESTADOS_QUE_SON_DEUDA]);
    });
    intenta(E5[1], () => /COALESCE\(inv\.payment_due_date, ar\.due_date\)/.test(q(S.vencimientoDeCxcSql(sql`inv.payment_due_date`, sql`ar.due_date`)).sql));
  }

  // ─────────────────────────────── 6. componentes ───────────────────────────────
  console.log('\n6) Los componentes, dibujados\n');
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const fila = (o: AnyRec): AnyRec => ({
    id: 'c1', nombre: 'D` Luis Puertas', rncCedula: null, telefono: null, correo: null, saldo: 24707.44, cupoCredito: 0,
    diasAtraso: 10, nivelRiesgo: 'medio', ultimoDocumento: null, documentosPendientes: 5, mensual: [],
    tramos: { ...V.tramosEnCero(), 'por-vencer': 14220.04, '1-30': 10487.4 },
    saldoPorNivel: { bajo: 14220.04, medio: 10487.4, alto: 0, critico: 0 }, ...o,
  });
  {
    const { TablaCartera } = await import('../src/components/cartera/TablaCartera');
    const html = renderToStaticMarkup(React.createElement(TablaCartera, {
      filas: [fila({}), fila({ id: 'c2', nombre: 'Otro', diasAtraso: 50, nivelRiesgo: 'critico' })] as never,
      tipo: 'clientes', seleccionado: null, onSeleccionar: () => {}, onVerEstado: () => {},
    }));
    const atrasoDe = (id: string) => html.slice(html.indexOf(`data-fila-cartera="${id}"`)).match(/<div class="([^"]*)"[^>]*>(\d+)(?:<!-- -->)? d\. atraso<\/div>/);
    const a10 = atrasoDe('c1');
    const a50 = atrasoDe('c2');
    ok('tabla: 10 dias de atraso (riesgo medio) en ambar, no en rojo', !!a10 && /amber/.test(a10[1]) && !/rose/.test(a10[1]), a10?.[1]);
    invariante('tabla: 50 dias de atraso (critico) sigue en rojo', !!a50 && /rose/.test(a50[1]), a50?.[1]);
    ok('tabla: la fila dice cuanto de su saldo esta VENCIDO (10.487,40 de 24.707,44)',
      /Vencido: (?:<!-- -->)?RD\$ 10[.,]487[.,]40/.test(html), (html.match(/Vencido:[^<]*/) ?? [''])[0]);
    ok('tabla: el pie ya no dice "el credito es de 30 dias"', !/El crédito es de 30 días/.test(html));
  }
  {
    const { TarjetasResumen } = await import('../src/components/cartera/TarjetasResumen');
    const html = renderToStaticMarkup(React.createElement(TarjetasResumen, {
      filas: [fila({ id: 'x', saldo: 1000, diasAtraso: 50, nivelRiesgo: 'critico', saldoPorNivel: { bajo: 900, medio: 0, alto: 0, critico: 100 } })] as never,
      tipo: 'clientes',
    }));
    const tarjeta = html.slice(html.indexOf('Cartera en Riesgo'));
    ok('"Cartera en riesgo" suma solo lo que lleva mas de 15 dias (100), no el saldo entero del cliente (1.000)',
      /RD\$ 100</.test(tarjeta) && !/RD\$ 1[.,]000</.test(tarjeta.slice(0, 600)));
  }
  {
    const E6 = ['la pantalla enseña el saldo por tramo de antiguedad (por vencer, 1-30, 31-60, 61-90, +90 y total)'];
    const T = await cargar('src/components/cartera/TramosDeAntiguedad.tsx', E6);
    if (T) {
      const html = renderToStaticMarkup(React.createElement(T.TramosDeAntiguedad, {
        tramos: { ...V.tramosEnCero(), 'por-vencer': 1089931.92, '1-30': 10487.4 }, total: 1100419.32,
      }));
      ok(E6[0], ['por-vencer', '1-30', '31-60', '61-90', '90+', 'total'].every((t) => html.includes(`data-tramo="${t}"`))
        && /RD\$ 1[.,]089[.,]931[.,]92/.test(html) && /RD\$ 10[.,]487[.,]40/.test(html) && /RD\$ 1[.,]100[.,]419[.,]32/.test(html));
    }
  }

  // ─────────────────────────────── 7. cableado ───────────────────────────────
  console.log('\n7) Las demas pantallas pasan por las mismas reglas\n');
  const nombra = (src: string, id: string) => new RegExp(`\\b${id}\\b`).test(src);
  const importa = (src: string, id: string, desde: string) =>
    new RegExp(`import \\{[^}]*\\b${id}\\b[^}]*\\} from '${desde.replace(/[/.]/g, (c) => `\\${c}`)}'`).test(src);
  const DEUDA = 'facturaEsDeudaSql(invoices.status, invoices.deletedAt)';
  const VENCE = 'vencimientoDeCxcSql(invoices.paymentDueDate, accountsReceivable.dueDate)';

  const repo = leer('src/repositories/carteraRepository.ts');
  const cli = bloque(repo, 'private static async resumenClientes(');
  const sup = bloque(repo, 'private static async resumenSuplidores(');
  const det = bloque(repo, 'static async detalle(');
  const par = bloque(repo, 'private static async partidasCliente(');
  ok('cartera (clientes): solo facturas que son deuda, con el vencimiento pactado',
    importa(repo, 'facturaEsDeudaSql', '@/services/cartera/sqlDeCartera') && cli.split(DEUDA).length - 1 === 2 && cli.includes(`vence: ${VENCE}`));
  ok('cartera: el resumen lo hace resumirPorEntidad con el dia de RD (ni CURRENT_DATE ni hoyDia)',
    importa(repo, 'resumirPorEntidad', '@/services/cartera/reglasDeCartera') && /resumirPorEntidad\(/.test(repo)
    && cli.includes('const hoy = diaRD();') && sup.includes('const hoy = diaRD();')
    && !/CURRENT_DATE/.test(repo) && !nombra(repo, 'hoyDia'));
  ok('cartera (suplidores): la CxP de una compra borrada no es deuda',
    /\(\$\{expenses\.id\} IS NULL OR \$\{expenses\.deletedAt\} IS NULL\)/.test(sup));
  ok('estado de cuenta (detalle y por NCF): las mismas facturas y el mismo vencimiento',
    det.includes(DEUDA) && det.includes(`vence: ${VENCE}`) && par.includes(DEUDA) && par.includes('vencimientoDeCxc(c.vencePactado, c.venceCuenta)'));

  const ar = leer('src/repositories/arRepository.ts');
  const pend = bloque(ar, 'static async getPendingAR(');
  ok('Cuentas por Cobrar (getPendingAR): sin rechazadas ni dadas de baja, con el vencimiento pactado',
    importa(ar, 'facturaEsDeudaSql', '@/services/cartera/sqlDeCartera') && pend.includes(DEUDA) && pend.includes(`dueDate: ${VENCE}`));

  const rep = leer('src/app/api/v1/reports/receivables/route.ts');
  ok('Reporte de CxC (la ruta): las mismas facturas y el mismo vencimiento', rep.includes(DEUDA) && rep.includes(`dueDate: ${VENCE}`));
  const repPag = leer('src/app/dashboard/receivables-report/page.tsx');
  ok('Reporte de CxC (la pantalla): "Vencida" con estaVencida y el dia de RD, no con new Date()',
    importa(repPag, 'estaVencida', '@/services/cartera/listaDeClientes') && (repPag.match(/estaVencida\(/g) ?? []).length === 2
    && repPag.includes('useState(() => diaRD())') && !/new Date\([^)]*dueDate\)\s*</.test(repPag));

  const acc = leer('src/actions/receivables.ts');
  ok('tablero de CxC (acciones): mismas facturas, vencimiento pactado y dia de RD',
    acc.includes(DEUDA) && acc.includes(`dueDate: ${VENCE}`) && acc.includes('const hoy = diaRD();') && !nombra(acc, 'hoyDia'));
  const pay = leer('src/actions/payables.ts');
  ok('tablero de CxP (acciones): dia de RD y sin CxP de compras borradas',
    pay.includes('const hoy = diaRD();') && !nombra(pay, 'hoyDia') && /\(\$\{expenses\.id\} IS NULL OR \$\{expenses\.deletedAt\} IS NULL\)/.test(pay));

  const fin = leer('src/repositories/financialRepository.ts');
  ok('estados de cuenta y panel financiero: dia de RD, facturas que son deuda y vencimiento pactado',
    (fin.match(/const today = diaRD\(\);/g) ?? []).length === 3 && !/toISOString\(\)\.split\('T'\)\[0\]/.test(fin)
    && fin.split(DEUDA).length - 1 >= 2 && fin.includes('facturaEsDeudaSql(sql`inv.status`, sql`inv.deleted_at`)')
    && !/ar\.due_date < \$\{today\}/.test(fin));

  const vto = leer('src/services/cartera/vencimiento.ts');
  ok('vencimiento.ts: el dia por defecto es diaRD, no hoyDia', /opciones\.hoy \?\? diaRD\(\)/.test(vto) && !nombra(vto, 'hoyDia'));

  const booker = leer('src/services/invoice/invoiceDbBooker.ts');
  ok('al emitir, la CxC nace con el vencimiento PACTADO (y sin setMonth sobre el reloj UTC)',
    /const dueDate: string = data\.paymentDueDate \|\| vencimientoPorDefecto\(new Date\(\)\);/.test(booker)
    && !/dueDate\.setMonth\(/.test(booker));

  const pag = leer('src/app/dashboard/antiguedad-saldos/page.tsx');
  ok('la pantalla: Balance Operativo por DOCUMENTO (sumarPorNivel) y los tramos de antiguedad',
    pag.includes('const saldoDe = (n: NivelRiesgo) => porNivel[n];') && pag.includes('const porNivel = useMemo(() => sumarPorNivel(filas), [filas]);')
    && pag.includes('<TramosDeAntiguedad tramos={tramos} total={saldoTotal} />'));
  const modal = leer('src/components/cartera/ModalEstadoCuenta.tsx');
  ok('estado de cuenta: el saldo pendiente no va en rojo y el atraso lleva el color de su nivel',
    !/bg-rose-50\/70 border border-rose-200\/80">\s*<span className="text-\[11px\] text-rose-700 font-medium block">Saldo pendiente/.test(modal)
    && /clasesDeAtraso\(d\.diasAtraso\)/.test(modal));
  const tipos = leer('src/components/cartera/tipos.ts');
  ok('el aviso ya no dice "el credito es de 30 dias": dice que manda la fecha pactada', !tipos.includes('El crédito es de ') && tipos.includes('la pactada en la factura'));

  console.log(`\n${fallos === 0 && rotas === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S), ${rotas} invariante(s) rota(s)`}`);
  process.exit(rotas > 0 ? 3 : fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
