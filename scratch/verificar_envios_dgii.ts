/**
 * Envios a la DGII: una fila por intento, y que ninguna pise a otra.
 *
 * EL DANO
 * -------
 * En `dgii_submissions` se inserta una fila por cada intento de envio: la
 * emision inserta la suya, y `POST /invoices/[id]/submit` y
 * `POST /ecf/[id]/resubmit` insertan otra en cada reintento.
 *
 * Pero quien escribia el RESULTADO actualizaba asi:
 *
 *     UPDATE dgii_submissions SET status='failed', response_payload=...
 *     WHERE invoice_id = ? AND company_id = ?
 *
 * Sin decir QUE fila. Tocaba todas. Traducido: reenviar un comprobante y que
 * el reenvio falle borraba la constancia de la aceptacion anterior -- el
 * `track_id` se quedaba huerfano y `response_payload` pasaba a contener el
 * error. De ese payload salen el codigo de seguridad y el QR que se imprimen
 * en el comprobante fiscal y que hay que poder mostrar ante la DGII.
 *
 * Y cinco rutas leian con `.limit(1)` SIN `ORDER BY`, quedandose con la fila
 * que Postgres tuviera mas a mano.
 *
 * LA CORRECCION
 * -------------
 * 1. Cada trabajo de la cola actualiza SU intento (`submissionId` en el
 *    payload; para los ya encolados se deduce el intento vivo, que nunca es
 *    uno aceptado).
 * 2. La lectura vive en un solo sitio, `envioVigente`, con orden total y con
 *    la aceptacion mandando sobre los intentos posteriores.
 *
 * NO se creo un UNIQUE sobre invoice_id, a proposito: obligaria a borrar filas
 * de una tabla fiscal y con ellas el motivo de cada rechazo de la DGII.
 */
import { db, dgiiSubmissions } from '../src/db';
import { sql, eq, and } from 'drizzle-orm';
import { limpiar as limpiarTodo } from './_limpieza';
import { envioVigente, envioEnCurso } from '../src/repositories/dgiiSubmissionRepository';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fuente, crudo } from './_fuente';

const A = '11111111-1111-1111-1111-111111111111';
const USER = 'bbbbbbbb-0000-0000-0000-000000000001';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

async function factura(codigoFactura: string, ncf: string, modo: 'PRODUCCION' | 'PRUEBA') {
  const [f] = (await db.execute(sql`
    INSERT INTO invoices (company_id, modo, user_id, ncf, ecf_type, total, codigo_factura, status)
    VALUES (${A}::uuid, ${modo}, ${USER}::uuid, ${ncf}, '31', 1000, ${codigoFactura}, 'accepted')
    RETURNING id`)) as unknown as { id: string }[];
  return f.id;
}

const envio = async (
  invoiceId: string,
  estado: string,
  trackId: string | null,
  payload: string | null,
  modo: 'PRODUCCION' | 'PRUEBA' = 'PRODUCCION'
) => {
  const [e] = (await db.execute(sql`
    INSERT INTO dgii_submissions (company_id, modo, invoice_id, track_id, status, response_payload)
    VALUES (${A}::uuid, ${modo}, ${invoiceId}::uuid, ${trackId}, ${estado}, ${payload})
    RETURNING id`)) as unknown as { id: string }[];
  // created_at se separa a mano: dos filas creadas en el mismo milisegundo
  // dejarian el orden a merced del desempate, y aqui se esta comprobando
  // justamente que el orden es total.
  await db.execute(sql`
    UPDATE dgii_submissions SET created_at = now() + (random() * interval '1 second')
    WHERE id = ${e.id}::uuid`);
  return e.id;
};

