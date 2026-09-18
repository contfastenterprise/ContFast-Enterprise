/**
 * El QR impreso sale de mSeller. Ya no se arma ningun enlace de la DGII.
 *
 * EL HUECO (lote 156)
 * -------------------
 * Cuando mSeller no habia mandado `qr_url`, los cuatro sitios que imprimen
 * armaban `https://ecf.dgii.gov.do/e-cf/Consulta?...`, que el portal responde
 * con 404: un comprobante fiscal con un QR que no valida. Medido antes: hoy
 * ninguna factura esta en ese caso (0 de 71).
 *
 * EL CIERRE. Decidido por el dueño el 2026-09-18: si falta el QR se le pide a
 * mSeller (`getDocumentStatus`), se guarda en la factura y, si mSeller tampoco
 * lo tiene, se imprime sin QR.
 *
 * Se EJECUTAN la lectura de la respuesta y el plazo; el cableado se lee.
 * LO QUE NO PRUEBA: la llamada real a mSeller (hace falta su servidor).
 */
import fs from 'fs';
import { fuente } from './_fuente';

//  El modulo lo CREA este lote: leerlo con `fuente()` a secas hace reventar la
//  contraprueba con ENOENT en vez de fallar comprobacion a comprobacion.
const leer = (ruta: string) => (fs.existsSync(ruta) ? fuente(ruta) : '');

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

const SITIOS = [
  'src/app/api/v1/invoices/[id]/print/route.ts',
  'src/app/api/v1/invoices/[id]/pdf/route.ts',
  'src/services/invoice/invoiceFileGenerator.ts',
  'src/services/invoice/correoFactura.ts',
];

async function main() {
  console.log('\n0) Precondiciones\n');
  const fuentes = SITIOS.map((s) => [s, fuente(s)] as const);
  exige('los cuatro sitios siguen dibujando el QR con generateQrBase64',
    fuentes.every(([, f]) => /PdfGenerator\.generateQrBase64\(/.test(f)));
  exige('y siguen prefiriendo el QR que ya consta', fuentes.every(([, f]) => /if \((firma\.qr|submission\.qrCode)\)/.test(f)));

  let m: typeof import('../src/services/dgii/qrDelComprobante') | null = null;
  try { m = await import('../src/services/dgii/qrDelComprobante'); } catch { m = null; }

  console.log('\n1) Lo que se saca de la respuesta de mSeller\n');
  const qr = (r: unknown) => m?.qrDeLaRespuesta(r as never) ?? 'SIN MODULO';
  ok('respuesta con qr_url: ese es el enlace',
    qr({ success: true, rawResponse: { qr_url: 'https://ecf.dgii.gov.do/ecf/consultatimbre?x=1' } }) === 'https://ecf.dgii.gov.do/ecf/consultatimbre?x=1');
  ok('consulta fallida o vacia: sin enlace',
    qr({ success: false, rawResponse: { qr_url: 'https://x/y' } }) === '' && qr(null) === '' && qr({ success: true, rawResponse: {} }) === '');
  ok('un qr que no es una direccion no se imprime', qr({ success: true, rawResponse: { qr_url: 'JW0T3M' } }) === '');

  console.log('\n2) El plazo: imprimir no espera a mSeller mas de la cuenta\n');
  ok('el plazo de impresion es mas corto que el de la consulta de estado (15 s)',
    !!m && m.MS_QR_IMPRESION === 6_000);
  {
    const lento = new Promise((r) => setTimeout(() => r('tarde'), 300));
    const rapido = Promise.resolve('a tiempo');
    ok('lo que llega a tiempo se usa', !!m && (await m.conPlazo(rapido, 100)) === 'a tiempo');
    ok('lo que tarda de mas se descarta sin colgar la impresion', !!m && (await m.conPlazo(lento, 50)) === null);
    //  La promesa rota se crea aqui mismo: creada antes, Node la da por
    //  rechazada sin manejar y tumba el banco.
    ok('un fallo de mSeller no se propaga', !!m && (await m.conPlazo(Promise.reject(new Error('mseller caido')), 100)) === null);
  }

  console.log('\n3) El cableado\n');
  {
    const mod = leer('src/services/dgii/qrDelComprobante.ts');
    ok('pregunta a mSeller con el entorno del MODO de la factura, no con el de los ajustes',
      /const entorno = entornoDgii\(p\.modo\);/.test(mod) && /credencialesMseller\(p\.companyId, entorno\)/.test(mod)
      && /cliente\.getDocumentStatus\(p\.ncf\)/.test(mod));
    ok('guarda el enlace en la factura, acotando empresa y modo',
      //  Con la unica guarda que le toca -- que haya factura donde guardarlo --:
      //  si no, `if (false)` colaba por delante y la comprobacion no lo veia.
      /if \(p\.invoiceId\) \{\s*await db\s*\.update\(invoices\)\s*\.set\(\{ qrUrl: qr \}\)\s*\.where\(and\(\s*eq\(invoices\.id, p\.invoiceId\),\s*eq\(invoices\.companyId, p\.companyId\),\s*eq\(invoices\.modo, p\.modo\)\s*\)\);\s*\}/.test(mod));
    ok('no lanza nunca: sin NCF, sin QR o con error, devuelve cadena vacia',
      /if \(!p\.ncf\) return '';/.test(mod) && /catch \(err: unknown\) \{/.test(mod) && /return '';\s*\}\s*\}$/m.test(mod.trimEnd())
      && !/throw /.test(mod));
    ok('el QR ya guardado se devuelve sin preguntar nada',
      /const guardado = \(p\.qrGuardado \|\| ''\)\.trim\(\);\s*if \(guardado\) return guardado;/.test(mod));
  }
  for (const [ruta, f] of fuentes) {
    ok(`${ruta.split('/').pop()}: pide el QR a mSeller y ya no arma el enlace de la DGII`,
      //  La ASIGNACION, no una llamada cualquiera: `const enlace = ""` con la
      //  llamada muerta al lado dejaba pasar la comprobacion.
      /const enlace = await qrDelComprobante\(\{/.test(f) && /if \(enlace\) qrBase64 = await PdfGenerator\.generateQrBase64\(enlace\);/.test(f)
      && !/urlConsultaDgii/.test(f));
  }
  {
    const cod = fuente('src/services/dgii/codigoSeguridad.ts');
    ok('la funcion que armaba el enlace ya no existe', !/export function urlConsultaDgii/.test(cod));
    const todos = [...fuentes.map(([, f]) => f), cod, leer('src/services/dgii/qrDelComprobante.ts')].join('\n');
    ok('y nadie construye ya la direccion que da 404', !/ecf\.dgii\.gov\.do\/e-cf\/Consulta/.test(todos));
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(2); });
