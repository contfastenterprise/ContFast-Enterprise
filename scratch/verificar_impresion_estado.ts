/**
 * Lo que se AFIRMA en pantalla y en el papel tiene que salir del ESTADO.
 *
 * POR QUE ESTE BANCO EXISTE APARTE
 * --------------------------------
 * Todo lo que comprueba se lee del codigo fuente, no de la base de datos. Al
 * separarlo de `verificar_mseller.ts` (que si consulta `dgii_submissions`)
 * se puede ejecutar en cualquier sitio, sin `DATABASE_URL`, incluido un
 * portatil recien clonado:
 *
 *     npx tsx scratch/verificar_impresion_estado.ts
 *
 * EL FALLO QUE LO ORIGINA -- Y ERA MIO
 * ------------------------------------
 * Al arreglar el codigo de seguridad fabricado, colgue la leyenda "Firma
 * Digital Valida" de que EXISTIERA un codigo. Parecia razonable: sin codigo,
 * sin firma.
 *
 * Es falso. mSeller devuelve `securityCode` Y `qr_url` AUNQUE la DGII rechace.
 * Comprobado en sus datos de produccion:
 *
 *     E440000000001   rejected   codigo JW0T3M
 *     E440000000002   rejected   codigo CeCnNu
 *
 * Con mi version, esos dos comprobantes RECHAZADOS se habrian impreso como
 * firmados validos, con su QR apuntando a la consulta de la DGII. Un codigo
 * presente no significa aceptado: significa que mSeller contesto.
 *
 * La leyenda sale del estado fiscal, y de nada mas.
 */
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

console.log('\n1) La firma se afirma por el ESTADO, no por tener codigo\n');

{
  const tpl = fuente('src/utils/templates/documentTemplates.ts');
  ok('la firma exige estado aceptado, no solo codigo',
    /const hayFirma = inv\.estadoFiscal === 'accepted'/.test(tpl));
  ok('un rechazado se distingue de un pendiente',
    /const rechazado = inv\.estadoFiscal === 'rejected'/.test(tpl));
  ok('y el QR tampoco se imprime sin firma valida',
    (tpl.match(/hayFirma && qrBase64/g) || []).length === 2,
    String((tpl.match(/hayFirma && qrBase64/g) || []).length));
  ok('un rechazado lo DICE en el papel',
    /RECHAZADO POR LA DGII/.test(tpl));
  ok('y un pendiente no se hace pasar por firmado',
    /Pendiente de confirmaci.n de la DGII/.test(tpl));

  for (const r of ['src/app/api/v1/invoices/[id]/print/route.ts',
                   'src/app/api/v1/invoices/[id]/pdf/route.ts',
                   'src/app/api/v1/invoices/[id]/email/route.ts']) {
    ok(`${r.split('/').slice(-2).join('/')}: pasa el estado a la plantilla`,
      /estadoFiscal:/.test(fuente(r)));
  }
}

console.log('\n2) El aviso al emitir dice el estado real\n');

// Decia SIEMPRE "emitido y firmado". Con un comprobante en 'submitted', el
// aviso afirmaba una firma mientras el listado ponia ENVIADO: dos pantallas
// contradiciendose, y la que mentia era la mas visible. Es la explicacion mas
// probable del "solo me dice enviado" que reporto el usuario.
{
  const form = fuente('src/app/dashboard/invoices/page.tsx');
  ok('el aviso mira el estado devuelto',
    /const estadoEmitido = data\.data\?\.status/.test(form));
  ok('distingue submitted de accepted',
    /estadoEmitido === 'submitted'/.test(form) && /estadoEmitido === 'accepted'/.test(form));
  ok('y avisa cuando quedo solo local (signed)',
    /estadoEmitido === 'signed'/.test(form));
}

console.log('\n3) El dialogo de confirmacion nombra el comprobante correcto\n');

{
  const form = fuente('src/app/dashboard/invoices/page.tsx');
  ok('ya no cae en "Consumo (e-32)" por defecto',
    !/:\s*'Consumo \(e-32\)'/.test(form));
  ok('lee de la lista unica de tipos',
    /nombreCortoTipo\(ecfType\)/.test(form));
  ok('y si no reconoce el tipo, LO DICE',
    /TIPO NO RECONOCIDO/.test(form));
}

console.log('\n4) La firma se guarda EN LA FACTURA al emitir, no al sincronizar\n');

// mSeller firma en el momento del envio y devuelve `securityCode` y `qr_url`
// ahi mismo; el VEREDICTO de la DGII llega despues, al consultar el estado.
// Son dos momentos distintos.
//
// `CreateInvoiceInput` no tenia estos campos, asi que la firma aterrizaba solo
// en `dgii_submissions` y la factura se quedaba sin ella. Sintoma reportado por
// el cliente: "tengo que sincronizar para que me de la firma, el QR y el
// codigo". Confirmado en sus datos: dos envios en 'submitted' con codigo en el
// envio, y solo uno de los dos con codigo en la factura.
{
  const repo = fuente('src/repositories/invoiceRepository.ts');
  const desde = repo.indexOf('interface CreateInvoiceInput');
  const tipo = repo.slice(desde, repo.indexOf('lines: {', desde));
  ok('CreateInvoiceInput admite la firma',
    /securityCode\?: string \| null;/.test(tipo)
    && /signatureDate\?: string \| null;/.test(tipo)
    && /qrUrl\?: string \| null;/.test(tipo));

  const ins = repo.slice(repo.indexOf('.insert(invoices)'), repo.indexOf('.returning()'));
  ok('y el INSERT los escribe',
    /securityCode: data\.securityCode/.test(ins)
    && /signatureDate: data\.signatureDate/.test(ins)
    && /qrUrl: data\.qrUrl/.test(ins));

  const booker = fuente('src/services/invoice/invoiceDbBooker.ts');
  ok('el booker lee la firma de la respuesta de mSeller',
    /leerDatosFirma\(submission\.msellerResponsePayload\)/.test(booker));
  ok('y se la pasa a la factura',
    /securityCode: codigoFirma/.test(booker)
    && /signatureDate: fechaFirma/.test(booker)
    && /qrUrl: enlaceQr/.test(booker));
  ok('sin inventar nada cuando no vino',
    /const codigoFirma = submission\.securityHash\?\.trim\(\) \|\| firma\.codigo \|\| null;/.test(booker));
}

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
process.exit(fallos === 0 ? 0 : 1);
