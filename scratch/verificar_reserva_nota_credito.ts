/**
 * Dos notas de credito simultaneas sobre la misma factura no pasan las dos.
 *
 * EL HUECO (lote 149)
 * -------------------
 * El lote 146 niega la nota que acredita mas de lo que queda, pero comprueba
 * ANTES de enviar a la DGII y la nota no cuenta hasta que se asienta, segundos
 * despues. Dos personas emitiendo a la vez la ultima nota de una factura
 * pasaban las dos la comprobacion.
 *
 * EL CIERRE. `comprobarYReservarNota`: transaccion corta con la fila de la
 * factura bloqueada (`FOR UPDATE`), que descuenta tambien las reservas vivas y
 * anota la suya. La emision la libera en un `finally`; si muere, caduca.
 *
 * LO QUE NO SE PRUEBA AQUI. La carrera de verdad necesita dos conexiones contra
 * una base que se pueda ensuciar, y no la hay (es la deuda de los bancos de
 * integracion, ver el traspaso). Se ejecuta la regla con reservas y se lee el
 * cableado.
 */
import fs from 'fs';
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
const bloque = (src: string, ancla: string): string => {
  const i = src.indexOf(ancla);
  if (i < 0) return '';
  const j = src.indexOf('{', i + ancla.length - 1);
  let n = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') n++;
    else if (src[k] === '}') { n--; if (n === 0) return src.slice(i, k + 1); }
  }
  return '';
};

