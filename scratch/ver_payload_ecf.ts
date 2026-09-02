/**
 * Enseña el e-CF EXACTO que se le mandaria a mSeller, sin mandarlo.
 *
 * POR QUE EXISTE
 * --------------
 * El e-44 se rechazo dos veces y cada rechazo quemo un NCF de la secuencia
 * autorizada (`secuenciaUtilizada: true` viene en la propia respuesta). Estabamos
 * usando a la DGII como banco de pruebas, y cobra caro.
 *
 * Esto construye el documento con el codigo REAL -- el mismo `buildECFPayload`
 * que usa la emision -- y lo imprime. Sin red, sin secuencia, sin nada que
 * quemar. Lo que se ve aqui es literalmente lo que saldria.
 *
 * USO
 *   npx tsx scratch/ver_payload_ecf.ts            # e-44 exento (el caso roto)
 *   npx tsx scratch/ver_payload_ecf.ts 31         # factura normal al 18%
 *   npx tsx scratch/ver_payload_ecf.ts 44 gravado # e-44 mal formado: debe parar
 */
import { MSellerClient } from '../src/services/dgii/msellerClient';

const tipo = process.argv[2] || '44';
const modo = process.argv[3] || 'exento';

const tasa = modo === 'gravado' ? 0.18 : 0;
const base = 5000;
const impuestos = Number((base * tasa).toFixed(2));

console.log(`\n  tipo e-${tipo} | linea de ${base} al ${tasa * 100}%\n`);

try {
  const payload = MSellerClient.buildECFPayload({
    ncf: `E${tipo}0000000099`,
    ecfType: tipo,
    sequenceExpiry: '31-12-2027',
    paymentType: '1',
    issueDate: new Date(),
    emitterRnc: '132796845',
    emitterName: 'Latin Doors S.R.L',
    emitterAddress: 'Santiago, R.D.',
    buyerRnc: '101010101',
    buyerName: 'Cliente de prueba',
    subtotal: base,
    totalTaxes: impuestos,
    total: base + impuestos,
    lines: [{
      index: 1, name: 'Servicio', quantity: 1, unitPrice: base,
      discount: 0, taxRate: tasa, taxCategory: tasa === 0 ? 'exento' : null,
    }],
  });

  console.log(JSON.stringify(payload, null, 2));

  // Las tres reglas que la DGII nombro al rechazar el e-44. Se comprueban
  // aqui, sobre el documento ya construido, antes de que salga.
  if (tipo === '44') {
    const enc: any = payload.ECF.Encabezado;
    const pag: any = (payload.ECF as any).Paginacion?.Pagina?.[0];
    const sobra = (obj: any, campos: string[]) =>
      campos.filter((c) => obj && obj[c] !== undefined);

    const problemas = [
      ...sobra(enc.IdDoc, ['IndicadorMontoGravado']).map((c) => `IdDoc.${c}`),
      ...sobra(enc.Totales, ['MontoGravadoTotal','MontoGravadoI1','MontoGravadoI2',
        'MontoGravadoI3','ITBIS1','ITBIS2','ITBIS3','TotalITBIS','TotalITBIS1',
        'TotalITBIS2','TotalITBIS3','MontoNoFacturable']).map((c) => `Totales.${c}`),
      ...sobra(pag, ['SubtotalMontoGravadoPagina','SubtotalMontoGravado1Pagina',
        'SubtotalItbisPagina','SubtotalItbis1Pagina','SubtotalMontoNoFacturablePagina'])
        .map((c) => `Pagina.${c}`),
    ];

    console.log('\n  ── Comprobacion del e-44 ──');
    if (problemas.length === 0) {
      console.log('  OK  ningun campo de gravado. La DGII no deberia rechazarlo por esto.');
    } else {
      console.log('  MAL  sobran, y la DGII los va a rechazar:');
      for (const p of problemas) console.log(`       - ${p}`);
    }
  }
  console.log('');
} catch (err: any) {
  console.log(`  SE DETUVO ANTES DE ENVIAR (que es lo que se quiere):\n\n  ${err.message}\n`);
}
