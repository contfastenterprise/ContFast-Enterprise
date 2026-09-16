/**
 * El 607 dice que factura corrige cada nota, en que dia de RD se emitio cada
 * comprobante y que documento se declaro.
 *
 * EL FALLO (lote 147), medido el 2026-09-16
 * -----------------------------------------
 *   - Campo 4, NCF modificado, vacio siempre: E340000000003 salia sin decir que
 *     corrige E310000000020.
 *   - Campo 6 en UTC: RD es UTC-4, y lo emitido de 20:00 a medianoche tomaba la
 *     fecha del dia siguiente. 9 comprobantes de PRODUCCION; un ultimo de mes
 *     caeria en el mes siguiente.
 *   - Campos 1 y 2 del CLIENTE, no del comprobante; y sin documento, tipo '3'
 *     (pasaporte).
 */
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const exige = (t: string, c: boolean, d = '') => {
  if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`);
  console.log(`  pre   ${t}`);
};

const base = (o: Record<string, unknown>) => ({
  ncf: 'E310000000020', ecfType: '31', subtotal: '25680.00', discount: '0.00', totalTaxes: '4622.40', total: '30302.40',
  totalNet: '30302.40', paymentType: 'credit', createdAt: new Date('2026-09-02T14:00:00Z'), customerRnc: '131204619',
  retenciones: [], ...o,
});

async function main() {
  const f = await import('../src/services/dgii/formato607');
  exige('el modulo del 607 arma lineas', typeof f.lineaDetalle607 === 'function');
  exige('las lineas siguen teniendo 23 campos', f.lineaDetalle607(base({}) as never).split('|').length === 23);
  const g = f as Record<string, unknown>;
  const campo = (o: Record<string, unknown>, k: number) => f.lineaDetalle607(base(o) as never).split('|')[k - 1];

  console.log('\n1) Campo 4: el NCF que corrige la nota\n');
  ok('E340000000003 dice que corrige E310000000020',
    campo({ ncf: 'E340000000003', ecfType: '34', modifiedNcf: 'E310000000020' }, 4) === 'E310000000020',
    campo({ ncf: 'E340000000003', ecfType: '34', modifiedNcf: 'E310000000020' }, 4));
  exige('una factura normal lo deja vacio', campo({}, 4) === '');

  console.log('\n2) Campo 6: la fecha de RD\n');
  ok('emitido a las 21:30 de RD del 31/08 (01:30 UTC del 01/09): 20260831',
    campo({ createdAt: new Date('2026-09-01T01:30:00Z') }, 6) === '20260831', campo({ createdAt: new Date('2026-09-01T01:30:00Z') }, 6));
  //  Valia tambien antes (a las 04:00 UTC coinciden): precondicion del borde.
  exige('medianoche exacta de RD (04:00 UTC): ya es el dia nuevo',
    campo({ createdAt: new Date('2026-09-01T04:00:00Z') }, 6) === '20260901');
  exige('a mediodia no cambia nada', campo({}, 6) === '20260902');
  ok('la fecha de retencion por defecto sigue a la del comprobante',
    campo({ createdAt: new Date('2026-09-01T01:30:00Z'), retenciones: [{ retentionType: 'ISR', retentionAmount: '10', retentionDate: null }] }, 7) === '20260831');
  ok('funcion expuesta', typeof g.fechaRD607 === 'function');

  console.log('\n3) Campos 1 y 2: el documento declarado\n');
  ok('manda el RNC del comprobante sobre el del cliente',
    campo({ buyerRnc: '001-1234567-8', customerRnc: '131204619' }, 1) === '00112345678'
    && campo({ buyerRnc: '001-1234567-8', customerRnc: '131204619' }, 2) === '2');
  exige('sin RNC en el comprobante, el del cliente', campo({ buyerRnc: null }, 1) === '131204619' && campo({ buyerRnc: null }, 2) === '1');
  ok('sin ningun documento: identificacion y tipo vacios, no "pasaporte"',
    campo({ buyerRnc: null, customerRnc: null }, 1) === '' && campo({ buyerRnc: null, customerRnc: null }, 2) === '');
  //  Valia tambien antes (todo lo que no era 9 u 11 era '3'): precondicion.
  exige('un documento que no es RNC ni cedula: tipo 3', campo({ buyerRnc: '1234567', customerRnc: null }, 2) === '3');

  console.log('\n4) La ruta los pasa\n');
  const ruta = fuente('src/app/api/v1/reports/607/txt/route.ts');
  ok('selecciona el RNC declarado y el NCF modificado',
    /buyerRnc: invoices\.buyerRnc,/.test(ruta) && /modifiedNcf: invoices\.modifiedNcf,/.test(ruta));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
