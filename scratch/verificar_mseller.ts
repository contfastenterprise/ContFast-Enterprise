/**
 * mSeller: esperar lo que haga falta, y no inventarse el codigo de seguridad.
 *
 * LOS DOS FALLOS
 * --------------
 * Se reportaron como dos y son el mismo camino roto visto en dos momentos:
 *
 *   1. "no espera lo suficiente para esperar una respuesta de mseller"
 *   2. "cuando sincronizo una factura y vuelvo a imprimirla me genera un
 *      codigo de seguridad que no es el mismo que me da mseller"
 *
 * Medido en scratch/reproducir_mseller.ts, con un mSeller de mentira que
 * contesta a los 14 s: el cliente aborta a los 12.009 s, devuelve "timeout", y
 * el documento SI se habia procesado al otro lado. Desde ahi:
 *
 *   - "timeout" cuenta como error de comunicacion
 *   - el usuario acepta "emitir localmente" y se reenvia el MISMO NCF de un
 *     e-CF que la DGII pudo haber aceptado ya
 *   - el codigo de seguridad que venia en la respuesta perdida no llega nunca
 *   - y al imprimir se fabricaba uno: sha256(id + ncf), cortado a 16
 *
 * El segundo sintoma tenia ademas causa propia. Las dos rutas de
 * sincronizacion hacian:
 *
 *     UPDATE dgii_submissions SET response_payload = <respuesta del ESTADO>
 *      WHERE invoice_id = ? AND company_id = ? AND modo = ?
 *
 * La respuesta de la consulta de estado no lleva codigo de seguridad, asi que
 * sincronizar BORRABA el codigo. Y sin decir que fila, tocaba todos los
 * intentos, incluido el aceptado -- el patron que la 0035 ya habia corregido
 * en los trabajos de la cola y que en estas dos rutas quedo sin corregir.
 *
 * LA CORRECCION
 * -------------
 *   - Los tiempos de espera viven en `src/services/dgii/tiempos.ts`, separados
 *     por lo que hace cada llamada y configurables por entorno. El envio pasa
 *     de 12 s a 45 s, y la ruta de emision declara `maxDuration = 60` para que
 *     la plataforma no corte antes.
 *   - El codigo de seguridad tiene columna propia (0041) y se lee en un solo
 *     sitio, `datosFirmaDeEnvio`, que mira tambien dentro de `dgiiResponse`.
 *   - Si no consta, no consta: cadena vacia. Y sin codigo no se genera QR.
 */
import { db, dgiiSubmissions } from '../src/db';
import { sql } from 'drizzle-orm';
import { envioVigente, datosFirmaDeEnvio } from '../src/repositories/dgiiSubmissionRepository';
import { leerDatosFirma, leerCodigoSeguridad, urlConsultaDgii } from '../src/services/dgii/codigoSeguridad';
import { MS_AUTENTICACION, MS_ENVIO, MS_CONSULTA } from '../src/services/dgii/tiempos';
import { fuente, crudo, bloque } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

const CODIGO = 'A1B2C3D4E5F60718';

