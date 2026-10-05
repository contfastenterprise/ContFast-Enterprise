/**
 * Lote 295 -- PAGAR una nomina aprobada (el "lote D" de
 * `docs/diseno_asientos_nomina.md`). Banco de CODIGO: ejecuta la regla pura
 * (`services/nomina/pagoDeNomina.ts`), mira el cableado del servicio y la ruta,
 * y DIBUJA `PagarNomina` y `PagoDeLaNomina`. Lo que pasa contra una base (la
 * transaccion, el banco, la caja, los 409) lo ejecuta
 * `verificar_nomina_pago_db.ts`.
 *
 * QUE SE VIGILA
 * -------------
 *  1. La peticion: metodo, banco si y solo si sale del banco (regla del lote
 *     163), fecha real y no futura, referencia fuera del efectivo (lote 172).
 *  2. Que nomina se paga: solo aprobada, no pagada, con asiento de devengo.
 *  3. El neto en centavos, y que el devengo deje ese neto en Sueldos por pagar.
 *  4. El asiento: debe Sueldos por pagar, haber banco o caja, por el neto.
 *  5. Descripcion y referencia del retiro.
 *  6. La migracion 0021: tabla nueva, un pago por nomina, nada en `payrolls`, y
 *     la tabla fuera del esquema de Drizzle.
 *  7. El cableado: las piezas de compras y pagos (170, 163, 169), la nomina
 *     bloqueada, todo lo que niega ANTES de escribir, la ruta con su permiso.
 *  8. La pantalla, dibujada.
 *
 * Los modulos del lote se cargan con `import()` perezoso: en la contraprueba no
 * existen, y cada comprobacion da FALLA por etiqueta en vez de reventar.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
/** El import anclado en el especificador completo, con sus comillas. */
const importa = (f: string, id: string, desde: string) =>
  new RegExp(`import\\s*\\{[^}]*\\b${id}\\b[^}]*\\}\\s*from\\s*'${desde.replace(/[/.]/g, (c) => `\\${c}`)}'`).test(f);
/** Uso como llamada (no solo el nombre en el import). */
const llama = (f: string, id: string) => new RegExp(`\\b${id}\\s*\\(`).test(f);

