/**
 * El nombre del producto se perdia al pasar una cotizacion a factura.
 *
 * EL FALLO
 * --------
 * `QuoteService.prepareInvoicePayload` no incluia `productName` en las lineas
 * que devuelve -- aunque `getQuote`, justo encima, YA lo trae del `leftJoin`
 * con productos. Se quedaba en el servidor.
 *
 * El formulario de facturas, al no recibirlo, hacia:
 *
 *     productName: l.productName || 'Producto Cotizado'
 *
 * y ese respaldo no era un caso raro: era SIEMPRE. Y no se quedaba en la
 * pantalla. El nombre de la linea viaja asi:
 *
 *     payload de la factura -> invoiceCalculator (`name: line.productName`)
 *       -> totals.itemLines
 *          -> invoiceSubmissionService (`name: line.name`)  -> mSeller / DGII
 *          -> invoiceFileGenerator     (`productName: l.name`) -> PDF impreso
 *
 * Es decir: toda factura nacida de una cotizacion se emitio con TODAS sus
 * lineas llamadas "Producto Cotizado", en el comprobante impreso y en el e-CF
 * mandado a la DGII.
 *
 * La UNIDAD tenia el mismo origen (`unitOfMeasure: 'unidad'` a pelo) pero
 * distinto alcance: el documento impreso la lee de la base
 * (`prod?.unitOfMeasure` en invoiceFileGenerator), asi que ahi salia bien. Lo
 * que estaba mal era la tabla que ves en pantalla mientras facturas.
 *
 * EL ARREGLO
 * ----------
 * El nombre y la unidad viajan en el payload de conversion, como ya hace la
 * tasa de ITBIS desde la migracion 0040 -- mismo fallo, mismo sitio, misma
 * forma. Y el respaldo de la pantalla pasa a ser la cadena vacia: un nombre
 * vacio lo para la validacion que ya existe ("Todos los articulos deben tener
 * un nombre") en vez de emitir un nombre inventado que parece de verdad.
 *
 * Contra el HEAD anterior: las 5 fallan.
 */
import { fuente as fuenteCruda, crudo as crudoCrudo } from './_fuente';

const fuente = (r: string): string => fuenteCruda(r).replace(/\r\n/g, '\n');
const crudo = (r: string): string => crudoCrudo(r).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

const SERV = 'src/services/quoteService.ts';
const PANT = 'src/app/dashboard/invoices/page.tsx';

{
  const src = fuente(SERV);
  ok('el payload de conversion lleva el NOMBRE del producto',
    src.includes('productName: (line as any).productName ?? null,'));
  ok('y lleva tambien la UNIDAD de medida',
    src.includes('unitOfMeasure: (line as any).unitOfMeasure ?? null,'));
}

{
  const src = fuente(PANT);

  ok('la pantalla ya no inventa "Producto Cotizado"',
    !src.includes("productName: l.productName || 'Producto Cotizado',")
    && src.includes("productName: l.productName || '',"));

  // Que el respaldo sea vacio NO es dejarlo a medias: es lo que hace que el
  // fallo se pare en la validacion en vez de salir hacia la DGII.
  ok('un nombre que falte lo para la validacion que ya existe, no se emite',
    src.includes('const sinNombre = quote.lines.filter((l: any) => !l.productName).length;')
    && crudo(PANT).includes('no se puede facturar un artículo sin nombre.')
    && src.includes("out[`lines.${idx}.productName`] = 'Todos los artículos deben tener un nombre.';"));

  ok('la unidad es la del producto, no "unidad" a pelo',
    !src.includes("unitOfMeasure: 'unidad'\n              })));")
    && src.includes("unitOfMeasure: l.unitOfMeasure || 'unidad'"));
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
