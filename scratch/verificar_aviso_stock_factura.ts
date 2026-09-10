/**
 * El aviso de existencia al facturar: decia lo que no era y callaba lo que si.
 *
 * QUE HABIA
 * ---------
 * `erroresDeStock()` avisaba SOLO si el stock estaba por debajo del minimo
 * configurado, y NUNCA miraba la cantidad facturada. Mal en las dos
 * direcciones: te BLOQUEABA por vender 1 unidad de algo bajo minimo, y se
 * callaba del todo al facturar 500 de un producto con 10, porque con minimo 0
 * no entraba nunca en la condicion. Y no sumaba las lineas repetidas del mismo
 * producto -- el mismo error que se acaba de cerrar en el conduce.
 *
 * Habia TRES copias de la regla: las dos puertas de emision y el escaner de
 * codigo de barras, que ademas RECHAZABA el producto (`toast.error` + `return`)
 * en vez de avisar: escaneabas y la linea no llegaba a anadirse.
 *
 * POR QUE AVISO Y NO BLOQUEO
 * --------------------------
 * Emitir NO descuenta existencia en este sistema, a proposito: `invoiceDbBooker`
 * lo dice, "Deduccion diferida a Conduce de Entrega". La mercancia sale en el
 * conduce y ahi es donde se valida. Facturar por encima de lo que hay es un
 * flujo legitimo -- vendes hoy lo que recibes el jueves --, y bloquearlo seria
 * romperlo. Lo que no es legitimo es callarselo: si facturas 500 de 10, el
 * conduce no se podra aprobar, y para entonces ya hay un e-CF emitido y la
 * unica salida es una nota de credito.
 *
 * Contra el HEAD anterior: las 9 fallan.
 */
import { fuente as fuenteCruda } from './_fuente';

const fuente = (r: string): string => fuenteCruda(r).replace(/\r\n/g, '\n');

let fallos = 0;
function ok(t: string, c: boolean): void {
  console.log(`${c ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!c) fallos++;
}

const src = fuente('src/app/dashboard/invoices/page.tsx');

ok('el aviso mira la CANTIDAD pedida, no solo el minimo',
  src.includes('const avisosDeStock = useMemo<')
  && !src.includes('erroresDeStock')
  && src.includes('if (pedido <= disponible) return null;'));

ok('suma las lineas repetidas del mismo producto en el mismo almacen',
  src.includes('const clave = `${line.productId}|${lineWId}`;')
  && src.includes('ya.pedido += pedido;'));

// La misma regla que `alcanzaLaExistencia` en el servidor: lo que puede salir
// es lo que hay MENOS el minimo que hay que dejar puesto.
ok('usa la misma regla que el servidor: existencia menos el minimo a conservar',
  src.includes('const disponible = existencia - minimo;'));

ok('un servicio no genera aviso: no tiene existencia que agotar',
  src.includes('if (prod.tracksInventory === false) return;'));

ok('una nota de credito no avisa: devuelve mercancia',
  src.includes("if (ecfType === '34') return [];"));

// Lo importante de este: que las DOS puertas dejen de bloquear. Con una sola
// desenganchada, la emision seguiria muriendo en la otra.
ok('YA NO bloquea: las dos puertas de emision dejan de mirar existencia',
  src.includes('Object.assign(campos, erroresBasicos());')
  && src.includes('Object.assign(camposEmision, erroresBasicos());')
  && !src.includes('erroresDeStock())'));

ok('el aviso se pinta, en ambar y sin `data-campo` que lo confunda con un error',
  src.includes('data-aviso-stock')
  && src.includes('avisosDeStock.map((a) => (')
  && src.includes('text-amber-800'));

ok('se recalcula en vivo, no al pulsar el boton',
  src.includes('}, [lines, dbProducts, warehouseId, ecfType]);'));

ok('el escaner avisa en vez de rechazar el producto',
  !src.includes('toast.error(`No se puede vender')
  && src.includes('está en el mínimo o por debajo (existencia ${currentQty}, mínimo ${currentMinStk})')
  && src.includes('toast.warning('));

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
process.exit(fallos === 0 ? 0 : 1);