async function main() {
  const BOOKER = fuente('src/services/invoice/invoiceDbBooker.ts');
  const SERVICIO = fuente('src/services/invoiceService.ts');

  console.log('\n0) Precondiciones\n');
  const m = await import('../src/services/invoice/limiteNotaCredito');
  exige('la regla del lote 146 sigue ahi', typeof m.motivoParaNoEmitirNota === 'function');
  exige('la emision sigue: reservar NCF, enviar a la DGII, asentar',
    SERVICIO.indexOf('await InvoiceDbBooker.reservarNcf(') > 0
    && SERVICIO.indexOf('await InvoiceDbBooker.reservarNcf(') < SERVICIO.indexOf('await InvoiceSubmissionService.submitToDgii(')
    && SERVICIO.indexOf('await InvoiceSubmissionService.submitToDgii(') < SERVICIO.indexOf('await InvoiceDbBooker.executeDbTransaction('));

  console.log('\n1) Lo reservado cuenta como acreditado\n');
  const factura = { ncf: 'E310000000020', ecfType: '31', status: 'accepted', totalNet: 30302.4 };
  const nota = { ecfType: '34', netoNota: 30302.4, modifiedNcf: 'E310000000020' };
  //  La segunda de dos notas simultaneas: nada asentado aun, la primera reservada.
  exige('sin nada asentado ni reservado, la nota pasa', m.motivoParaNoEmitirNota(nota, factura, 0, 0) === null);
  exige('con la primera reservada (sumada a lo acreditado), la segunda se niega',
    typeof m.motivoParaNoEmitirNota(nota, factura, 0 + 30302.4, 0) === 'string');
  ok('las reservas caducan a los 5 minutos', (m as Record<string, unknown>).RESERVA_NOTA_MINUTOS === 5, String((m as Record<string, unknown>).RESERVA_NOTA_MINUTOS));

  console.log('\n2) La reserva: bloqueo, reservas vivas, anotacion\n');
  const cuerpo = bloque(BOOKER, 'static async comprobarYReservarNota(');
  ok('existe comprobarYReservarNota, en una transaccion', /return await db\.transaction\(async \(tx\) => \{/.test(cuerpo));
  ok('bloquea la fila de la factura antes de sumar', /\.for\('update'\)/.test(cuerpo) && cuerpo.indexOf(".for('update')") < cuerpo.indexOf('const [vigentes]'));
  ok('suma las reservas vivas de ESA factura, en la empresa y el modo',
    /eq\(reservasNotaCredito\.invoiceId, factura\.id\),\s*eq\(reservasNotaCredito\.companyId, data\.companyId\),\s*eq\(reservasNotaCredito\.modo, data\.modo\),\s*sql`\$\{reservasNotaCredito\.expiraEn\} > now\(\)`/.test(cuerpo));
  ok('y las descuenta como acreditado al decidir',
    /parseFloat\(vigentes\?\.credito \?\? '0'\) \+ parseFloat\(reservado\?\.total \?\? '0'\)/.test(cuerpo));
  ok('niega antes de anotar la reserva', cuerpo.indexOf('if (motivo) throw new NotaNoPermitidaError(motivo);') > 0
    && cuerpo.indexOf('if (motivo) throw new NotaNoPermitidaError(motivo);') < cuerpo.indexOf('.insert(reservasNotaCredito)'));
  ok('anota la reserva con el neto de la nota, en su modo, caducando con el reloj de la base',
    /\.insert\(reservasNotaCredito\)\s*\.values\(\{\s*companyId: data\.companyId,\s*modo: data\.modo,\s*invoiceId: factura\.id,\s*monto: totals\.totalNet\.toFixed\(2\),\s*expiraEn: sql`now\(\) \+ make_interval\(mins => \$\{RESERVA_NOTA_MINUTOS\}\)`,/.test(cuerpo));
  ok('las notas de debito no reservan', /if \(data\.ecfType !== '34' \|\| !factura\) return null;/.test(cuerpo));

  console.log('\n3) La emision reserva antes y libera pase lo que pase\n');
  {
    const iReserva = SERVICIO.indexOf('const reservaNota = await InvoiceDbBooker.comprobarYReservarNota(data, totals);');
    const iTry = SERVICIO.indexOf('try {', iReserva);
    const iFinally = SERVICIO.indexOf('} finally {', iReserva);
    ok('reserva antes de reservar el NCF', iReserva > 0 && iReserva < SERVICIO.indexOf('await InvoiceDbBooker.reservarNcf('));
    ok('el try que la protege abre justo despues', iReserva > 0 && iTry > iReserva && SERVICIO.slice(iReserva, iTry).split('\n').length <= 2);
    ok('y cubre reservar NCF, enviar y asentar',
      iTry < SERVICIO.indexOf('await InvoiceDbBooker.reservarNcf(') && SERVICIO.indexOf('await InvoiceDbBooker.executeDbTransaction(') < iFinally);
    ok('el finally libera esa reserva',
      /\} finally \{[\s\S]{0,400}await InvoiceDbBooker\.liberarReservaNota\(reservaNota, data\.companyId\);/.test(SERVICIO.slice(iFinally - 1)));
    const liberar = bloque(BOOKER, 'static async liberarReservaNota(');
    ok('liberar borra por id y empresa, y no tapa el error de la emision',
      /\.delete\(reservasNotaCredito\)\s*\.where\(and\(eq\(reservasNotaCredito\.id, reservaId\), eq\(reservasNotaCredito\.companyId, companyId\)\)\)/.test(liberar)
      && /catch \(err\)/.test(liberar) && !/throw/.test(liberar));
  }

  console.log('\n4) La tabla y su migracion\n');
  {
    const esquema = fuente('src/db/schema/invoices.ts');
    ok('la tabla existe con clave foranea compuesta a la factura',
      /export const reservasNotaCredito = pgTable\('reservas_nota_credito'/.test(esquema)
      && /columns: \[table\.invoiceId, table\.companyId\],\s*foreignColumns: \[invoices\.id, invoices\.companyId\]/.test(esquema));
    const ruta = 'drizzle/0007_reservas_nota_credito.sql';
    const sqlMig = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : '';
    ok('la migracion crea la tabla, la FK compuesta y el indice, y nada mas',
      /CREATE TABLE "reservas_nota_credito"/.test(sqlMig)
      && /FOREIGN KEY \("invoice_id","company_id"\) REFERENCES "public"\."invoices"\("id","company_id"\) ON DELETE cascade/.test(sqlMig)
      && /CREATE INDEX "reservas_nota_credito_factura_idx"/.test(sqlMig)
      && (sqlMig.match(/--> statement-breakpoint/g) || []).length === 3);
    const journal = fs.existsSync('drizzle/meta/_journal.json') ? fs.readFileSync('drizzle/meta/_journal.json', 'utf8') : '';
    ok('y esta en el diario de migraciones', /"tag": "0007_reservas_nota_credito"/.test(journal));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
