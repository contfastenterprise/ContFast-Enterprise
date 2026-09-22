/**
 * Lote 180 -- la factura se imprime en el acto, con su timbre, sin esperar al
 * veredicto de la DGII.
 *
 * POR QUE
 * -------
 * Habia dos creencias contrarias en el codigo, y las dos falsas a medias.
 * Medido el 2026-09-22 contra PRODUCCION (solo lectura):
 *
 *  1. `invoices/page.tsx` no imprimia hasta `accepted`, y su comentario decia
 *     que el codigo de seguridad, la fecha de firma y el QR "los produce la
 *     DGII al firmar y todavia no existen". FALSO: los produce mSeller y vienen
 *     en la respuesta del envio. Las 12 respuestas mas recientes traen
 *     `rnc, ecf, internalTrackId, securityCode, qr_url, signedDate`, y
 *     `invoiceDbBooker` las guarda en la factura en la misma transaccion.
 *
 *  2. `documentTemplates` colgaba el QR de `accepted`, porque un RECHAZADO trae
 *     esos mismos datos. CIERTO -- y vuelto a comprobar: E440000000001,
 *     E440000000002 (rechazados) y E340000000002 (dada de baja) recibieron una
 *     respuesta con la MISMA forma que una exitosa.
 *
 * Y del envio al veredicto la mediana medida es de 20 SEGUNDOS: solo un 4% de
 * las facturas lo tiene a los 2 s, y un 15% a los 5 s. Esperarlo con un cliente
 * delante no sale a cuenta.
 *
 * LA DISTINCION: el QR es el TIMBRE, un dato del documento. Lo que no puede
 * afirmarse sin veredicto es la LEYENDA. Se deciden por separado, y esa es la
 * regla que este banco EJECUTA.
 *
 * Decision del dueño (2026-09-22): se imprime inmediatamente salvo que el envio
 * haya fallado.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..');
const leer = (p: string) => (existsSync(join(raiz, p)) ? readFileSync(join(raiz, p), 'utf8') : '');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => { console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`); if (!c) fallos++; };
const falta = (t: string, motivo: string) => ok(t, false, motivo);

const REGLA = 'src/services/invoice/timbreDelComprobante.ts';
const PLANTILLA = 'src/utils/templates/documentTemplates.ts';
const PANTALLA = 'src/app/dashboard/invoices/page.tsx';
const BOOKER = 'src/services/invoice/invoiceDbBooker.ts';

/** El timbre tal como lo devuelve mSeller (ejemplo de su documentacion). */
const TIMBRE = {
  securityCode: 'fWCZCV',
  signatureDate: '14-05-2025 02:57:33',
  qrUrl: 'https://ecf.dgii.gov.do/testecf/consultatimbre?rncemisor=102320705&encf=E310000009175',
};

