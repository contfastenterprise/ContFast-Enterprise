/**
 * El e-CF declara cada articulo en el tramo que le toca.
 *
 * EL FALLO
 * --------
 * En `buildECFPayload`, cada articulo llevaba:
 *
 *     IndicadorFacturacion: '1',
 *
 * escrito a pelo. Segun el formato e-CF de la DGII (v1.0) ese campo vale:
 *
 *     1  Gravado a ITBIS Tasa 1   -> suma a MontoGravadoI1
 *     2  Gravado a ITBIS Tasa 2   -> suma a MontoGravadoI2
 *     3  Gravado a ITBIS Tasa 3   -> suma a MontoGravadoI3
 *     4  Exento                   -> suma a MontoExento
 *     0  No facturable            -> suma a MontoNoFacturable
 *
 * Asi que una factura EXENTA se le mandaba a la DGII con sus articulos
 * declarados como gravados a la tasa 1, mientras los Totales del MISMO
 * comprobante metian ese importe en `MontoExento`. El comprobante se
 * contradecia a si mismo.
 *
 * Es el ultimo tramo del agujero del ITBIS. La 0039 y la 0040 arreglaron que
 * la tasa se guardara y se imprimiera; los Totales del e-CF se arreglaron al
 * mismo tiempo. Esto -- el indicador de cada articulo -- quedo sin tocar, y es
 * justo lo que rompe el caso exento, que es el que se acaba de usar.
 *
 * LA REGLA QUE SE COMPRUEBA
 * -------------------------
 * La invariante de verdad, la que mira la DGII: sumando el importe de los
 * articulos POR INDICADOR, cada suma tiene que dar exactamente el total
 * correspondiente. Si eso se cumple, el comprobante es coherente; si no, no lo
 * es, por muy bien que se vea cada campo por separado.
 */
