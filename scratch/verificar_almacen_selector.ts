/**
 * El almacen en el selector de producto: uno solo, elegible de verdad, y con la
 * regla de existencia del servidor.
 *
 * EL FALLO
 * --------
 * En el desplegable de producto hay una columna por almacen con su existencia y
 * un circulito de seleccion. Se reporto como "ahi estan los almacenes para
 * elegirlos"; mirandolo de cerca habia cuatro cosas rotas, y solo una es de
 * interfaz:
 *
 *  1. UN CLIC NO ELEGIA NADA. El clic en la casilla de un almacen movia el
 *     visto y se quedaba en un estado interno del componente. El formulario no
 *     se enteraba. Solo el DOBLE clic mandaba `onWarehouseChange`. El usuario
 *     veia su almacen marcado y la linea se guardaba con otro.
 *
 *  2. EL VISTO MENTIA. `getActiveWarehouseId` no miraba `selectedWarehouseId` --
 *     el almacen que la linea YA tiene --, sino el almacen con mas existencia.
 *     Una linea guardada con el almacen B se reabria con el visto en A.
 *
 *  3. DOS ALMACENES A LA VEZ. El visto salia de `getActiveWarehouseId` y el
 *     "este producto se puede elegir" de `targetWId = selectedWarehouseId ||
 *     activeWId`. En facturas ese prop nunca llega vacio -- la pagina lo
 *     respalda con el almacen de la factura --, asi que mover el visto a B no
 *     cambiaba nada: el producto seguia gris por culpa de A, y el rotulo "Bajo
 *     Minimo" era el minimo de un almacen que el usuario no estaba mirando.
 *
 *  4. LA REGLA DE EXISTENCIA ERA LA DE ANTES DE F1-04. El desplegable decidia
 *     con `minStock > 0 && cantidad <= minStock`. Con el minimo en 0 -- que es
 *     el valor por defecto -- un producto con CERO unidades pasaba sin decir
 *     nada. Y con minimo puesto BLOQUEABA en duro un producto que la propia
 *     pantalla de facturas dice, en su aviso en vivo, que si se puede facturar:
 *     "Puedes emitir la factura, pero el conduce no se podra aprobar hasta que
 *     entre mercancia". Dos politicas en la misma pantalla, y la que ganaba en
 *     el momento de elegir era la estricta, sin explicar por que.
 *
 * EL ARREGLO
 * ----------
 * La regla se muda a `@/services/inventario/existencia`, que no tiene base de
 * datos y por eso lo puede importar igual un componente de cliente que el
 * servicio del servidor. Era el TERCER sitio que respondia la misma pregunta;
 * el comentario de P2-28 ya avisaba de que una copia es "una copia condenada a
 * quedarse atras", y se cumplio.
 *
 * El almacen de una fila se decide en UNA funcion (`almacenDeLaFila`), asi que
 * el visto, el aviso y lo que se manda al formulario no pueden discrepar: no
 * hay dos sitios donde discrepar.
 *
 * Y no se bloquea: se avisa. Quien decide si ALCANZA es el servidor, que es el
 * unico que tiene la cantidad pedida delante.
 *
 * LO QUE ESTE BANCO NO COMPRUEBA
 * ------------------------------
 * Que el navegador distinga un clic de un doble clic. Eso no es nuestro. Lo que
 * se comprueba es que el clic simple llame a `elegir`, que `elegir` mande el
 * almacen, y que la aritmetica de "que se puede sacar" sea la misma que corre
 * en el servidor -- esa parte se EJECUTA, no se lee.
 */
import { fuente, crudo, bloque } from './_fuente';

const PA = 'src/components/ui/product-autocomplete.tsx';
const FA = 'src/app/dashboard/invoices/page.tsx';
const CO = 'src/app/dashboard/quotes/new/page.tsx';
const CM = 'src/app/dashboard/purchases/page.tsx';
const IS = 'src/services/inventoryService.ts';
const EX = 'src/services/inventario/existencia.ts';

