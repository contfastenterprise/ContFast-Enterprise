/**
 * inventoryService.vitest.ts
 *
 * Pruebas de checkStock — la funcion que decide si una venta o un despacho
 * pueden ejecutarse. Hasta la correccion F1-04 no comparaba la cantidad pedida
 * contra la existencia, asi que autorizaba cualquier operacion.
 *
 * checkStock recibe el ejecutor de consultas como parametro (`tx`), asi que se
 * puede probar sin base de datos pasando un doble que devuelve el nivel de
 * inventario deseado.
 *
 * Los dos modos importan y se prueban por separado:
 *   - useProvisional = false (despacho): compara contra la existencia FISICA.
 *   - useProvisional = true  (facturacion): descuenta ademas lo ya facturado y
 *     pendiente de despacho. Ese camino consulta facturas y no se cubre aqui;
 *     lo relevante para la regresion es la comparacion, que es comun a ambos.
 */
import { describe, it, expect } from 'vitest';
import { checkStock, checkStockBatch } from '../services/inventoryService';
import { products } from '../db/schema';

/**
 * Doble de `tx` que responde siempre con el nivel indicado y ademas ANOTA el
 * predicado con el que se le pregunto. Asi la prueba puede comprobar no solo el
 * resultado sino que la consulta lleva el filtro por empresa: sin el,
 * `checkStock` leia el nivel de otra empresa y autorizaba la salida sobre una
 * existencia que no era suya.
 */
function txCon(
  nivel: { quantity: number; minStock?: number } | null,
  llevaInventario = true
) {
  const preguntas: any[] = [];
  const tx: any = {
    preguntas,
    select: () => ({
      // `checkStock` consulta DOS tablas: primero `products`, para saber si el
      // producto lleva control de existencia -- un servicio no tiene nada que
      // comprobar -- y despues `inventory_levels`. El doble responde a cada una
      // por identidad de tabla y no por orden de llamada, que seria fragil.
      from: (tabla: any) => ({
        where: async (cond: any) => {
          preguntas.push(cond);
          if (tabla === products) return [{ tracksInventory: llevaInventario }];
          return nivel ? [{ quantity: nivel.quantity, minStock: nivel.minStock ?? 0 }] : [];
        },
      }),
    }),
  };
  return tx;
}

/**
 * Recoge las cadenas que hay dentro del predicado de Drizzle. No se puede usar
 * JSON.stringify: el arbol de condiciones referencia la tabla y la tabla a sus
 * columnas, asi que la estructura es circular.
 */
function cadenasDe(nodo: any, vistos = new Set<any>()): string[] {
  if (typeof nodo === 'string') return [nodo];
  if (!nodo || typeof nodo !== 'object' || vistos.has(nodo)) return [];
  vistos.add(nodo);
  return Object.values(nodo).flatMap((v) => cadenasDe(v, vistos));
}

const puedeSacar = (existencia: number | null, pedido: number, minimo = 0) =>
  checkStock(
    'empresa-1',
    'PRODUCCION',
    'prod-1',
    'almacen-1',
    pedido,
    txCon(existencia === null ? null : { quantity: existencia, minStock: minimo }),
    false
  );

describe('checkStock — sin stock minimo definido (el valor por defecto)', () => {
  it('RECHAZA sacar mas unidades de las que hay', async () => {
    // El bug original: con minStock = 0 devolvia true y el nivel quedaba en -97.
    expect(await puedeSacar(3, 100)).toBe(false);
    expect(await puedeSacar(3, 4)).toBe(false);
  });

  it('permite sacar exactamente lo que hay', async () => {
    expect(await puedeSacar(3, 3)).toBe(true);
  });

  it('permite sacar menos de lo que hay', async () => {
    expect(await puedeSacar(10, 2)).toBe(true);
  });

  it('rechaza cualquier cantidad si el producto no tiene nivel en ese almacen', async () => {
    expect(await puedeSacar(null, 1)).toBe(false);
    expect(await puedeSacar(null, 0)).toBe(true);
  });

  it('una cantidad de cero siempre pasa', async () => {
    expect(await puedeSacar(0, 0)).toBe(true);
  });
});

