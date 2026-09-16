/**
 * Una nota de credito no puede acreditar mas de lo que queda de su factura.
 *
 * EL CASO REAL (lote 146)
 * -----------------------
 * E340000000002 y E340000000003: dos notas por el total de E310000000020
 * (30.302,40), con una hora de diferencia. Nada comparaba la nota con su
 * factura: la segunda se emitio a la DGII y se asento, el mayor abono 60.604,80
 * contra una factura de 30.302,40 y la CxC se recorto en cero sin avisar.
 * Corregido a mano el 2026-09-16 (baja de la 0002). Este lote cierra la puerta.
 *
 * Se EJECUTA la regla; donde y cuando se aplica se lee.
 */
import { fuente } from './_fuente';

//  `limiteNotaCredito.ts` no importa la base, pero por si acaso: una direccion
//  que no lleva a ninguna, para que nada de este banco pueda escribir.
process.env.DATABASE_URL = 'postgres://banco:banco@127.0.0.1:1/banco_sin_base';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const exige = (t: string, c: boolean, d = '') => {
  if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`);
  console.log(`  pre   ${t}`);
};

const FACTURA_0020 = { ncf: 'E310000000020', ecfType: '31', status: 'accepted', totalNet: 30302.4 };
const nc = (neto: number, modifiedNcf = 'E310000000020') => ({ ecfType: '34', netoNota: neto, modifiedNcf });

async function main() {
  console.log('\n0) Precondiciones: donde se decide\n');
  const SERVICIO = fuente('src/services/invoiceService.ts');
  exige('la validacion previa va ANTES de reservar el NCF y de enviar a la DGII',
    SERVICIO.indexOf('await InvoiceDbBooker.preFlightValidations(data, totals);') > 0
    && SERVICIO.indexOf('await InvoiceDbBooker.preFlightValidations(data, totals);') < SERVICIO.indexOf('await InvoiceDbBooker.reservarNcf(')
    && SERVICIO.indexOf('await InvoiceDbBooker.reservarNcf(') < SERVICIO.indexOf('await InvoiceSubmissionService.submitToDgii('));
  exige('la ruta devuelve el status y el mensaje del error que llega',
    /const status = e\.status \|\| 500;/.test(fuente('src/app/api/v1/invoices/route.ts')) && /message: e\.message/.test(fuente('src/app/api/v1/invoices/route.ts')));

  let m: typeof import('../src/services/invoice/limiteNotaCredito') | null = null;
  try { m = await import('../src/services/invoice/limiteNotaCredito'); } catch { m = null; }
  const motivo = m?.motivoParaNoEmitirNota;

  console.log('\n1) El caso real\n');
  ok('E340000000003 despues de E340000000002 (ya acreditada entera): SE NIEGA',
    !!motivo && /ya está acreditada por completo/.test(motivo(nc(30302.4), FACTURA_0020, 30302.4, 0) ?? ''),
    motivo?.(nc(30302.4), FACTURA_0020, 30302.4, 0) ?? 'sin modulo');
  ok('la primera nota por el total: se permite', !!motivo && motivo(nc(30302.4), FACTURA_0020, 0, 0) === null);

  console.log('\n2) Parciales y bordes\n');
  ok('parcial dentro de lo que queda: se permite', !!motivo && motivo(nc(10000), FACTURA_0020, 20302.4, 0) === null);
  ok('justo lo que queda: se permite', !!motivo && motivo(nc(10000), FACTURA_0020, 20302.4, 0) === null && motivo(nc(30302.4 - 20302.4), FACTURA_0020, 20302.4, 0) === null);
  ok('un centimo de mas del margen de redondeo: se niega, y dice cuanto queda',
    !!motivo && /supera lo que queda por acreditar/.test(motivo(nc(10000.02), FACTURA_0020, 20302.4, 0) ?? '') && /10,000\.00/.test(motivo(nc(10000.02), FACTURA_0020, 20302.4, 0) ?? '')); // es-DO: coma de miles, punto decimal
  ok('una nota de debito aumenta lo que se puede acreditar', !!motivo && motivo(nc(35000), FACTURA_0020, 0, 5000) === null);

  console.log('\n3) La factura tiene que ser la que dice, y valida\n');
  ok('sin factura indicada: se niega', !!motivo && typeof motivo(nc(100), null, 0, 0) === 'string');
  ok('NCF modificado distinto del de la factura: se niega', !!motivo && /no es el de la factura/.test(motivo(nc(100, 'E310000000099'), FACTURA_0020, 0, 0) ?? ''));
  ok('factura en submitted: se niega (la DGII aun no la tiene)', !!motivo && typeof motivo(nc(100), { ...FACTURA_0020, status: 'submitted' }, 0, 0) === 'string');
  ok('factura rechazada o anulada: se niega',
    !!motivo && typeof motivo(nc(100), { ...FACTURA_0020, status: 'rejected' }, 0, 0) === 'string' && typeof motivo(nc(100), { ...FACTURA_0020, status: 'void' }, 0, 0) === 'string');
  ok('una nota sobre otra nota: se niega', !!motivo && typeof motivo(nc(100, 'E340000000003'), { ...FACTURA_0020, ncf: 'E340000000003', ecfType: '34' }, 0, 0) === 'string');
  ok('nota de debito sobre factura aceptada: se permite (no tiene tope)', !!motivo && motivo({ ecfType: '33', netoNota: 999999, modifiedNcf: 'E310000000020' }, FACTURA_0020, 0, 0) === null);
  ok('una factura normal no pasa por aqui', !!motivo && motivo({ ecfType: '31', netoNota: 5, modifiedNcf: undefined }, null, 0, 0) === null);

  console.log('\n4) Que cuenta como nota vigente, y el error\n');
  ok('vigentes: aceptada, enviada y firmada; no las rechazadas ni las anuladas',
    !!m && JSON.stringify([...m.NOTAS_VIGENTES].sort()) === JSON.stringify(['accepted', 'signed', 'submitted']));
  ok('el error sale como 409 con codigo propio',
    !!m && new m.NotaNoPermitidaError('x').status === 409 && new m.NotaNoPermitidaError('x').code === 'NOTA_NO_PERMITIDA');

  console.log('\n5) El cableado\n');
  {
    const booker = fuente('src/services/invoice/invoiceDbBooker.ts');
    //  Lote 149: la comprobacion salio de `preFlightValidations` a
    //  `comprobarYReservarNota` (con la factura bloqueada y las reservas). Se
    //  mira ahi, y que la emision la llama antes de reservar el NCF.
    const i = booker.indexOf('static async comprobarYReservarNota(');
    const cuerpo = i < 0 ? '' : booker.slice(i, booker.indexOf('static async liberarReservaNota(', i));
    ok('la emision comprueba la nota antes de reservar el NCF',
      SERVICIO.indexOf('await InvoiceDbBooker.comprobarYReservarNota(data, totals);') > 0
      && SERVICIO.indexOf('await InvoiceDbBooker.comprobarYReservarNota(data, totals);') < SERVICIO.indexOf('await InvoiceDbBooker.reservarNcf('));
    ok('la validacion previa consulta la factura en la empresa y el modo, sin borradas',
      /eq\(invoices\.id, data\.modifiedInvoiceId\),\s*eq\(invoices\.companyId, data\.companyId\),\s*eq\(invoices\.modo, data\.modo\),\s*isNull\(invoices\.deletedAt\)/.test(cuerpo));
    ok('suma las notas vigentes de ESA factura',
      /eq\(invoices\.modifiedInvoiceId, factura\.id\)/.test(cuerpo) && /inArray\(invoices\.status, NOTAS_VIGENTES as never\[\]\)/.test(cuerpo));
    ok('decide con la regla y el neto calculado, y se niega con su error',
      /motivoParaNoEmitirNota\(\s*\{ ecfType: data\.ecfType, netoNota: totals\.totalNet, modifiedNcf: data\.modifiedNcf \}/.test(cuerpo)
      && /if \(motivo\) throw new NotaNoPermitidaError\(motivo\);/.test(cuerpo));
    ok('y lo hace para notas de credito Y de debito (las demas salen antes)', /if \(data\.ecfType !== '33' && data\.ecfType !== '34'\) return null;/.test(cuerpo));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
