/**
 * Lote 218 -- una factura recien emitida se imprime SIN la leyenda "Pendiente
 * de confirmacion de la DGII".
 *
 * POR QUE
 * -------
 * Decision del dueño (2026-09-28). Desde el lote 180 la factura se imprime en
 * el clic, antes del veredicto (mediana medida: 20 s), y el papel rotulaba
 * "Pendiente de confirmacion de la DGII". Era cierto, pero se lee como un
 * problema en un documento que se entrega al cliente, y no es lo que pide la
 * representacion impresa. La documentacion de mSeller
 * (docs.ecf.mseller.app/docs/integration/documents, "Respuesta exitosa") dice
 * que `securityCode` y `qr_url` llegan AL INSTANTE "para la factura impresa" y
 * que el veredicto se consulta "unos segundos despues". El papel ya tiene lo
 * que necesita; lo que falta es el veredicto, y eso deja de rotularse.
 *
 * LO QUE NO CAMBIA, y es lo que este banco vigila tanto como el cambio:
 *   · "Firma Digital Valida" solo con `accepted`;
 *   · un rechazado o una baja dicen "RECHAZADO POR LA DGII";
 *   · un comprobante SIN timbre (envio fallido) sigue diciendo que esta
 *     pendiente: ahi el papel no tiene nada que lo respalde.
 *
 * El papel se DIBUJA (`renderInvoice`, los tres formatos), no se lee el texto
 * de la plantilla: una linea vacia con su `<br>` o un `<strong></strong>`
 * suelto son HTML perfectamente valido y ninguna comprobacion de forma los ve.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
/**
 * Lo que el lote NO debe cambiar. Es cierto antes y despues, asi que como `ok()`
 * regalaria un OK en la contraprueba: si se rompe, el banco se niega (codigo 3).
 */
const invariante = (t: string, c: boolean, d = '') => {
  if (!c) { console.log(` ROTO   ${t}${d ? ` -- ${d}` : ''}`); process.exit(3); }
  console.log(`  inv   ${t}`);
};

const PENDIENTE = /Pendiente de confirmaci[oó]n de la DGII/;
const TIMBRE = {
  securityCode: 'fWCZCV',
  signatureDate: '2025-05-14T02:57:33',
  qrUrl: 'https://ecf.dgii.gov.do/testecf/consultatimbre?rncemisor=102320705&encf=E310000009175',
};
const QR = 'data:image/png;base64,iVBORw0KGgo=';
const LAYOUTS = ['carta', '80mm', '58mm'] as const;

function factura(extra: Record<string, unknown>) {
  const invoice = {
    id: 'x', ncf: 'E310000009175', ecfType: '31', createdAt: '2026-09-28T14:00:00Z',
    paymentType: 'cash', subtotal: 100, discount: 0, totalTaxes: 18, total: 118, totalNet: 118,
    totalRetained: 0, retentions: [],
    ...TIMBRE, ...extra,
  };
  return {
    company: { name: 'EMPRESA DE PRUEBA', rnc: '102320705', address: 'C/ Uno', phone: '809' },
    customer: { name: 'CLIENTE', rnc: '101010101' },
    invoice,
    lines: [{ productName: 'Puerta', productSku: 'P1', quantity: 1, unitPrice: 100, discount: 0, taxRate: 18, total: 100 }],
    taxes: [],
  };
}

async function main() {
  // Valen en los DOS estados: el lote cambia la leyenda, no la regla de firma.
  const regla = leer('src/services/invoice/timbreDelComprobante.ts');
  if (!/if \(firmaConfirmada\(inv\)\)/.test(regla) || !/RECHAZADO POR LA DGII/.test(regla)) {
    throw new Error('Precondicion: la regla ya no distingue aceptado y rechazado');
  }
  console.log('  pre   la regla distingue aceptado, rechazado y sin veredicto');

  const T = await import('../src/services/invoice/timbreDelComprobante');
  const { DocumentTemplates } = await import('../src/utils/templates/documentTemplates');

  console.log('\n1) La regla, ejecutada\n');
  const r = T.rotuloDelTimbre({ ...TIMBRE, estadoFiscal: 'submitted' });
  ok('recien emitida: sin titulo de estado', r.titulo === '', r.titulo);
  ok('  ni linea de detalle', r.detalle === '', r.detalle);
  invariante('  pero con su codigo y su QR', r.conCodigo && r.conQr);
  invariante('  y sigue sin ser "valida"', r.clase !== 'valida');
  for (const e of ['signed', 'pending', null, '']) {
    const x = T.rotuloDelTimbre({ ...TIMBRE, estadoFiscal: e });
    ok(`  igual en estado ${JSON.stringify(e)}`, x.titulo === '' && x.clase !== 'valida');
  }
  const sin = T.rotuloDelTimbre({ estadoFiscal: 'submitted', securityCode: null, signatureDate: null });
  invariante('SIN timbre sigue diciendo que esta pendiente', PENDIENTE.test(sin.titulo), sin.titulo);

  console.log('\n2) El papel, dibujado en los tres formatos\n');
  for (const layout of LAYOUTS) {
    const html = DocumentTemplates.renderInvoice(factura({ estadoFiscal: 'submitted' }), layout, QR);
    ok(`${layout}: la emitida no dice "Pendiente de confirmacion"`, !PENDIENTE.test(html));
    // Atada a la ausencia de la leyenda: sola seria cierta ya antes del lote
    // (el titulo no estaba vacio), y es lo que caza pintar un titulo vacio.
    ok(`${layout}:   y sin negrita vacia ni linea en blanco en su lugar`,
      !PENDIENTE.test(html)
      && !/<strong>\s*<\/strong>/.test(html) && !/>\s*<br>\s*C[oó]digo de [Ss]eguridad/.test(html));
    invariante(`${layout}:   lleva su codigo de seguridad y su QR`,
      html.includes('fWCZCV') && html.includes(QR));
    invariante(`${layout}:   y no dice "valida"`, !/Firma Digital Válida/.test(html));

    const acep = DocumentTemplates.renderInvoice(factura({ estadoFiscal: 'accepted' }), layout, QR);
    invariante(`${layout}: la aceptada dice "Firma Digital Valida"`, /Firma Digital Válida/.test(acep));

    const rech = DocumentTemplates.renderInvoice(factura({ estadoFiscal: 'rejected' }), layout, QR);
    invariante(`${layout}: la rechazada lo dice, sin codigo ni QR`,
      /RECHAZADO POR LA DGII/.test(rech) && !rech.includes('fWCZCV') && !rech.includes(QR));

    const sinT = DocumentTemplates.renderInvoice(
      factura({ estadoFiscal: 'submitted', securityCode: null, signatureDate: null, qrUrl: null }), layout, QR);
    invariante(`${layout}: sin timbre dice que esta pendiente`, PENDIENTE.test(sinT));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
