/**
 * Todo correo que manda el sistema queda registrado, y el fallo se ve.
 *
 * EL HUECO (lote 157)
 * -------------------
 * `system_email_logs` llevaba 0 filas desde que existe, con el SMTP puesto hace
 * 85 dias y correos que SI salieron (9 facturas de PRODUCCION con marca de
 * envio, la ultima del 17/09). Medido el 2026-09-18: el registrador escribia
 * `if (companyId)`, el `companyId` era OPCIONAL en el tipo del trabajo, y los
 * dos correos de factura -emision y reenvio/aceptacion- se encolaban sin
 * empresa, sin modo y sin referencia. Solo el de orden al suplidor los llevaba.
 * Resultado: no habia forma de saber a quien se envio ni que envios fallaron.
 *
 * Se EJECUTA la regla del registro y el texto que lee el usuario; el cableado
 * se lee. LO QUE NO PRUEBA: un envio real por SMTP.
 */
import fs from 'fs';
import { fuente } from './_fuente';

const leer = (ruta: string) => (fs.existsSync(ruta) ? fuente(ruta) : '');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};
const exige = (t: string, c: boolean, d = '') => {
  if (!c) throw new Error(`PRECONDICION ROTA: ${t}${d ? ` -- ${d}` : ''}`);
  console.log(`  pre   ${t}`);
};