import { MSellerClient } from '../src/services/dgii/msellerClient';
import { fuente } from './_fuente';

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}${d ? ` -- ${d}` : ''}`);
  if (!c) fallos++;
};

type Linea = { nombre: string; precio: number; tasa: number; cat?: 'exento' | 'tasa_cero' };

/**
 * LA INVARIANTE: la suma de los articulos de cada indicador tiene que cuadrar
 * con el total que le corresponde.
 */
function cuadra(enc: any): { bien: boolean; detalle: string } {
  const items = (enc as any).__items as any[];
  const suma = (ind: string) =>
    Number(items.filter(i => i.IndicadorFacturacion === ind)
                .reduce((a, i) => a + i.MontoItem, 0).toFixed(2));
  const partes: string[] = [];
  let bien = true;
  const comparar = (etiqueta: string, obtenido: number, esperado: number) => {
    const igual = Math.abs(obtenido - (esperado ?? 0)) < 0.005;
    if (!igual) bien = false;
    partes.push(`${etiqueta}: articulos ${obtenido} vs totales ${esperado ?? 0}${igual ? '' : '  <-- NO CUADRA'}`);
  };
  comparar('tramo 1', suma('1'), enc.Totales.MontoGravadoI1 ?? 0);
  comparar('tramo 2', suma('2'), enc.Totales.MontoGravadoI2 ?? 0);
  comparar('tramo 3', suma('3'), enc.Totales.MontoGravadoI3 ?? 0);
  comparar('exento ', suma('4'), enc.Totales.MontoExento ?? 0);
  return { bien, detalle: partes.join(' | ') };
}

/** El encabezado no trae los items; se adjuntan para poder comprobar la invariante. */
function conItems(lineas: Linea[]) {
  const base = lineas.reduce((a, l) => a + l.precio, 0);
  const impuestos = Number(lineas.reduce((a, l) => a + l.precio * l.tasa, 0).toFixed(2));
  const payload = MSellerClient.buildECFPayload({
    ncf: 'E310000000001', ecfType: '31', sequenceExpiry: '31-12-2026', paymentType: '1',
    issueDate: new Date('2026-09-02T10:00:00'),
    emitterRnc: '131793916', emitterName: 'Empresa', emitterAddress: 'Santiago',
    buyerRnc: '101010101', buyerName: 'Cliente',
    subtotal: base, totalTaxes: impuestos, total: Number((base + impuestos).toFixed(2)),
    lines: lineas.map((l, i) => ({
      index: i + 1, name: l.nombre, quantity: 1, unitPrice: l.precio, discount: 0,
      taxRate: l.tasa, taxCategory: l.cat ?? null,
    })),
  });
  const enc: any = payload.ECF.Encabezado;
  enc.__items = payload.ECF.DetallesItems.Item;
  return enc;
}

function main() {
  console.log('\n1) CONTROL: todo al 18% sale exactamente como siempre\n');
  {
    const e = conItems([{ nombre: 'Puerta', precio: 1000, tasa: 0.18 }]);
    ok('el articulo va al tramo 1', e.__items[0].IndicadorFacturacion === '1',
      e.__items[0].IndicadorFacturacion);
    ok('ITBIS1 = 18', e.Totales.ITBIS1 === 18, String(e.Totales.ITBIS1));
    ok('MontoGravadoI1 = 1000', e.Totales.MontoGravadoI1 === 1000, String(e.Totales.MontoGravadoI1));
    ok('MontoExento = 0', e.Totales.MontoExento === 0, String(e.Totales.MontoExento));
    const c = cuadra(e); ok('cuadra', c.bien, c.detalle);
  }

  console.log('\n2) REGRESION: factura EXENTA entera (la que se acaba de emitir)\n');
  {
    const e = conItems([{ nombre: 'Servicio exento', precio: 5000, tasa: 0 }]);
    ok('el articulo se declara EXENTO (4), no gravado al 18%',
      e.__items[0].IndicadorFacturacion === '4', e.__items[0].IndicadorFacturacion);
    ok('no se declara ningun tramo de ITBIS', e.Totales.ITBIS1 === undefined,
      String(e.Totales.ITBIS1));
    ok('MontoGravadoTotal = 0', e.Totales.MontoGravadoTotal === 0, String(e.Totales.MontoGravadoTotal));
    ok('MontoExento = 5000', e.Totales.MontoExento === 5000, String(e.Totales.MontoExento));
    ok('TotalITBIS = 0', e.Totales.TotalITBIS === 0, String(e.Totales.TotalITBIS));
    ok('MontoTotal = 5000 (sin ITBIS anadido)', e.Totales.MontoTotal === 5000,
      String(e.Totales.MontoTotal));
    const c = cuadra(e); ok('cuadra', c.bien, c.detalle);
  }

  console.log('\n3) Mezcla: una linea gravada y una exenta en el mismo comprobante\n');
  {
    const e = conItems([
      { nombre: 'Puerta', precio: 1000, tasa: 0.18 },
      { nombre: 'Servicio exento', precio: 500, tasa: 0 },
    ]);
    ok('la gravada al tramo 1', e.__items[0].IndicadorFacturacion === '1');
    ok('la exenta a exento (4)', e.__items[1].IndicadorFacturacion === '4');
    ok('MontoGravadoI1 = 1000', e.Totales.MontoGravadoI1 === 1000, String(e.Totales.MontoGravadoI1));
    ok('MontoExento = 500', e.Totales.MontoExento === 500, String(e.Totales.MontoExento));
    ok('TotalITBIS = 180', e.Totales.TotalITBIS === 180, String(e.Totales.TotalITBIS));
    const c = cuadra(e); ok('cuadra', c.bien, c.detalle);
  }

  console.log('\n4) El indicador es POSICIONAL: solo 16% -> tramo 1, no tramo 2\n');
  {
    const e = conItems([{ nombre: 'Reducido', precio: 1000, tasa: 0.16 }]);
    ok('ITBIS1 = 16 (el 16% es el unico tramo, luego es el primero)',
      e.Totales.ITBIS1 === 16, String(e.Totales.ITBIS1));
    ok('y el articulo apunta al tramo 1', e.__items[0].IndicadorFacturacion === '1',
      e.__items[0].IndicadorFacturacion);
    const c = cuadra(e); ok('cuadra', c.bien, c.detalle);
  }

  console.log('\n5) Dos tasas gravadas: cada articulo a su tramo\n');
  {
    const e = conItems([
      { nombre: 'General', precio: 1000, tasa: 0.18 },
      { nombre: 'Reducido', precio: 2000, tasa: 0.16 },
      { nombre: 'Exento', precio: 300, tasa: 0 },
    ]);
    ok('ITBIS1 = 18 y ITBIS2 = 16 (de mayor a menor)',
      e.Totales.ITBIS1 === 18 && e.Totales.ITBIS2 === 16,
      `${e.Totales.ITBIS1} / ${e.Totales.ITBIS2}`);
    ok('el del 18% -> 1', e.__items[0].IndicadorFacturacion === '1');
    ok('el del 16% -> 2', e.__items[1].IndicadorFacturacion === '2');
    ok('el exento  -> 4', e.__items[2].IndicadorFacturacion === '4');
    ok('MontoGravadoI1 = 1000', e.Totales.MontoGravadoI1 === 1000, String(e.Totales.MontoGravadoI1));
    ok('MontoGravadoI2 = 2000', e.Totales.MontoGravadoI2 === 2000, String(e.Totales.MontoGravadoI2));
    ok('TotalITBIS1 = 180', e.Totales.TotalITBIS1 === 180, String(e.Totales.TotalITBIS1));
    ok('TotalITBIS2 = 320', e.Totales.TotalITBIS2 === 320, String(e.Totales.TotalITBIS2));
    const c = cuadra(e); ok('cuadra', c.bien, c.detalle);
  }

  console.log('\n6) El indicador no puede volver a quedarse fijo\n');
  {
    const src = fuente('src/services/dgii/msellerClient.ts');
    ok('no hay ningun IndicadorFacturacion escrito a pelo',
      !/IndicadorFacturacion:\s*'\d'/.test(src));
    ok('se calcula del tramo de la linea',
      /IndicadorFacturacion:\s*indicadorDeLinea\(line\.taxRate,\s*line\.taxCategory\)/.test(src));
  }


  console.log('\n7) Los DOS ceros de la DGII (migracion 0042)\n');
  {
    //  Sin categoria, un 0 sigue siendo EXENTO. Es lo que hace que todo lo
    //  emitido hasta la 0042 se comporte exactamente igual.
    const sinCat = conItems([{ nombre: 'Servicio', precio: 1000, tasa: 0 }]);
    ok('sin categoria, un 0 es EXENTO (compatibilidad)',
      sinCat.__items[0].IndicadorFacturacion === '4', sinCat.__items[0].IndicadorFacturacion);
    ok('  y suma a MontoExento, no a gravado',
      sinCat.Totales.MontoExento === 1000 && sinCat.Totales.MontoGravadoTotal === 0);

    const exento = conItems([{ nombre: 'Servicio', precio: 1000, tasa: 0, cat: 'exento' }]);
    ok('exento explicito -> indicador 4', exento.__items[0].IndicadorFacturacion === '4');
    ok('  MontoExento 1000, MontoGravadoTotal 0',
      exento.Totales.MontoExento === 1000 && exento.Totales.MontoGravadoTotal === 0);

    const cero = conItems([{ nombre: 'Exportacion', precio: 1000, tasa: 0, cat: 'tasa_cero' }]);
    ok('tasa 0% (exportacion) -> indicador 3, NO 4',
      cero.__items[0].IndicadorFacturacion === '3', cero.__items[0].IndicadorFacturacion);
    ok('  suma a MontoGravadoI3, no a MontoExento',
      cero.Totales.MontoGravadoI3 === 1000 && cero.Totales.MontoExento === 0,
      `I3=${cero.Totales.MontoGravadoI3} exento=${cero.Totales.MontoExento}`);
    ok('  ITBIS3 = 0 y TotalITBIS3 = 0',
      cero.Totales.ITBIS3 === 0 && cero.Totales.TotalITBIS3 === 0);
    ok('  y la tasa cero SI cuenta como gravada en el total',
      cero.Totales.MontoGravadoTotal === 1000, String(cero.Totales.MontoGravadoTotal));
    const c1 = cuadra(cero); ok('  cuadra', c1.bien, c1.detalle);
  }

  console.log('\n8) Los tres casos juntos, y el limite\n');
  {
    const e = conItems([
      { nombre: 'General', precio: 1000, tasa: 0.18 },
      { nombre: 'Reducido', precio: 2000, tasa: 0.16 },
      { nombre: 'Exportacion', precio: 300, tasa: 0, cat: 'tasa_cero' },
      { nombre: 'Exento', precio: 400, tasa: 0, cat: 'exento' },
    ]);
    ok('18% -> 1', e.__items[0].IndicadorFacturacion === '1');
    ok('16% -> 2', e.__items[1].IndicadorFacturacion === '2');
    ok('tasa 0% -> 3', e.__items[2].IndicadorFacturacion === '3');
    ok('exento -> 4', e.__items[3].IndicadorFacturacion === '4');
    ok('MontoExento solo lleva lo exento (400)', e.Totales.MontoExento === 400,
      String(e.Totales.MontoExento));
    ok('MontoGravadoTotal = 1000+2000+300', e.Totales.MontoGravadoTotal === 3300,
      String(e.Totales.MontoGravadoTotal));
    const c = cuadra(e); ok('cuadra', c.bien, c.detalle);

    //  El tramo 3 esta reservado para la tasa cero: con tres tasas gravadas mas
    //  una exportacion no cabe, y se lanza en vez de declarar mal.
    let lanzo = false;
    try {
      conItems([
        { nombre: 'a', precio: 100, tasa: 0.18 },
        { nombre: 'b', precio: 100, tasa: 0.16 },
        { nombre: 'c', precio: 100, tasa: 0.08 },
        { nombre: 'd', precio: 100, tasa: 0, cat: 'tasa_cero' },
      ]);
    } catch { lanzo = true; }
    ok('tres tasas gravadas + exportacion: lanza en vez de declarar mal', lanzo);
  }

  console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : `${fallos} FALLIDAS`}\n`);
  process.exit(fallos === 0 ? 0 : 1);
}

main();
