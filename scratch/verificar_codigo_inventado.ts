import { crudo as crudoCrudo } from './_fuente';

const crudo = (rutaRelativa: string): string => crudoCrudo(rutaRelativa).replace(/\r\n/g, '\n');

let fallos = 0;

function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

// ═══════ El PDF que se manda al cliente llevaba un codigo de seguridad inventado ═══════
// `invoiceFileGenerator` fabricaba el codigo cuando mSeller no lo devolvia: un
// sha256 de `signedXml`, que no era el XML firmado sino la cadena literal
// '<ECF>Firmado asincronamente</ECF>' -- una CONSTANTE. El codigo era por tanto
// siempre el mismo (C71D2DC8464CDC7A) y acababa impreso en el QR de toda factura
// emitida antes de que la DGII resolviera, dentro de una URL de consulta de la
// DGII que no puede responder por un codigo que no existe. Y ese PDF es el que
// se le manda al cliente por correo.
//
// Era la ultima copia viva del patron que ya se elimino de las cuatro rutas de
// impresion y correo (ver el comentario de invoices/[id]/print). El guardia que
// hay en este mismo archivo -- "sin codigo, mejor sin QR" -- no disparaba nunca
// porque la fabricacion se aseguraba de que el codigo jamas estuviera vacio.

const s = crudo('src/services/invoice/invoiceFileGenerator.ts');

ok(
  'el codigo de seguridad es el de mSeller, o ninguno',
  s.includes("const securityHash = submission.securityHash || '';")
);
ok('ya no se fabrica con sha256', !s.includes("crypto.createHash('sha256')"));
ok('desaparece el import de crypto, que solo servia para eso', !s.includes("import crypto from 'crypto';"));
ok(
  'desaparecen las cadenas que alimentaban la invencion',
  !s.includes('<ECF>Firmado asíncronamente</ECF>\';') && !s.includes('<ECF>Generado asíncronamente</ECF>\';')
);
ok('la nota deja constancia del valor concreto que se imprimia', s.includes('C71D2DC8464CDC7A'));
ok('la nota explica que el guardia del QR no llegaba a disparar', s.includes('no disparaba NUNCA'));
ok(
  'el guardia que evita el QR sin codigo ahora SI puede disparar',
  s.includes('if (urlConsulta) qrBase64 = await PdfGenerator.generateQrBase64(urlConsulta);') &&
    !s.includes("crypto.createHash('sha256')")
);

// El correo al cliente espera al veredicto: mandar el PDF antes es mandarle un
// comprobante sin codigo y sin QR, y ese correo ya no se recoge.
ok(
  'el correo al cliente solo sale si la DGII ya acepto',
  s.includes("if (data.customerId && submission.finalStatus === 'accepted') {")
);
ok('ya no se manda por el mero hecho de haber cliente', !s.includes('if (data.customerId) {\n        try {'));
ok(
  'la nota explica por que el correo no puede salir antes del veredicto',
  s.includes('ese correo ya no se puede recoger')
);
ok('la nota remite al boton de reenviar mientras tanto', s.includes('boton de reenviar de la pantalla'));

console.log(`\nTotal fallos: ${fallos}`);
process.exit(fallos > 0 ? 1 : 0);