let fallos = 0;
let total = 0;
const ok = (t: string, c: boolean, d = '') => { total++; console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
async function seccion(etiquetas: string[], f: () => Promise<void> | void) {
  try { await f(); } catch (e) { for (const t of etiquetas) ok(t, false, `lanzo: ${(e as Error).message}`); }
}

const HOY = '2026-10-05';

async function main() {
  type Modulo = typeof import('../src/services/nomina/pagoDeNomina');
  let M: Modulo | null = null;
  try { M = await import('../src/services/nomina/pagoDeNomina'); } catch { M = null; }
  const m = () => { if (!M) throw new Error('no existe services/nomina/pagoDeNomina'); return M; };

  // ─── 1. La peticion ────────────────────────────────────────────────────
  console.log('\n1. La peticion de pago');
  const E1 = [
    'un metodo desconocido se niega',
    'transferencia o cheque SIN banco se niega (regla del lote 163)',
    'efectivo CON banco se niega (contradictorio)',
    'fecha que no existe (30/02) o mal escrita se niega',
    'fecha futura se niega; la de hoy pasa',
    'transferencia sin referencia se niega, y el cheque pide su NUMERO',
    'efectivo sin referencia pasa; transferencia completa pasa con la referencia recortada',
  ];
  await seccion(E1, () => {
    const v = m().validarPeticionDePago;
    const motivo = (p: Record<string, unknown>) => { const r = v(p as never, HOY); return r.ok ? null : r.motivo; };
    ok(E1[0], !!motivo({ metodo: 'tarjeta', fecha: HOY }) && !!motivo({ fecha: HOY }));
    ok(E1[1], /cuenta bancaria/.test(motivo({ metodo: 'transfer', fecha: HOY, referencia: 'T1' }) ?? '') && !!motivo({ metodo: 'check', fecha: HOY, referencia: '9' }));
    ok(E1[2], /caja/.test(motivo({ metodo: 'cash', bankAccountId: 'b1', fecha: HOY }) ?? ''));
    ok(E1[3], !!motivo({ metodo: 'cash', fecha: '2026-02-30' }) && !!motivo({ metodo: 'cash', fecha: '05/10/2026' }) && !!motivo({ metodo: 'cash', fecha: '' }));
    ok(E1[4], /futura/.test(motivo({ metodo: 'cash', fecha: '2026-10-06' }) ?? '') && motivo({ metodo: 'cash', fecha: HOY }) === null);
    const sinRef = motivo({ metodo: 'transfer', bankAccountId: 'b1', fecha: HOY, referencia: '   ' });
    const cheque = motivo({ metodo: 'check', bankAccountId: 'b1', fecha: HOY });
    ok(E1[5], /referencia/.test(sinRef ?? '') && /número del cheque/.test(cheque ?? ''), `${sinRef} | ${cheque}`);
    const caja = v({ metodo: 'cash', fecha: HOY } as never, HOY);
    const tr = v({ metodo: 'transfer', bankAccountId: 'b1', fecha: ` ${HOY}`, referencia: '  TR-77 ' } as never, HOY);
    ok(E1[6], caja.ok && caja.pago.bankAccountId === null && caja.pago.referencia === null
      && tr.ok && tr.pago.bankAccountId === 'b1' && tr.pago.referencia === 'TR-77' && tr.pago.fecha === HOY && tr.pago.metodo === 'transfer',
      JSON.stringify([caja, tr]));
  });

  // ─── 2. Que nomina se paga ─────────────────────────────────────────────
  console.log('\n2. Que nomina se paga');
  const E2 = [
    'una pagada se niega: no se paga dos veces',
    'una calculada, borrador o cancelada se niega: solo aprobadas',
    'una aprobada SIN asiento de devengo se niega, y dice que la asienta el contador',
    'una aprobada con su devengo se paga',
    'la pantalla solo ofrece pagar una aprobada con neto',
  ];
  await seccion(E2, () => {
    const p = m().motivoParaNoPagar;
    ok(E2[0], /ya está pagada/.test(p('paid', true) ?? ''));
    ok(E2[1], ['calculated', 'draft', 'cancelled'].every((s) => /solo se pagan nóminas aprobadas/.test(p(s, true) ?? '')));
    ok(E2[2], /devengo/.test(p('approved', false) ?? '') && /contador/.test(p('approved', false) ?? ''));
    ok(E2[3], p('approved', true) === null);
    const s = m().sePuedePagar;
    ok(E2[4], s('approved', 940900) && !s('approved', 0) && !s('calculated', 940900) && !s('paid', 940900));
  });

  // ─── 3. El neto ───────────────────────────────────────────────────────
  console.log('\n3. El neto y el devengo');
  const E3 = [
    'el neto se suma en centavos: 0,10 + 0,20 son 30 centavos exactos, y la nomina medida 9.409,00',
    'el devengo que deja -9.409 en Sueldos por pagar cuadra con un neto de 9.409',
    'si deja otra cosa (o de signo contrario), se niega con las dos cifras',
  ];
  await seccion(E3, () => {
    ok(E3[0], m().netoEnCentavos([{ netSalary: '0.10' }, { netSalary: '0.20' }]) === 30 && m().netoEnCentavos([{ netSalary: '9409.00' }]) === 940900);
    ok(E3[1], m().motivoDevengoNoCuadra(-9409, 940900) === null);
    const malo = m().motivoDevengoNoCuadra(-9000, 940900) ?? '';
    ok(E3[2], /9409\.00/.test(malo) && /9000\.00/.test(malo) && !!m().motivoDevengoNoCuadra(9409, 940900), malo);
  });

  // ─── 4. El asiento ────────────────────────────────────────────────────
  console.log('\n4. El asiento del pago');
  const E4 = [
    'debe Sueldos por pagar 9.409 / haber el banco 9.409, y nada mas',
    'sin neto, se niega',
    'si Sueldos por pagar y el origen son la misma cuenta, se niega',
  ];
  await seccion(E4, () => {
    const r = m().lineasDelPago(940900, 'c-sueldos-pagar', 'c-banco');
    ok(E4[0], r.ok && r.total === 9409 && r.lineas.length === 2
      && r.lineas[0].accountId === 'c-sueldos-pagar' && r.lineas[0].debit === 9409 && r.lineas[0].credit === 0
      && r.lineas[1].accountId === 'c-banco' && r.lineas[1].debit === 0 && r.lineas[1].credit === 9409, JSON.stringify(r));
    ok(E4[1], !m().lineasDelPago(0, 'a', 'b').ok && !m().lineasDelPago(Number.NaN, 'a', 'b').ok);
    ok(E4[2], !m().lineasDelPago(100, 'a', 'a').ok);
  });

  // ─── 5. Textos ────────────────────────────────────────────────────────
  console.log('\n5. Descripcion y referencia del retiro');
  const E5 = [
    'la descripcion dice el periodo y el origen: "Pago de nómina quincenal 15-30/07/2026 · Transferencia TR-1"',
    'en efectivo: "... · Efectivo"',
    'el retiro lleva la referencia de la transferencia, o "CHQ n" del cheque',
    'el motivo del periodo cerrado dice la fecha del pago',
  ];
  await seccion(E5, () => {
    ok(E5[0], m().descripcionDelPago('2026-07-15', '2026-07-30', 'quincenal', 'transfer', 'TR-1') === 'Pago de nómina quincenal 15-30/07/2026 · Transferencia TR-1');
    ok(E5[1], m().descripcionDelPago('2026-10-01', '2026-10-31', 'mensual', 'cash', null) === 'Pago de nómina mensual 01-31/10/2026 · Efectivo');
    ok(E5[2], m().referenciaDelRetiro('transfer', 'TR-1', 'x') === 'TR-1' && m().referenciaDelRetiro('check', '000123', 'x') === 'CHQ 000123');
    ok(E5[3], /05-10-2026/.test(m().motivoPeriodoDelPago('2026-10-05')));
  });

  // ─── 6. La migracion ──────────────────────────────────────────────────
  console.log('\n6. La migracion 0021');
  const E6 = [
    'drizzle/0021_pagos_de_nomina.sql crea la tabla pagos_de_nomina',
    'un pago por nomina (payroll_id unico), y banco si y solo si no es efectivo',
    'la migracion NO toca payrolls (ni ALTER TABLE)',
    'la tabla NO esta en el esquema de Drizzle, y el motivo del 409 nombra la migracion',
  ];
  await seccion(E6, () => {
    const mig = leer('drizzle/0021_pagos_de_nomina.sql');
    const sqlMig = mig.replace(/--.*$/gm, '');
    ok(E6[0], /CREATE TABLE IF NOT EXISTS "pagos_de_nomina"/.test(sqlMig));
    ok(E6[1], /UNIQUE \("payroll_id"\)/.test(sqlMig) && /\("metodo" = 'cash'\) = \("bank_account_id" IS NULL\)/.test(sqlMig));
    ok(E6[2], mig !== '' && !/ALTER TABLE/i.test(sqlMig));
    const esquema = readdirSync(join(raiz, 'src/db/schema')).map((f) => leer(`src/db/schema/${f}`)).join('\n');
    ok(E6[3], !/pagos_de_nomina/.test(esquema) && /drizzle\/0021_pagos_de_nomina\.sql/.test(m().MOTIVO_SIN_TABLA_DE_PAGOS));
  });

  // ─── 7. El cableado ───────────────────────────────────────────────────
  console.log('\n7. El cableado');
  const E7 = [
    'el banco se valida con resolverOrigenDeCompra (lote 170): importado y llamado',
    'el retiro va al libro de banco con reflejarEnBancoDeCompra, por lo que cambio el mayor (efectoEnCuentaDeDocumento)',
    'la caja: sesionParaEfectivo ANTES de escribir, y reflejarEnCaja con efectoEnCajaDeDocumento',
    'el asiento por createJournalEntry, con la fecha del pago y la referencia del pago',
    'la nomina bloqueada (for update) y acotada a la empresa y el modo, y la tabla mirada antes (hayTablaDePagos)',
    'todo lo que niega va ANTES de la primera escritura (el INSERT del pago)',
    'la nomina queda paid, y la auditoria registra fecha, metodo y autor',
    'la ruta POST /hr/payroll/[id]/pay pide nomina:write, valida con la regla y llama a pagarNomina',
    'la ruta no esta en PENDIENTES de permisosRutas',
  ];
  await seccion(E7, () => {
    const f = sinComentarios(leer('src/services/nomina/pagarNomina.ts'));
    ok(E7[0], importa(f, 'resolverOrigenDeCompra', '@/services/cxp/resolverOrigenDeCompra') && llama(f, 'resolverOrigenDeCompra'));
    ok(E7[1], importa(f, 'reflejarEnBancoDeCompra', '@/services/cxp/bancoDeLaCompra') && llama(f, 'reflejarEnBancoDeCompra')
      && /cambioEnCuenta:\s*await efectoEnCuentaDeDocumento\(tx, companyId, modo, pagoId, cuentaOrigen\)/.test(f));
    const iSesion = f.search(/sesionParaEfectivo\(/);
    const iInsert = f.indexOf('INSERT INTO pagos_de_nomina');
    ok(E7[2], importa(f, 'sesionParaEfectivo', '@/services/caja/efectivoDeCaja') && iSesion > 0 && iInsert > 0 && iSesion < iInsert
      && /cambioEnCaja:\s*await efectoEnCajaDeDocumento\(tx, companyId, modo, pagoId\)/.test(f));
    const je = /createJournalEntry\(tx, \{[\s\S]*?\}\);/.exec(f)?.[0] ?? '';
    ok(E7[3], /reference:\s*pagoId/.test(je) && /date:\s*pago\.fecha/.test(je) && /createdBy:\s*userId/.test(je) && /lines:\s*asiento\.lineas/.test(je), je.slice(0, 120));
    const iFor = f.indexOf(".for('update')");
    const iTabla = f.search(/hayTablaDePagos\(tx\)/);
    const bloqueo = /\.from\(payrolls\)[\s\S]*?\.for\('update'\)/.exec(f)?.[0] ?? '';
    ok(E7[4], iFor > 0 && iTabla > 0 && iTabla < iFor && iFor < iInsert
      && /eq\(payrolls\.id, payrollId\), eq\(payrolls\.companyId, companyId\), eq\(payrolls\.modo, modo\)/.test(bloqueo), bloqueo.slice(0, 160));
    const lanzaDespues = f.slice(iInsert).match(/throw new NominaNoPermitidaError/g)?.length ?? 0;
    const lanzaAntes = f.slice(0, iInsert).match(/throw new NominaNoPermitidaError/g)?.length ?? 0;
    ok(E7[5], iInsert > 0 && lanzaDespues === 0 && lanzaAntes >= 7 && f.slice(0, iInsert).includes('isPeriodOpen(companyId, pago.fecha, modo, tx)'), `antes ${lanzaAntes}, despues ${lanzaDespues}`);
    ok(E7[6], /\.set\(\{\s*status:\s*'paid'/.test(f) && /action:\s*'pay_payroll'/.test(f) && /fecha:\s*pago\.fecha/.test(f) && /metodo:\s*pago\.metodo/.test(f) && /userId,/.test(f));
    const r = sinComentarios(leer('src/app/api/v1/hr/payroll/[id]/pay/route.ts'));
    const post = /export async function POST[\s\S]*?\n\}/.exec(r)?.[0] ?? '';
    ok(E7[7], /requirePermission\(session, 'nomina', 'write'\)/.test(post) && /validarPeticionDePago\(/.test(post) && /pagarNomina\(/.test(post)
      && importa(r, 'pagarNomina', '@/services/nomina/pagarNomina'));
    const permisos = leer('src/tests/permisosRutas.vitest.ts');
    const pendientes = /const PENDIENTES[\s\S]*?\]/.exec(permisos)?.[0] ?? '';
    ok(E7[8], post !== '' && !/payroll\/\[id\]\/pay/.test(pendientes));
  });

  // ─── 8. La pantalla, dibujada ─────────────────────────────────────────
  console.log('\n8. La pantalla');
  const E8 = [
    'aprobada: el boton "Pagar nómina" (type=button); calculada o pagada: nada',
    'transferencia: elige banco (con sus cuentas), fecha y referencia; cada etiqueta con su campo',
    'efectivo: sin banco ni referencia, y dice que sale de la sesión de caja abierta',
    'la confirmacion dice el neto, y un 409 se enseña dentro de la ventana (role=alert)',
    'el pago dibujado: fecha, banco y referencia, importe, autor y su asiento',
    'el boton pide los bancos al abrir (no en un efecto), lee con leerRespuesta y guarda el doble clic con useRef',
  ];
  await seccion(E8, async () => {
    const comp = await import('../src/app/dashboard/hr/payroll/components/PagarNomina');
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const pinta = (c: unknown, p: object) => renderToStaticMarkup(React.createElement(c as never, p));
    const boton = pinta(comp.PagarNomina, { payrollId: 'p1', neto: 9409, status: 'approved', alPagar: () => {} });
    ok(E8[0], /<button[^>]*type="button"[^>]*>[\s\S]*Pagar nómina<\/button>/.test(boton)
      && pinta(comp.PagarNomina, { payrollId: 'p1', neto: 9409, status: 'calculated', alPagar: () => {} }) === ''
      && pinta(comp.PagarNomina, { payrollId: 'p1', neto: 9409, status: 'paid', alPagar: () => {} }) === '', boton.slice(0, 200));

    const base = { bancos: [{ id: 'b1', bankName: 'Popular', accountNumber: '111' }, { id: 'b2', bankName: 'Reservas', accountNumber: '222' }], errorBancos: null, neto: 9409, cambiar: () => {} };
    const tr = pinta(comp.FormularioDePagoDeNomina, { ...base, motivo: null, datos: { metodo: 'transfer', bankAccountId: 'b1', fecha: HOY, referencia: 'TR-1' } });
    const fors = [...tr.matchAll(/for="([^"]+)"/g)].map((x) => x[1]);
    const sinCampo = fors.filter((id) => !new RegExp(`id="${id}"`).test(tr));
    ok(E8[1], /id="pago-banco"/.test(tr) && /Popular 111/.test(tr) && /Reservas 222/.test(tr) && /id="pago-fecha"/.test(tr) && /id="pago-referencia"/.test(tr)
      && fors.length >= 6 && sinCampo.length === 0, `sin campo: ${sinCampo.join(',')}`);
    const caja = pinta(comp.FormularioDePagoDeNomina, { ...base, motivo: null, datos: { metodo: 'cash', bankAccountId: '', fecha: HOY, referencia: '' } });
    ok(E8[2], !/id="pago-banco"/.test(caja) && !/id="pago-referencia"/.test(caja) && /sesión de caja abierta/.test(caja));
    const conMotivo = pinta(comp.FormularioDePagoDeNomina, { ...base, motivo: 'No hay una caja abierta', datos: { metodo: 'cash', bankAccountId: '', fecha: HOY, referencia: '' } });
    ok(E8[3], /9,409\.00|9\.409,00/.test(tr) && /role="alert"[^>]*>No hay una caja abierta/.test(conMotivo) && !/role="alert"/.test(tr));

    const vista = await import('../src/app/dashboard/hr/payroll/components/PagoDeLaNomina');
    const pago = pinta(vista.PagoDeLaNomina, { status: 'paid', pago: {
      id: 'x', fecha: '2026-10-05', metodo: 'transfer', referencia: 'TR-1', monto: 9409, banco: 'Popular 111', autor: 'Ana Alfa',
      asiento: { id: 'a', fecha: '2026-10-05', descripcion: 'Pago de nómina', total: 9409, lineas: [
        { codigo: '2.1.01.04', cuenta: 'Sueldos por Pagar', debe: 9409, haber: 0 }, { codigo: '1.1.01.02', cuenta: 'Banco', debe: 0, haber: 9409 }] },
    } });
    ok(E8[4], /Pagada el 05-10-2026/.test(pago) && /Popular 111/.test(pago) && /TR-1/.test(pago) && /Ana Alfa/.test(pago) && /Sueldos por Pagar/.test(pago) && /9,409\.00|9\.409,00/.test(pago));

    const fuente = sinComentarios(leer('src/app/dashboard/hr/payroll/components/PagarNomina.tsx'));
    const abrir = /const abrir = async \(\) => \{[\s\S]*?\n  \};/.exec(fuente)?.[0] ?? '';
    ok(E8[5], /fetch\('\/api\/v1\/bank\/accounts'\)/.test(abrir) && !/useEffect/.test(fuente)
      && importa(fuente, 'leerRespuesta', '@/utils/leerRespuesta') && (fuente.match(/leerRespuesta</g)?.length ?? 0) + (fuente.match(/leerRespuesta\(/g)?.length ?? 0) >= 2
      && /if \(enVuelo\.current\) return;/.test(/const pagar = async[\s\S]*?\n  \};/.exec(fuente)?.[0] ?? '') && /useRef\(false\)/.test(fuente));
  });

  console.log(`\n${total - fallos} OK, ${fallos} FALLA de ${total}`);
  console.log(fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLA(S)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
