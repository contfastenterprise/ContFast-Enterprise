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
import { checkStock } from '../services/inventoryService';

/**
 * Doble de `tx` que responde siempre con el nivel indicado y ademas ANOTA el
 * predicado con el que se le pregunto. Asi la prueba puede comprobar no solo el
 * resultado sino que la consulta lleva el filtro por empresa: sin el,
 * `checkStock` leia el nivel de otra empresa y autorizaba la salida sobre una
 * existencia que no era suya.
 */
function txCon(nivel: { quantity: number; minStock?: number } | null) {
  const preguntas: any[] = [];
  const tx: any = {
    preguntas,
    select: () => ({
      from: () => ({
        where: async (cond: any) => {
          preguntas.push(cond);
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
    await checkStock('empresa-1', 'prod-1', 'almacen-1', 1, tx, false);

    expect(tx.preguntas.length).toBe(1);
    const valores = cadenasDe(tx.preguntas[0]);
    expect(valores).toContain('empresa-1');
    expect(valores).toContain('prod-1');
    expect(valores).toContain('almacen-1');
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