let fallos = 0;
function ok(t: string, x: boolean): void {
  console.log(`${x ? '  OK  ' : ' FALLA'}  ${t}`);
  if (!x) fallos++;
}

/**
 * El `<Componente ... />` entero.
 *
 * Sin esto, buscar en TODO el fichero confunde el prop que se le pasa al
 * desplegable con el mismo nombre usado en otro sitio legitimo: el payload y el
 * aviso en vivo SI tienen que respaldar el almacen de la linea con el de la
 * factura, porque la factura tiene que salir de algun sitio. Lo que no puede
 * llevar respaldo es lo que se le CUENTA al desplegable.
 */
function etiqueta(src: string, nombre: string): string {
  const i = src.indexOf(`<${nombre}`);
  if (i < 0) return '';
  const j = src.indexOf('/>', i);
  return j > 0 ? src.slice(i, j + 2) : '';
}

async function main(): Promise<void> {
  // ===========================================================================
  // A. LA REGLA, EJECUTADA
  //
  // El import es dinamico y va dentro del try a proposito: con un `import`
  // estatico arriba, correr este banco contra el arbol ANTERIOR no da FALLA --
  // revienta antes de imprimir una sola linea, y una contraprueba que no
  // imprime no verifica nada.
  //
  // Ruta relativa y no `@/`: asi no depende de que quien lance el banco resuelva
  // el alias.
  // ===========================================================================
  let M: typeof import('../src/services/inventario/existencia') | null = null;
  try {
    M = await import('../src/services/inventario/existencia');
  } catch {
    M = null;
  }

  const conRegla = (t: string, f: (m: NonNullable<typeof M>) => boolean): void =>
    ok(t, M !== null && f(M));

  conRegla('disponible: los decimales llegan como texto y se restan bien',
    (m) => m.disponible({ quantity: '20.0000', minStock: '10.0000' }) === 10);

  conRegla('disponible: sin fila en inventory_levels no hay nada que sacar',
    (m) => m.disponible(undefined) === 0 && m.disponible(null) === 0);

  conRegla('disponible: sin minimo, disponible es todo lo que hay',
    (m) => m.disponible({ quantity: '5' }) === 5);

  conRegla('disponible: puede salir NEGATIVO (ya esta por debajo del minimo)',
    (m) => m.disponible({ quantity: '5', minStock: '10' }) === -5);

  // ESTE es el defecto. La regla vieja del selector era
  // `minStock > 0 && cantidad <= minStock`: con el minimo en 0 -- el valor por
  // defecto -- la primera mitad era falsa y NUNCA avisaba, ni con cero unidades.
  conRegla('quedaAlgo: CERO unidades y minimo 0 AVISA (esto es F1-04)',
    (m) => m.quedaAlgo({ quantity: '0' }) === false
        && m.quedaAlgo({ quantity: '0', minStock: '0' }) === false);

  conRegla('quedaAlgo: justo en el minimo no queda nada que sacar',
    (m) => m.quedaAlgo({ quantity: '100', minStock: '100' }) === false);

  conRegla('quedaAlgo: una unidad por encima del minimo si queda',
    (m) => m.quedaAlgo({ quantity: '101', minStock: '100' }) === true);

  conRegla('alcanza: el borde exacto pasa (20 con minimo 10, pedidos 10)',
    (m) => m.alcanza({ quantity: '20', minStock: '10' }, 10) === true);

  conRegla('alcanza: una unidad mas del disponible no pasa',
    (m) => m.alcanza({ quantity: '20', minStock: '10' }, 11) === false);

  // `3 - 3` da 0 exacto y no prueba nada -- lo llevaba asi y no cazaba al
  // mutante que quita la holgura. El ruido de verdad aparece al restar decimales
  // que no son exactos en binario: (0.3 - 0.1) - 0.2 = -2.78e-17, que sin
  // holgura se lee como "falta existencia" por 0.000000000000000028.
  conRegla('alcanza: el ruido de coma flotante no inventa una falta de 2.8e-17',
    (m) => m.alcanza({ quantity: '0.3', minStock: '0.1' }, 0.2) === true
        && ((0.3 - 0.1) - 0.2) < 0);

  // Las dos firmas son la misma regla escrita de dos maneras: la de tres numeros
  // sueltos la usa el servidor, que ya los tiene separados. Si divergen, el
  // conduce y el selector vuelven a decidir distinto y nadie se entera.
  conRegla('las dos firmas deciden IGUAL en las 60 combinaciones', (m) => {
    for (const q of [0, 3, 10, 20, 100.5]) {
      for (const min of [0, 10, 100]) {
        for (const pedido of [0, 1, 9.9999, 10, 10.0001]) {
          const a = m.alcanza({ quantity: String(q), minStock: String(min) }, pedido);
          const b = m.alcanzaLaExistencia(q, min, pedido);
          if (a !== b) return false;
        }
      }
    }
    return true;
  });

  conRegla('aCantidad: null, vacio y basura valen 0; el texto decimal, su numero',
    (m) => m.aCantidad(null) === 0 && m.aCantidad(undefined) === 0
        && m.aCantidad('') === 0 && m.aCantidad('abc') === 0
        && m.aCantidad('12.5') === 12.5 && m.aCantidad(7) === 7 && m.aCantidad(NaN) === 0);

  // ===========================================================================
  // B. EL RESTO SE LEE
  // ===========================================================================
  const src = fuente(PA).replace(/\r\n/g, '\n');
  const raw = crudo(IS).replace(/\r\n/g, '\n');
  const fac = fuente(FA).replace(/\r\n/g, '\n');
  const cot = fuente(CO).replace(/\r\n/g, '\n');
  const com = fuente(CM).replace(/\r\n/g, '\n');
  const inv = fuente(IS).replace(/\r\n/g, '\n');

  // No es una comprobacion, es la condicion para comprobar. Va como excepcion y
  // no como `ok(...)`: casi todo lo de abajo son negaciones, y una negacion
  // sobre una cadena vacia es cierta gratis. Con un fichero que no se pudo leer,
  // este banco daria verde entero sin haber mirado nada.
  if ([src, fac, cot, com, inv].some((s) => s.length < 2000)) {
    throw new Error(
      'No se pudieron leer los fuentes del selector. Revisa las rutas antes de ' +
      'creerte nada de lo que siga.'
    );
  }

  // ---- Avisar, no bloquear
  ok('el selector no deshabilita NADA por existencia',
    !src.includes('disabled') && !src.includes('cursor-not-allowed'));

  ok('`allowOutOfStock` ha desaparecido: sin bloqueo, no tiene oficio',
    !src.includes('allowOutOfStock') && !com.includes('allowOutOfStock')
    && !fac.includes('allowOutOfStock') && !cot.includes('allowOutOfStock'));

  ok('la regla anterior a F1-04 (`minimo > 0 &&`) ya no esta en el selector',
    !/min\w*\s*>\s*0\s*&&/.test(src));

  ok('el selector importa la regla compartida en vez de escribir la suya',
    src.includes("from '@/services/inventario/existencia'")
    && src.includes('quedaAlgo(') && src.includes('disponible('));

  ok('un servicio no recibe aviso de existencia: pasa por tracksInventory',
    src.includes('tracksInventory') && src.includes('llevaInventario'));

  // ---- Un solo almacen
  ok('existe `almacenDeLaFila` y ya no hay `getActiveWarehouseId` ni `targetWId`',
    src.includes('almacenDeLaFila') && !src.includes('getActiveWarehouseId')
    && !src.includes('targetWId'));

  const decision = bloque(src, 'const almacenDeLaFila =');
  ok('`almacenDeLaFila` respeta el almacen que la linea YA tiene',
    decision.length > 0 && decision.includes('selectedWarehouseId')
    && decision.includes('selectedProductId'));

  const fila = bloque(src, 'prods.map(');
  ok('dentro de la fila ya no se vuelve a mirar `selectedWarehouseId`',
    fila.length > 500 && !fila.includes('selectedWarehouseId'));

  ok('el visto y el aviso salen de la MISMA variable (`wActivo`)',
    fila.includes('const wActivo = almacenDeLaFila(p)')
    && fila.includes('sinDisponibleEn(p, wActivo)')
    && fila.includes('wActivo === w.id'));

  // A falta de eleccion se proponia el almacen con mas EXISTENCIA. Con 100 en A
  // y minimo 100, y 60 en B sin minimo, proponia A -- del que no se puede sacar
  // nada.
  ok('a falta de eleccion se propone el almacen con mas DISPONIBLE, no con mas existencia',
    src.includes('almacenConMasDisponible')
    && bloque(src, 'const almacenConMasDisponible =').includes('disponibleEn(p, w.id)'));

  // ---- Un clic elige
  ok('un clic en la casilla de almacen YA avisa al formulario',
    bloque(src, 'setLocalSelectedWarehouse(prev => ({').length > 0
    && fila.includes('elegir(p, w.id, false)'));

  ok('un clic no cierra el desplegable; el doble clic si',
    fila.includes('elegir(p, w.id, false)')
    && fila.includes('onDoubleClick={() => elegir(p, w.id, true)}'));

  const elegir = bloque(src, 'const elegir =');
  ok('`elegir` manda el almacen y solo reemplaza el producto si cambia',
    elegir.length > 0 && elegir.includes('onWarehouseChange(wId)')
    && elegir.includes('p.id !== selectedProductId') && elegir.includes('onSelect(p)'));

  ok('el encabezado ya no dice "Doble Clic" encima de la mitad donde basta uno',
    !src.includes('Doble Clic') && src.includes('clic para elegir'));

  // ---- Los tres sitios
  const tFac = etiqueta(fac, 'ProductAutocomplete');
  const tCot = etiqueta(cot, 'ProductAutocomplete');
  ok('al desplegable se le dice el almacen de la linea SIN respaldo que borre "nadie eligio"',
    tFac.length > 200 && tCot.length > 200
    && tFac.includes('selectedWarehouseId={line.warehouseId}')
    && tCot.includes('selectedWarehouseId={line.warehouseId}')
    && !tFac.includes('||') && !tCot.includes('||'));

  ok('los tres sitios dicen QUE producto tiene la linea',
    fac.includes('selectedProductId={line.productId}')
    && cot.includes('selectedProductId={line.productId}')
    && com.includes('selectedProductId={l.productId}'));

  // ---- Una sola regla en todo el repo
  ok('inventoryService ya no DEFINE la regla, la importa',
    inv.includes("from '@/services/inventario/existencia'")
    && !inv.includes('function alcanzaLaExistencia')
    && inv.includes('alcanzaLaExistencia('));

  ok('el aviso en vivo de facturas ya no resta el minimo a mano',
    !fac.includes('existencia - minimo') && fac.includes('loQueSePuedeSacar(targetInv)'));

  // Contar es mas util que prohibir: si manana alguien vuelve a escribir la
  // resta en una pantalla, el numero sube y esto se pone rojo solo.
  //
  // OJO CON EL `\b`: detras de un parentesis de cierre no hay frontera de
  // palabra, asi que puesto al final de toda la alternancia la primera rama no
  // casaba NUNCA. Lo cazo el contraste, no la lectura.
  const RESTA = /-\s*(?:aCantidad\(nivel\.minStock\)|(?:minimo|minStk|minStock|minActivo)\b)/g;
  const cuenta = (s: string): number => (s.match(RESTA) || []).length;
  ok('la resta del minimo se escribe UNA sola vez, y no en las pantallas',
    cuenta(src) + cuenta(fac) + cuenta(cot) + cuenta(com) === 0
    && cuenta(fuente(EX)) === 1);

  // Un contrato que no se escribe se rompe sin que nadie lo note. Esto se lee
  // con `crudo` porque lo que se comprueba ES el comentario.
  ok('queda escrito en inventoryService por que la regla se mudo',
    raw.includes('inventario/existencia') && raw.includes('F1-04'));

  console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLA(S)`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
