/**
 * Lote 295 (la conexion) -- el pago de la nomina, enchufado en la pagina partida del lote 294.
 *
 * El lote 295 hizo `PagarNomina` y `PagoDeLaNomina` sin tocar la pagina, porque el 294 la estaba
 * partiendo a la vez. Este banco vigila lo que el principal anadio al juntar las dos ramas:
 *  - el boton sale en las acciones de una nomina APROBADA, con el neto del detalle (suma de
 *    `netSalary`, por `netoEnCentavos`), y no en una calculada ni mientras carga el detalle;
 *  - el detalle de una nomina pagada pinta su pago;
 *  - el hook pide el pago (`GET .../pay`) solo de una pagada, lo limpia al cambiar de nomina, y
 *    tras pagar recarga la lista y relee el detalle (lo mismo que tras aprobar, lote 293).
 *
 * Se DIBUJAN las piezas con react-dom/server y se lee el hook.
 *
 * Se ejecuta con: npx tsx scratch/verificar_nomina_pago_conectado.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const raiz = resolve(__dirname, '..');
const leer = (r: string) => readFileSync(resolve(raiz, r), 'utf8');
let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const intenta = (t: string, f: () => boolean) => { try { ok(t, f()); } catch (e) { ok(t, false, `lanzo: ${(e as Error).message.slice(0, 120)}`); } };
type AnyRec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const NOMINA = { id: 'n1', periodStart: '2026-10-01', periodEnd: '2026-10-15', paymentDate: '2026-10-15', frequency: 'quincenal', createdAt: '2026-10-01' };
const DETALLE = [
  { id: 'd1', employeeId: 'e1', firstName: 'Ana', lastName: 'Pérez', employeeCode: 'E1', baseSalary: '10000', overtimeAmount: '0', bonusAmount: '0', commissionAmount: '0', afpEmployee: '287', sfsEmployee: '304', isrAmount: '0', otherDeductions: '0', netSalary: '9409.00', grossSalary: '10000' },
  { id: 'd2', employeeId: 'e2', firstName: 'Luis', lastName: 'Gómez', employeeCode: 'E2', baseSalary: '5000', overtimeAmount: '0', bonusAmount: '0', commissionAmount: '0', afpEmployee: '0', sfsEmployee: '0', isrAmount: '0', otherDeductions: '0', netSalary: '4500.50', grossSalary: '5000' },
];
const PAGO = { id: 'p1', fecha: '2026-10-16', metodo: 'transfer', referencia: 'TR-1', monto: 13909.5, banco: 'Banreservas', autor: 'Admin', asiento: null };

function estado(status: string, extra: AnyRec = {}): AnyRec {
  return {
    selectedPayroll: { ...NOMINA, status }, payrollDetailsList: DETALLE, loadingDetails: false, avisoIsr: null,
    asiento: null, motivoRechazo: null, pago: null, handleRecalculate: () => {}, handleApprove: () => {}, alPagar: () => {},
    ...extra,
  };
}

async function main() {
  let Acciones: AnyRec | null = null, Detalle: AnyRec | null = null;
  try {
    Acciones = (await import('../src/app/dashboard/hr/payroll/components/AccionesDeLaNomina')).AccionesDeLaNomina;
    Detalle = (await import('../src/app/dashboard/hr/payroll/components/DetalleDeLaNomina')).DetalleDeLaNomina;
  } catch (e) { console.log(`  (no cargan las piezas: ${(e as Error).message.slice(0, 120)})`); }
  const dibuja = (C: AnyRec | null, h: AnyRec) => { if (!C) throw new Error('pieza ausente'); return renderToStaticMarkup(React.createElement(C as never, { h } as never)).replace(/<!-- -->/g, ''); };

  console.log('\n1) El boton de pagar, en las acciones de la nomina\n');
  //  Las negaciones van ATADAS a la marca positiva (seccion 3 del documento): antes de la conexion
  //  el boton no salia en ningun caso, y "no sale en una calculada" seria cierto de balde.
  let ofrece = false;
  try { ofrece = /Pagar nómina/.test(dibuja(Acciones, estado('approved'))); } catch { /* se informa abajo */ }
  ok('una nomina APROBADA ofrece "Pagar nómina"', ofrece);
  intenta('  una calculada no (todavia no tiene asiento de devengo)', () => { const x = dibuja(Acciones, estado('calculated')); return ofrece && /Aprobar Nómina/.test(x) && !/Pagar nómina/.test(x); });
  intenta('  una pagada no (no se paga dos veces)', () => ofrece && !/Pagar nómina/.test(dibuja(Acciones, estado('paid'))));
  intenta('  mientras carga el detalle no (el neto aun no se conoce)', () => ofrece && !/Pagar nómina/.test(dibuja(Acciones, estado('approved', { loadingDetails: true }))));
  intenta('  sin detalle (neto 0) no', () => ofrece && !/Pagar nómina/.test(dibuja(Acciones, estado('approved', { payrollDetailsList: [] }))));

  console.log('\n2) El pago, en el detalle de una nomina pagada\n');
  intenta('una pagada con su pago lo enseña ("Pagada el 16-10-2026")', () => /Pagada el 16-10-2026/.test(dibuja(Detalle, estado('paid', { pago: PAGO }))));
  intenta('  una pagada cuyo pago no consta lo dice, no lo inventa', () => /su pago no se registró desde aquí/.test(dibuja(Detalle, estado('paid'))));

  console.log('\n3) El hook\n');
  const hook = leer('src/app/dashboard/hr/payroll/hooks/useNominas.ts');
  const seleccion = hook.slice(hook.indexOf('const handleSelectPayroll'), hook.indexOf('const handleCreatePayroll'));
  ok('al abrir una nomina se limpia el pago de la anterior', /setPago\(null\)/.test(seleccion));
  ok('  y el pago se pide SOLO de una pagada, por su ruta', /if \(estado === 'paid'\)\s*\{[\s\S]*?\/api\/v1\/hr\/payroll\/\$\{payroll\.id\}\/pay[\s\S]*?setPago\(/.test(seleccion));
  const alPagar = hook.slice(hook.indexOf('const alPagar'), hook.indexOf('return {', hook.indexOf('const alPagar')));
  ok('tras pagar: recarga la lista Y relee el detalle (como tras aprobar)', /fetchPayrolls\(\)/.test(alPagar) && /handleSelectPayroll\(selectedPayroll\)/.test(alPagar));
  ok('  y el hook entrega `pago` y `alPagar` a las piezas', /^\s*return \{[^\n]*\bpago\b[^\n]*\balPagar\b/m.test(hook));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