describe('checkStock — con stock minimo definido', () => {
  it('RECHAZA la operacion que dejaria la existencia por debajo del minimo', async () => {
    // Segundo defecto: la condicion original miraba el stock ANTES de la
    // operacion (`currentStock <= minStock`), asi que con 20 en almacen y un
    // minimo de 10 dejaba sacar 15 y el nivel terminaba en 5.
    expect(await puedeSacar(20, 15, 10)).toBe(false);
    expect(await puedeSacar(20, 11, 10)).toBe(false);
  });

  it('permite bajar exactamente hasta el minimo', async () => {
    expect(await puedeSacar(20, 10, 10)).toBe(true);
  });

  it('rechaza si la existencia ya esta en el minimo', async () => {
    expect(await puedeSacar(10, 1, 10)).toBe(false);
    expect(await puedeSacar(10, 0, 10)).toBe(true);
  });
});

describe('checkStock — aislamiento entre empresas', () => {
  it('pregunta por el nivel filtrando por la empresa', async () => {
    // Sin companyId en la consulta, checkStock resolvia el nivel por producto y
    // almacen a secas y podia autorizar una salida contra la existencia de otra
    // empresa. El filtro es parte del contrato de la funcion, no un detalle.
    const tx = txCon({ quantity: 10 });
    await checkStock('empresa-1', 'PRODUCCION', 'prod-1', 'almacen-1', 1, tx, false);

    // Dos consultas: primero si el producto lleva inventario, despues el nivel.
    expect(tx.preguntas.length).toBe(2);

    // La del producto tambien filtra por empresa: el productId llega del cuerpo
    // de la peticion, asi que preguntar solo por id dejaria que el ajuste de una
    // empresa dependiera de como este configurado el producto de otra.
    const delProducto = cadenasDe(tx.preguntas[0]);
    expect(delProducto).toContain('empresa-1');
    expect(delProducto).toContain('prod-1');

    const delNivel = cadenasDe(tx.preguntas[1]);
    expect(delNivel).toContain('empresa-1');
    expect(delNivel).toContain('prod-1');
    expect(delNivel).toContain('almacen-1');
  });

  it('un producto sin control de existencia nunca bloquea la salida', async () => {
    // Un servicio -instalacion, mano de obra- no esta en ningun almacen. Antes
    // de `tracks_inventory` no habia forma de decirlo y cada venta le descontaba
    // una unidad: "Servicios Instalacion" acumulo -116.
    const tx = txCon(null, false);
    expect(await checkStock('empresa-1', 'PRODUCCION', 'srv-1', 'almacen-1', 500, tx, false)).toBe(true);

    // Y ni siquiera llega a mirar el nivel: no tiene sentido preguntarlo.
    expect(tx.preguntas.length).toBe(1);
  });
});

describe('checkStock — cantidades decimales', () => {
  it('no falla por ruido de coma flotante al sacar la existencia exacta', async () => {
    // Las cantidades son decimal(15,4). Restar valores iguales en coma flotante
    // puede dar -4.44e-16, que sin tolerancia se leeria como existencia negativa.
    expect(await puedeSacar(0.3, 0.1 + 0.2)).toBe(true);
    expect(await puedeSacar(3.5, 3.5)).toBe(true);
  });

  it('rechaza un exceso decimal por pequeno que sea', async () => {
    expect(await puedeSacar(3.5, 3.5001)).toBe(false);
  });
});


/**
 * checkStockBatch — el mismo producto repetido en varias lineas.
 *
 * Un conduce puede traer el mismo producto en dos lineas. Hasta 2026-09-09 esta
 * funcion decidia cada linea POR SEPARADO contra la misma existencia: con 10 en
 * almacen, dos lineas de 8 pasaban las dos, y despues `approve` descontaba las
 * dos y el nivel quedaba en -6. Lo que tiene que caber en el almacen es la SUMA.
 */
function txLote(
  niveles: Record<string, { quantity: number; minStock?: number }>,
  llevan: Record<string, boolean> = {}
) {
  const ids = new Set([...Object.keys(niveles), ...Object.keys(llevan)]);
  const tx: any = {
    select: () => ({
      from: (tabla: any) => ({
        where: async () => {
          if (tabla === products) {
            return [...ids].map((id) => ({ id, tracksInventory: llevan[id] ?? true }));
          }
          return Object.entries(niveles).map(([productId, n]) => ({
            productId,
            quantity: n.quantity,
            minStock: n.minStock ?? 0,
          }));
        },
      }),
    }),
  };
  return tx;
}