async function main() {
  console.log('\n0) Precondiciones\n');
  const ESQ = fuente('src/db/schema/system.ts');
  exige('la tabla del registro sigue exigiendo empresa y contexto',
    /companyId: uuid\('company_id'\)\.notNull\(\)/.test(ESQ) && /context: varchar\('context', \{ length: 50 \}\)\.notNull\(\)/.test(ESQ));
  const RUN = fuente('src/infrastructure/jobRunners.ts');
  exige('el envio sigue haciendose con nodemailer y adjuntando el PDF',
    /await transporter\.sendMail\(\{/.test(RUN) && /attachments,/.test(RUN));

  let m: typeof import('../src/services/correo/registroCorreo') | null = null;
  try { m = await import('../src/services/correo/registroCorreo'); } catch { m = null; }

  console.log('\n1) Que fila corresponde a cada envio\n');
  const base = { companyId: 'emp-1', modo: 'PRODUCCION', context: 'factura', referenceId: 'fac-1', userId: 'u-1', to: 'cliente@x.do', subject: 'Factura E31' };
  ok('sin empresa no hay fila: el envio no se puede registrar', !!m && m.filaDeRegistro({ ...base, companyId: '' }, { status: 'sent' }) === null);
  {
    const ahora = new Date('2026-09-18T10:00:00Z');
    const f = m?.filaDeRegistro(base, { status: 'sent', providerMessageId: '<abc@smtp>', attachmentNames: ['factura.pdf'], ahora });
    ok('un envio bueno guarda destinatario, asunto, adjuntos, referencia, usuario y la FECHA de envio',
      !!f && f.toEmail === 'cliente@x.do' && f.subject === 'Factura E31' && f.status === 'sent'
      && JSON.stringify(f.attachmentNames) === '["factura.pdf"]' && f.referenceId === 'fac-1' && f.userId === 'u-1'
      && f.providerMessageId === '<abc@smtp>' && f.sentAt?.toISOString() === ahora.toISOString() && f.errorMessage === null);
    const g = m?.filaDeRegistro(base, { status: 'failed', errorMessage: 'connect ETIMEDOUT smtp:587' });
    ok('un fallo guarda el motivo y NO guarda fecha de envio',
      !!g && g.status === 'failed' && g.errorMessage === 'connect ETIMEDOUT smtp:587' && g.sentAt === null);
  }
  ok('el modo es PRUEBA solo si lo dice el trabajo; si no, PRODUCCION',
    !!m && m.filaDeRegistro({ ...base, modo: 'PRUEBA' }, { status: 'sent' })?.modo === 'PRUEBA'
    && m.filaDeRegistro({ ...base, modo: null }, { status: 'sent' })?.modo === 'PRODUCCION');
  ok('sin contexto se registra como del sistema, y lo vacio queda en nulo',
    !!m && m.filaDeRegistro({ ...base, context: '', referenceId: '  ', userId: '' }, { status: 'sent' })?.context === 'sistema'
    && m.filaDeRegistro({ ...base, referenceId: '  ' }, { status: 'sent' })?.referenceId === null
    && m.filaDeRegistro({ ...base, userId: '' }, { status: 'sent' })?.userId === null);
  ok('un error enorme se recorta, no revienta la fila',
    !!m && m.filaDeRegistro(base, { status: 'failed', errorMessage: 'x'.repeat(5000) })?.errorMessage?.length === m.MAX_ERROR);
  ok('los contextos son los tres del sistema',
    !!m && JSON.stringify(m.CONTEXTOS_CORREO) === JSON.stringify({ factura: 'factura', ordenSuplidor: 'orden_suplidor', sistema: 'sistema' }));

  console.log('\n2) Lo que lee quien mira la factura\n');
  ok('enviado: lo dice con su fecha, en el formato de la pantalla',
    !!m && m.estadoDelCorreo({ correoEstado: 'sent', correoFecha: '2026-09-17 16:14:01' }, () => '17/09/2026 4:14 p. m.')
      === 'Correo enviado el 17/09/2026 4:14 p. m.. Pulse para reenviarlo.');
  ok('fallido: dice el motivo y ofrece reintentar',
    !!m && /NO se pudo enviar: buzón lleno/.test(m.estadoDelCorreo({ correoEstado: 'failed', correoError: 'buzón lleno' })));
  ok('sin envio: lo dice, no finge que salio',
    !!m && m.estadoDelCorreo({}) === 'No consta ningún envío. Pulse para enviarlo al cliente.');

  console.log('\n3) El cableado\n');
  {
    const COLA = fuente('src/infrastructure/queue.ts');
    const bloque = COLA.slice(COLA.indexOf("'emails-sending': {"), COLA.indexOf('}', COLA.indexOf('fromName?: string;')));
    ok('el trabajo de correo EXIGE empresa, modo y contexto',
      /companyId: string;/.test(bloque) && /modo: string;/.test(bloque) && /context: ContextoCorreo;/.test(bloque)
      && !/companyId\?: string;/.test(bloque));
    ok('y admite la referencia y el usuario', /referenceId\?: string;/.test(bloque) && /userId\?: string;/.test(bloque));
  }
  ok('el registrador escribe SIEMPRE, con la fila que decide el modulo, y grita si no puede',
    //  El `modo` va repetido en el `values` a proposito: la prueba
    //  `aislamientoModo` exige verlo en el propio INSERT (la columna tiene
    //  DEFAULT y olvidarlo guardaria en el entorno equivocado).
    /const fila = filaDeRegistro\(/.test(RUN)
    && /if \(fila\) \{\s*await db\.insert\(systemEmailLogs\)\.values\(\{ \.\.\.fila, modo: fila\.modo \}\);\s*\} else \{\s*Logger\.error\(/.test(RUN)
    && !/if \(companyId\) \{\s*await db\.insert\(systemEmailLogs\)/.test(RUN));
  {
    const sitios: [string, string][] = [
      ['src/services/invoice/correoFactura.ts', 'factura'],
      ['src/services/invoice/invoiceFileGenerator.ts', 'factura'],
      ['src/app/api/v1/supplier-orders/[id]/email/route.ts', 'ordenSuplidor'],
    ];
    for (const [ruta, contexto] of sitios) {
      const f = leer(ruta);
      const i = f.indexOf("addJob('emails-sending'");
      const llamada = i < 0 ? '' : f.slice(i, i + 600);
      ok(`${ruta.split('/').pop()}: encola con empresa, modo, contexto y referencia`,
        /companyId[,:]/.test(llamada) && /modo[,:]/.test(llamada)
        && new RegExp(`context: CONTEXTOS_CORREO\\.${contexto}`).test(llamada) && /referenceId[,:]/.test(llamada));
    }
    ok('la emision pasa la factura ya creada, para que el correo se registre contra ella',
      /invoiceId\?: string/.test(leer('src/services/invoice/invoiceFileGenerator.ts'))
      && /msellerXmlPath,\s*dbResult\.invoice\.id\s*\);/.test(fuente('src/services/invoiceService.ts')));
  }
  {
    const REPO = fuente('src/repositories/invoiceRepository.ts');
    ok('el listado trae el ultimo correo de cada factura, acotado a la empresa',
      /correoEstado: sql<string \| null>`\(\s*select l\.status from system_email_logs l\s*where l\.reference_id = \$\{invoices\.id\}::text and l\.company_id = \$\{invoices\.companyId\}\s*order by l\.created_at desc limit 1\)`/.test(REPO)
      && /correoFecha: sql<string \| null>`\(/.test(REPO) && /correoError: sql<string \| null>`\(/.test(REPO));
    const PANT = fuente('src/app/dashboard/invoices/page.tsx');
    ok('la pantalla lo pinta: verde si salio, rojo si fallo, y el texto del modulo',
      /inv\.correoEstado === 'sent' && 'text-emerald-600/.test(PANT) && /inv\.correoEstado === 'failed' && 'text-red-600/.test(PANT)
      && /title=\{estadoDelCorreo\(inv, formatDateTimeDisplay\)\}/.test(PANT));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