async function main() {
  await limpiarTodo();

  console.log('\n1) EL DANO: un reenvio fallido borraba la aceptacion\n');
  const fac = await factura('FAC-001', 'E310000090001', 'PRODUCCION');
  const aceptado = await envio(fac, 'accepted', 'TRK-DGII-001',
    '{"codigoSeguridad":"ABC123","qr_url":"https://dgii/x"}');
  const reintento = await envio(fac, 'pending', null, null);

  // Asi actualizaba antes: por factura y empresa, sin decir que fila.
  const comoAntes = async () => {
    await db.execute(sql`
      UPDATE dgii_submissions
         SET status = 'failed', response_payload = '{"error":"timeout"}'
       WHERE invoice_id = ${fac}::uuid AND company_id = ${A}::uuid`);
  };
  await comoAntes();

  const trasViejo = (await db.execute(sql`
    SELECT status, response_payload FROM dgii_submissions WHERE id = ${aceptado}::uuid`
  )) as unknown as { status: string; response_payload: string }[];
  ok('reproducido: la fila ACEPTADA quedo en failed', trasViejo[0].status === 'failed',
    trasViejo[0].status);
  ok('y su codigo de seguridad desaparecio',
    !trasViejo[0].response_payload.includes('ABC123'), trasViejo[0].response_payload);

  console.log('\n2) Con la correccion, el intento no toca a los demas\n');
  await db.execute(sql`DELETE FROM dgii_submissions`);
  const aceptado2 = await envio(fac, 'accepted', 'TRK-DGII-001',
    '{"codigoSeguridad":"ABC123"}');
  const reintento2 = await envio(fac, 'pending', null, null);

  // Asi actualiza ahora: por el id del propio intento.
  await db.execute(sql`
    UPDATE dgii_submissions
       SET status = 'failed', response_payload = '{"error":"timeout"}'
     WHERE id = ${reintento2}::uuid AND company_id = ${A}::uuid`);

  const intacto = (await db.execute(sql`
    SELECT status, track_id, response_payload FROM dgii_submissions WHERE id = ${aceptado2}::uuid`
  )) as unknown as { status: string; track_id: string; response_payload: string }[];
  ok('la aceptacion sigue aceptada', intacto[0].status === 'accepted', intacto[0].status);
  ok('conserva su track_id', intacto[0].track_id === 'TRK-DGII-001', String(intacto[0].track_id));
  ok('y su codigo de seguridad', intacto[0].response_payload.includes('ABC123'),
    intacto[0].response_payload);
  const fallido = (await db.execute(sql`
    SELECT status FROM dgii_submissions WHERE id = ${reintento2}::uuid`
  )) as unknown as { status: string }[];
  ok('CONTROL: y el intento que fallo si quedo en failed', fallido[0].status === 'failed',
    fallido[0].status);

  console.log('\n3) envioVigente elige siempre el mismo, y elige bien\n');
  const vig = await envioVigente(fac, A, 'PRODUCCION');
  ok('devuelve la aceptacion, no el intento fallido posterior', vig?.id === aceptado2,
    vig?.status);
  ok('con el codigo de seguridad dentro',
    String(vig?.responsePayload).includes('ABC123'), String(vig?.responsePayload));

  // Diez veces seguidas: si dependiera del orden fisico, variaria.
  const ids = new Set<string>();
  for (let i = 0; i < 10; i++) ids.add((await envioVigente(fac, A, 'PRODUCCION'))!.id);
  ok('diez llamadas devuelven exactamente la misma fila', ids.size === 1, `${ids.size} distintas`);

  console.log('\n4) Sin aceptacion, manda el intento mas reciente\n');
  const fac2 = await factura('FAC-002', 'E310000090002', 'PRODUCCION');
  await envio(fac2, 'failed', null, '{"error":"primero"}');
  await new Promise((r) => setTimeout(r, 20));
  const ultimo = await envio(fac2, 'rejected', null, '{"error":"ultimo"}');
  await db.execute(sql`UPDATE dgii_submissions SET created_at = now() + interval '1 hour'
                        WHERE id = ${ultimo}::uuid`);
  const vig2 = await envioVigente(fac2, A, 'PRODUCCION');
  ok('devuelve el ultimo intento', vig2?.id === ultimo, String(vig2?.status));

  console.log('\n5) El entorno acota: una factura de PRUEBA no ve envios reales\n');
  const facP = await factura('FAC-P', 'E310000090003', 'PRUEBA');
  await envio(facP, 'accepted', 'TRK-PRUEBA', '{"codigoSeguridad":"PRUEBA1"}', 'PRUEBA');
  ok('en PRUEBA se encuentra el suyo',
    (await envioVigente(facP, A, 'PRUEBA'))?.trackId === 'TRK-PRUEBA');
  ok('y desde PRODUCCION no se encuentra nada',
    (await envioVigente(facP, A, 'PRODUCCION')) === null);
  ok('CONTROL: ni la de PRODUCCION desde PRUEBA',
    (await envioVigente(fac, A, 'PRUEBA')) === null);

  console.log('\n6) envioEnCurso nunca devuelve una aceptacion\n');
  // La factura 1 tiene: una aceptada y una fallida. Ninguna esta viva.
  ok('sin intentos vivos devuelve null', (await envioEnCurso(fac, A)) === null,
    String(await envioEnCurso(fac, A)));
  const vivo = await envio(fac, 'pending', null, null);
  ok('con uno pendiente devuelve ese', (await envioEnCurso(fac, A)) === vivo);
  await db.execute(sql`UPDATE dgii_submissions SET status='processing' WHERE id = ${vivo}::uuid`);
  ok('y tambien si esta en proceso', (await envioEnCurso(fac, A)) === vivo);
  void aceptado; void reintento;

  console.log('\n7) El codigo ya no actualiza a bulto ni lee sin orden\n');
  const jr = fuente('src/infrastructure/jobRunners.ts');
  ok('jobRunners resuelve el intento concreto', /const submissionId = data\.submissionId/.test(jr));
  ok('y todos sus UPDATE apuntan a esa fila',
    (jr.match(/\.where\(esteEnvio\)/g) || []).length === 3,
    String((jr.match(/\.where\(esteEnvio\)/g) || []).length));
  ok('ya no queda ningun UPDATE por invoiceId+companyId',
    !/dgiiSubmissions\.invoiceId, invoiceId\), eq\(dgiiSubmissions\.companyId/.test(jr));

  const wk = fuente('src/infrastructure/worker.ts');
  ok('el worker tambien apunta a la fila', /eq\(dgiiSubmissions\.id, id\)/.test(wk));

  for (const r of [
    'src/app/api/v1/invoices/[id]/pdf/route.ts',
    'src/app/api/v1/invoices/[id]/print/route.ts',
    'src/app/api/v1/invoices/[id]/email/route.ts',
    'src/app/api/v1/invoices/[id]/xml/route.ts',
    'src/app/api/v1/invoices/[id]/route.ts',
  ]) {
    const s = fuente(r);
    ok(`${r.replace('src/app/api/v1/invoices/[id]/', '')} usa envioVigente`,
      /envioVigente\(/.test(s) && !/from\(dgiiSubmissions\)/.test(s));
  }

  console.log('\n8) Los tres sitios que encolan pasan su submissionId\n');
  ok('la emision', /submissionId: envio\.id/.test(fuente('src/services/invoice/invoiceDbBooker.ts')));
  ok('submit', /submissionId: submission\.id/.test(fuente('src/app/api/v1/invoices/[id]/submit/route.ts')));
  ok('resubmit', /submissionId: submission\.id/.test(fuente('src/app/api/v1/ecf/[id]/resubmit/route.ts')));
  ok('y el payload de la cola lo admite como opcional',
    /submissionId\?: string;/.test(fuente('src/infrastructure/queue.ts')));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