const puedeSacarLote = (
  niveles: Record<string, { quantity: number; minStock?: number }>,
  items: { productId: string; quantityNeeded: number }[],
  llevan: Record<string, boolean> = {}
) => checkStockBatch('empresa-1', 'PRODUCCION', 'almacen-1', items, txLote(niveles, llevan));

describe('checkStockBatch — lineas repetidas del mismo producto', () => {
  it('SUMA las dos lineas: 8 + 8 no salen de una existencia de 10', async () => {
    // El bug: cada linea se comparaba con los 10 y las dos pasaban. Se
    // despachaban 16 unidades de las 10 que habia.
    expect(
      await puedeSacarLote({ 'prod-1': { quantity: 10 } }, [
        { productId: 'prod-1', quantityNeeded: 8 },
        { productId: 'prod-1', quantityNeeded: 8 },
      ])
    ).toEqual([false, false]);
  });

  it('deja pasar la suma que si cabe: 5 + 5 de una existencia de 10', async () => {
    expect(
      await puedeSacarLote({ 'prod-1': { quantity: 10 } }, [
        { productId: 'prod-1', quantityNeeded: 5 },
        { productId: 'prod-1', quantityNeeded: 5 },
      ])
    ).toEqual([true, true]);
  });

  it('rechaza por una sola unidad de mas repartida entre dos lineas', async () => {
    expect(
      await puedeSacarLote({ 'prod-1': { quantity: 10 } }, [
        { productId: 'prod-1', quantityNeeded: 5 },
        { productId: 'prod-1', quantityNeeded: 6 },
      ])
    ).toEqual([false, false]);
  });

  it('el producto que no alcanza no arrastra al que si', async () => {
    // La decision es por producto, no por lote: que falte tornilleria no puede
    // bloquear la linea de otro producto que esta perfectamente disponible.
    expect(
      await puedeSacarLote(
        { 'prod-1': { quantity: 10 }, 'prod-2': { quantity: 100 } },
        [
          { productId: 'prod-1', quantityNeeded: 8 },
          { productId: 'prod-1', quantityNeeded: 8 },
          { productId: 'prod-2', quantityNeeded: 1 },
        ]
      )
    ).toEqual([false, false, true]);
  });

  it('el stock minimo se respeta sobre la suma, no sobre cada linea', async () => {
    // 20 en almacen con un minimo de 10: caben 10, no 12.
    const items = [
      { productId: 'prod-1', quantityNeeded: 6 },
      { productId: 'prod-1', quantityNeeded: 6 },
    ];
    expect(await puedeSacarLote({ 'prod-1': { quantity: 20, minStock: 10 } }, items)).toEqual([
      false,
      false,
    ]);
    expect(
      await puedeSacarLote({ 'prod-1': { quantity: 20, minStock: 10 } }, [
        { productId: 'prod-1', quantityNeeded: 5 },
        { productId: 'prod-1', quantityNeeded: 5 },
      ])
    ).toEqual([true, true]);
  });

  it('un servicio repetido sigue sin bloquear nunca', async () => {
    // No tiene existencia que agotar: sumar 1500 no cambia nada.
    expect(
      await puedeSacarLote(
        {},
        [
          { productId: 'srv-1', quantityNeeded: 500 },
          { productId: 'srv-1', quantityNeeded: 500 },
          { productId: 'srv-1', quantityNeeded: 500 },
        ],
        { 'srv-1': false }
      )
    ).toEqual([true, true, true]);
  });

  it('una linea suelta decide igual que checkStock', async () => {
    // La correccion no puede cambiar el caso normal, que es la inmensa mayoria.
    expect(
      await puedeSacarLote({ 'prod-1': { quantity: 3 } }, [
        { productId: 'prod-1', quantityNeeded: 4 },
      ])
    ).toEqual([false]);
    expect(
      await puedeSacarLote({ 'prod-1': { quantity: 3 } }, [
        { productId: 'prod-1', quantityNeeded: 3 },
      ])
    ).toEqual([true]);
  });

  it('un producto sin nivel en el almacen no pasa por venir repetido', async () => {
    expect(
      await puedeSacarLote({}, [
        { productId: 'prod-9', quantityNeeded: 1 },
        { productId: 'prod-9', quantityNeeded: 1 },
      ], { 'prod-9': true })
    ).toEqual([false, false]);
  });

  it('sin lineas no pregunta nada', async () => {
    expect(await puedeSacarLote({ 'prod-1': { quantity: 10 } }, [])).toEqual([]);
  });
});