async function main() {
  // Valen en los DOS estados: lo que el lote cambia es cuando se imprime y que
  // dice el papel, no que la firma se guarde ni que exista la plantilla.
  const booker = leer(BOOKER);
  if (!/securityCode: codigoFirma/.test(booker) || !/qrUrl: enlaceQr/.test(booker)) {
    throw new Error('Precondicion: la emision ya no guarda el timbre en la factura');
  }
  if (!/renderInvoice/.test(leer(PLANTILLA))) {
    throw new Error('Precondicion: ya no hay plantilla de factura');
  }
  console.log('  pre   la emision guarda codigo de seguridad, fecha de firma y QR en la factura');

  console.log('\n1) La regla, ejecutada\n');
  let T: typeof import('../src/services/invoice/timbreDelComprobante') | null = null;
  try { T = await import('../src/services/invoice/timbreDelComprobante'); } catch { T = null; }

  const ETIQUETAS = [
    'una factura recien emitida SI se imprime',
    '  y su papel lleva el timbre',
    '  pero NO dice que la firma sea valida',
    'una aceptada dice que la firma es valida',
    'una rechazada NO se imprime sola',
    '  y su papel no lleva timbre ni codigo',
    'sin timbre no se imprime, aunque no haya rechazo',
    'el motivo de no imprimir se puede decir',
  ];

  if (!T) {
    for (const t of ETIQUETAS) falta(t, `no existe ${REGLA}`);
  } else {
    const { sePuedeImprimirYa, motivoParaNoImprimirYa, rotuloDelTimbre, hayTimbre, firmaConfirmada, seImprimeElTimbre } = T;

    // EL CASO NORMAL: emitida, con timbre, sin veredicto.
    const emitida = { ...TIMBRE, estadoFiscal: 'submitted' };
    ok(ETIQUETAS[0], sePuedeImprimirYa(emitida) === true);
    const rEmitida = rotuloDelTimbre(emitida);
    ok(ETIQUETAS[1], rEmitida.conQr === true && rEmitida.conCodigo === true);
    ok(ETIQUETAS[2], rEmitida.clase === 'pendiente' && !/[Vv]álida/.test(rEmitida.titulo), rEmitida.titulo);
    ok('  y dice que el timbre consta, para que no parezca que falta', /timbre/i.test(rEmitida.detalle), rEmitida.detalle);

    const aceptada = { ...TIMBRE, estadoFiscal: 'accepted' };
    const rAceptada = rotuloDelTimbre(aceptada);
    ok(ETIQUETAS[3], rAceptada.clase === 'valida' && /Válida/.test(rAceptada.titulo), rAceptada.titulo);
    ok('  y tambien se imprime, claro', sePuedeImprimirYa(aceptada) === true);

    // LOS TRES CASOS REALES: rechazado y dado de baja traen timbre igual.
    for (const estado of ['rejected', 'void']) {
      const mala = { ...TIMBRE, estadoFiscal: estado };
      ok(`${ETIQUETAS[4]} (${estado})`, sePuedeImprimirYa(mala) === false);
      const r = rotuloDelTimbre(mala);
      ok(`${ETIQUETAS[5]} (${estado})`, r.conQr === false && r.conCodigo === false);
      ok(`  y lo dice sin rodeos (${estado})`, /RECHAZADO/.test(r.titulo) && /NO tiene validez/.test(r.detalle));
    }

    // La firma no se afirma NUNCA sin veredicto, con timbre o sin el.
    const sinVeredicto = ['submitted', 'signed', 'pending', null, undefined, ''];
    ok('la firma valida exige veredicto, en todos los estados que no lo son',
      sinVeredicto.every((e) => rotuloDelTimbre({ ...TIMBRE, estadoFiscal: e }).clase !== 'valida'));
    ok('  y `firmaConfirmada` es lo unico que la concede',
      sinVeredicto.every((e) => !firmaConfirmada({ ...TIMBRE, estadoFiscal: e }))
      && firmaConfirmada(aceptada));

    // SIN timbre: es el comprobante provisional que un lote anterior quito.
    const sinTimbre = { estadoFiscal: 'submitted', securityCode: null, signatureDate: null, qrUrl: null };
    ok(ETIQUETAS[6], sePuedeImprimirYa(sinTimbre) === false);
    const rSin = rotuloDelTimbre(sinTimbre);
    ok('  y su papel no promete un timbre que no hay', rSin.conQr === false && rSin.conCodigo === false);
    // Media firma no es firma: con codigo y sin fecha el papel no puede rotular.
    ok('  ni con solo la mitad del timbre',
      hayTimbre({ estadoFiscal: 'submitted', securityCode: 'fWCZCV', signatureDate: null }) === false
      && hayTimbre({ estadoFiscal: 'submitted', securityCode: null, signatureDate: '14-05-2025' }) === false);
    ok('  ni con cadenas vacias o en blanco',
      hayTimbre({ securityCode: '  ', signatureDate: '  ' }) === false
      && hayTimbre({ securityCode: '', signatureDate: '' }) === false);

    ok(ETIQUETAS[7],
      motivoParaNoImprimirYa(emitida) === null
      && /rechaz/i.test(motivoParaNoImprimirYa({ ...TIMBRE, estadoFiscal: 'rejected' }) ?? '')
      && /timbre/i.test(motivoParaNoImprimirYa(sinTimbre) ?? ''));

    // `seImprimeElTimbre` y el rotulo no pueden discrepar: si discreparan, el
    // papel pintaria un QR sin su codigo, o al contrario.
    for (const e of ['submitted', 'accepted', 'rejected', 'void', 'signed', null]) {
      const inv = { ...TIMBRE, estadoFiscal: e };
      ok(`el QR y el rotulo van de la mano (${String(e)})`,
        seImprimeElTimbre(inv) === rotuloDelTimbre(inv).conQr);
    }
  }

  console.log('\n2) La plantilla usa la regla, no una copia\n');
  const plantilla = leer(PLANTILLA);
  const codigoPlantilla = sinComentarios(plantilla);
  ok('importa la regla', /from '@\/services\/invoice\/timbreDelComprobante'/.test(plantilla));
  ok('el QR se pinta segun el ROTULO, no segun el estado',
    (codigoPlantilla.match(/rotulo\.conQr && qrBase64/g) || []).length === 2,
    `${(codigoPlantilla.match(/rotulo\.conQr && qrBase64/g) || []).length} sitios`);
  ok('  y ya no cuelga de `accepted`', !/hayFirma && qrBase64/.test(codigoPlantilla));
  ok('el titulo y el detalle salen del rotulo',
    /rotulo\.titulo/.test(codigoPlantilla) && /rotulo\.detalle/.test(codigoPlantilla));
  // Si "Firma Digital Valida" estuviera escrito en la plantilla, la plantilla
  // podria rotularlo por su cuenta y la regla no serviria de nada.
  ok('la leyenda de validez NO se escribe en la plantilla',
    !/Firma Digital Válida/.test(codigoPlantilla));
  // El defecto que introduce imprimir un timbre sin veredicto: el papel rotula
  // "Fecha Firma" y hay que poner la de FIRMA, no la de emision.
  ok('bajo "Fecha Firma" va la fecha de firma, no la de emision',
    /rotulo\.conCodigo \? inv\.signatureDate : inv\.createdAt/.test(codigoPlantilla));

  console.log('\n3) La pantalla imprime en el acto\n');
  const pantalla = leer(PANTALLA);
  const codigoPantalla = sinComentarios(pantalla);
  ok('no espera el veredicto para imprimir',
    !/postAction === 'print' && estadoEmitido === 'accepted'/.test(codigoPantalla));
  ok('  decide con la regla, no con el estado',
    /motivoParaNoImprimirYa\(data\.data\)/.test(codigoPantalla)
    && /from '@\/services\/invoice\/timbreDelComprobante'/.test(pantalla));
  // El navegador solo deja abrir ventanas dentro del gesto del usuario: con un
  // `setTimeout` la bloquea y el papel no sale.
  ok('imprime DENTRO del clic, sin setTimeout',
    !/setTimeout\(abrirImpresion/.test(codigoPantalla));
  // APRETADA: el texto del bloqueo ya existia antes del lote, en la consulta
  // de los 5 segundos, asi que mirarlo a secas regalaba un OK en la
  // contraprueba. Lo que este lote añade es el respaldo del camino
  // INMEDIATO, y es eso lo que se ancla.
  ok('  y si el navegador la bloquea, ofrece el boton',
    /else if \(!abrirImpresion\(\)\) \{/.test(codigoPantalla)
    && /bloqueó la ventana de impresión/.test(pantalla) && /label: 'Imprimir'/.test(pantalla));
  ok('cuando no se puede imprimir, se dice por que',
    /El comprobante no se imprime todavía/.test(pantalla));
  // Si la consulta de cortesia volviera a imprimir, saldrian DOS papeles del
  // mismo comprobante: uno "Pendiente" y otro "Firma Digital Valida".
  ok('la consulta de los 5 s ya no imprime otra vez',
    !/postAction === 'print' \? abrirImpresion\(\) : true/.test(codigoPantalla));
  ok('  ofrece reimprimir cuando llega la aceptacion',
    /Reimprimir con la firma/.test(pantalla));
  // Lo que se imprimio antes del veredicto puede acabar rechazado: ese papel
  // esta fuera y no vale. Callarlo seria dejarlo circular.
  ok('si la DGII rechaza despues de imprimir, se avisa de que el papel no vale',
    /NO tiene validez fiscal: recupéralo/.test(pantalla));

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

void main();