async function main() {
  console.log('\n1) Los tiempos de espera: uno por trabajo, y el envio con margen\n');

  ok('el envio espera bastante mas que los 12 s de antes', MS_ENVIO >= 30_000, `${MS_ENVIO} ms`);
  ok('la autenticacion no necesita tanto', MS_AUTENTICACION <= MS_ENVIO, `${MS_AUTENTICACION} ms`);
  ok('la consulta de estado tampoco', MS_CONSULTA <= MS_ENVIO, `${MS_CONSULTA} ms`);

  const cliente = fuente('src/services/dgii/msellerClient.ts');
  ok('no quedan tiempos escritos a pelo en el cliente',
    !/abort\(\),\s*\d/.test(cliente));

  // Subir el tiempo del cliente no sirve si la plataforma corta antes.
  const rutaEmision = crudo('src/app/api/v1/invoices/route.ts');
  const mMax = /export const maxDuration = (\d+)/.exec(rutaEmision);
  ok('la ruta de emision declara su maxDuration', !!mMax, mMax ? mMax[1] + ' s' : 'no declarado');
  ok('y da mas margen que el tiempo de espera del envio',
    !!mMax && Number(mMax[1]) * 1000 >= MS_ENVIO,
    mMax ? `${mMax[1]}s vs ${MS_ENVIO / 1000}s` : '');

  console.log('\n2) El codigo de seguridad se lee donde este\n');

  ok('al primer nivel, `securityCode`',
    leerCodigoSeguridad({ securityCode: CODIGO }) === CODIGO);
  ok('al primer nivel, `codigoSeguridad`',
    leerCodigoSeguridad({ codigoSeguridad: CODIGO }) === CODIGO);
  ok('REGRESION: anidado en dgiiResponse como cadena JSON',
    leerCodigoSeguridad({ dgiiResponse: [JSON.stringify({ codigoSeguridad: CODIGO })] }) === CODIGO);
  ok('anidado como objeto',
    leerCodigoSeguridad({ dgiiResponse: [{ securityCode: CODIGO }] }) === CODIGO);
  ok('una parte ilegible no tapa a la buena',
    leerCodigoSeguridad({ dgiiResponse: ['{roto', JSON.stringify({ securityCode: CODIGO })] }) === CODIGO);

  console.log('\n3) Lo que no consta, no se inventa\n');

  ok('respuesta vacia -> cadena vacia', leerCodigoSeguridad({}) === '');
  ok('null -> cadena vacia', leerCodigoSeguridad(null) === '');
  ok('codigo en blanco -> cadena vacia', leerCodigoSeguridad({ securityCode: '   ' }) === '');
  ok('la respuesta de una consulta de estado no aporta codigo',
    leerCodigoSeguridad({ ncf: 'E31...', estado: 'Aceptado', mensajes: [] }) === '');

  const sinCodigo = urlConsultaDgii({
    rncEmisor: '131793916', ncf: 'E310000000001', fecha: new Date(),
    total: 1000, codigoSeguridad: '',
  });
  ok('sin codigo no hay URL de consulta (ni QR)', sinCodigo === null, String(sinCodigo));

  const conCodigo = urlConsultaDgii({
    rncEmisor: '131793916', ncf: 'E310000000001', fecha: new Date('2026-09-02T10:00:00'),
    total: 1000, codigoSeguridad: CODIGO,
  });
  ok('con codigo si la hay', !!conCodigo && conCodigo.includes(`codigoSeguridad=${CODIGO}`));
  ok('y la fecha va con ceros (dd-mm-aaaa)',
    !!conCodigo && conCodigo.includes('fechaFirma=02-09-2026'),
    conCodigo ? decodeURIComponent(conCodigo).split('fechaFirma=')[1]?.split('&')[0] : '');

  console.log('\n4) Ninguna ruta fabrica ya un codigo con sha256\n');

  const rutas = [
    'src/app/api/v1/invoices/[id]/route.ts',
    'src/app/api/v1/invoices/[id]/print/route.ts',
    'src/app/api/v1/invoices/[id]/pdf/route.ts',
    'src/app/api/v1/invoices/[id]/email/route.ts',
  ];
  for (const r of rutas) {
    const src = fuente(r);
    ok(`${r.split('/').slice(-2).join('/')}: sin sha256 inventado`,
      !/createHash\(\s*'sha256'\s*\)/.test(src));
    ok(`${r.split('/').slice(-2).join('/')}: lee por datosFirmaDeEnvio`,
      /datosFirmaDeEnvio\(/.test(src));
  }
  const gen = fuente('src/services/invoice/invoiceFileGenerator.ts');
  ok('el generador de ficheros no arma un QR con el codigo vacio',
    !/codigoSeguridad=\$\{securityHash\}/.test(gen) && /urlConsultaDgii\(/.test(gen));

  console.log('\n5) La sincronizacion actualiza UN envio y no borra el codigo\n');

  for (const r of [
    'src/app/api/v1/ecf/[id]/dgii-status/route.ts',
    'src/app/api/v1/ecf/dgii-status/batch/route.ts',
  ]) {
    const src = fuente(r);
    ok(`${r.split('/').slice(-2).join('/')}: elige el envio con envioVigente`,
      /envioVigente\(/.test(src));
    ok(`${r.split('/').slice(-2).join('/')}: actualiza por id de envio`,
      /eq\(dgiiSubmissions\.id,\s*envio\.id\)/.test(src));
    ok(`${r.split('/').slice(-2).join('/')}: ya no actualiza por invoiceId`,
      !/update\(dgiiSubmissions\)[\s\S]{0,600}?eq\(dgiiSubmissions\.invoiceId,/.test(src));
  }

  console.log('\n6) Sobre la base de datos: sincronizar ya no borra el codigo\n');

  // El banco siembra SU factura en vez de coger la primera que encuentre.
  // Antes hacia `SELECT ... FROM invoices LIMIT 1` y pasaba o fallaba segun
  // que banco se hubiera ejecutado antes -- los que vacian las tablas
  // transaccionales lo dejaban sin nada. Un banco que depende del orden no
  // esta comprobando lo que dice comprobar.
  const [emp] = (await db.execute(sql`SELECT id FROM companies LIMIT 1`)) as unknown as any[];
  const [usr] = (await db.execute(sql`SELECT id FROM users LIMIT 1`)) as unknown as any[];
  await db.execute(sql`DELETE FROM invoices WHERE ncf = 'E319999900001'`);
  const [inv] = (await db.execute(sql`
    INSERT INTO invoices (company_id, modo, user_id, ncf, ecf_type, subtotal, total_taxes, total, codigo_factura, status)
    VALUES (${emp.id}::uuid, 'PRODUCCION', ${usr.id}::uuid, 'E319999900001', '31', 1000, 180, 1180, 'FAC-MS-BANCO', 'accepted')
    RETURNING id, company_id, modo`)) as unknown as any[];
  {
    await db.execute(sql`DELETE FROM dgii_submissions WHERE invoice_id = ${inv.id}::uuid`);

    // Como queda tras emitir: codigo en su columna Y dentro del payload.
    const [e] = (await db.execute(sql`
      INSERT INTO dgii_submissions (company_id, modo, invoice_id, status, response_payload, security_code)
      VALUES (${inv.company_id}::uuid, ${inv.modo}, ${inv.id}::uuid, 'accepted',
              ${JSON.stringify({ trackId: 'T1', securityCode: CODIGO })}, ${CODIGO})
      RETURNING id`)) as unknown as { id: string }[];

    const antes = await envioVigente(inv.id, inv.company_id, inv.modo);
    ok('recien emitida, el comprobante sale con el codigo de mSeller',
      datosFirmaDeEnvio(antes).codigo === CODIGO, datosFirmaDeEnvio(antes).codigo);

    // Lo que hacia la sincronizacion ANTES: pisar el payload sin decir que fila.
    await db.execute(sql`
      UPDATE dgii_submissions
         SET response_payload = ${JSON.stringify({ ncf: 'E31', estado: 'Aceptado', mensajes: [] })}
       WHERE invoice_id = ${inv.id}::uuid`);

    const tras = await envioVigente(inv.id, inv.company_id, inv.modo);
    ok('aunque se pise el payload, la columna conserva el codigo',
      datosFirmaDeEnvio(tras).codigo === CODIGO, datosFirmaDeEnvio(tras).codigo);
    ok('CONTROL: el payload si perdio el codigo (por eso hacia falta la columna)',
      leerCodigoSeguridad(JSON.parse(tras!.responsePayload!)) === '');

    // Y una factura que nunca tuvo codigo: no se inventa ninguno.
    await db.execute(sql`
      UPDATE dgii_submissions SET security_code = NULL WHERE id = ${e.id}::uuid`);
    const sin = await envioVigente(inv.id, inv.company_id, inv.modo);
    ok('sin codigo por ningun lado, se devuelve vacio (no un sha256)',
      datosFirmaDeEnvio(sin).codigo === '', `"${datosFirmaDeEnvio(sin).codigo}"`);

    await db.execute(sql`DELETE FROM dgii_submissions WHERE invoice_id = ${inv.id}::uuid`);
    await db.execute(sql`DELETE FROM invoices WHERE id = ${inv.id}::uuid`);
  }

  console.log('\n7) El envio en diferido ya no manda 18% ni el uuid como nombre\n');

  const runners = fuente('src/infrastructure/jobRunners.ts');
  ok('la tasa sale de la linea, no de un 18% fijo',
    /taxRate:\s*tasaDeLinea\(line\)/.test(runners) && !/taxRate:\s*0\.18,/.test(runners));
  ok('y si no se puede deducir, el trabajo falla en vez de suponer',
    /no se envia a la DGII con una tasa supuesta/i.test(runners));
  ok('el nombre del articulo es el nombre, no el uuid del producto',
    /name:\s*line\.productName\s*\|\|\s*line\.productId/.test(runners));
  const repo = fuente('src/repositories/invoiceRepository.ts');
  ok('y getById si trae la tasa de cada linea', /taxRate:\s*invoiceLines\.taxRate/.test(repo));


  console.log('\n8) Todos los estados de emision dejan constancia\n');

  // EL FALLO: el registro del envio solo tenia dos ramas, 'accepted' y
  // 'signed'. Pero `finalStatus` admite cuatro. 'submitted' y 'rejected' no
  // entraban en ninguna: la factura se guardaba con ese estado y sin ninguna
  // fila en dgii_submissions. Ni constancia, ni codigo, ni nada que reintentar.
  //
  // No se noto hasta que el arreglo del estado (F1-05) hizo que una respuesta
  // sin estado reconocible fuera 'submitted' en vez de un 'accepted'
  // inventado. Arreglar la lectura y no el registro dejo al estado honesto sin
  // sitio donde vivir.
  {
    // Los bloques se sacan con las llaves emparejadas, no con una ventana de
    // N caracteres. La primera version usaba ventanas y NO cazaba su propia
    // mutacion: al borrar `securityCode` del `else`, la comprobacion seguia
    // pasando porque la ventana alcanzaba otro bloque.
    const booker = fuente('src/services/invoice/invoiceDbBooker.ts');
    const ramaAceptada = bloque(booker, "finalStatus === 'accepted'");
    const ramaFirmada  = bloque(booker, "finalStatus === 'signed'");
    const iElse = booker.indexOf('} else {', booker.indexOf("finalStatus === 'signed'"));
    const ramaResto = iElse >= 0 ? bloque(booker.slice(iElse), '} else') : '';

    ok('hay rama para accepted', ramaAceptada.includes("status: 'accepted'"));
    // La rama aceptada tambien tiene que guardar el codigo. Faltaba
    // comprobarlo: una mutacion que se lo quitaba pasaba sin que nadie chistara.
    ok('  y guarda el codigo de seguridad',
      /securityCode:\s*submission\.securityHash/.test(ramaAceptada));
    ok('hay rama para signed', ramaFirmada.includes("status: 'pending'"));
    ok('y un `else` que recoge submitted y rejected (ya no se cae ninguno)',
      ramaResto !== '', ramaResto === '' ? 'no hay else' : '');
    ok('el else inserta fila, no la omite',
      ramaResto.includes('insert(dgiiSubmissions)'));
    ok('y guarda el codigo de seguridad si vino',
      /securityCode:\s*submission\.securityHash/.test(ramaResto));
    ok('pero NO encola un reenvio (duplicaria un e-CF ya mandado)',
      !ramaResto.includes('addJob('));
  }

  // LIMITE CONOCIDO DE ESTA SECCION: comprueba el CODIGO, no el comportamiento.
  // Caza que una rama desaparezca, o que deje de guardar el codigo, o que
  // encole un reenvio -- todas ellas mutaciones reales y todas cazadas. No caza
  // un `if (false)` delante del insert, porque el texto sigue ahi. Para eso
  // haria falta ejecutar la transaccion de emision entera, con su cola y su
  // mSeller. Se dice aqui para que nadie lea mas garantia de la que hay.
  {
    const sync = fuente('src/app/api/v1/ecf/[id]/dgii-status/route.ts');
    const sinEnvio = bloque(sync, 'if (!envio)');
    ok('la sincronizacion crea la constancia que falte, en vez de no tocar nada',
      sinEnvio.includes('insert(dgiiSubmissions)') &&
      /securityCode:\s*leerCodigoSeguridad/.test(sinEnvio));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
