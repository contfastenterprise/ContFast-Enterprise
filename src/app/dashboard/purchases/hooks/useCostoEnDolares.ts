'use client';

/**
 * Lote 257: el costo con que entra un producto a una compra, si sigue al dolar.
 *
 * Pedido del dueño (2026-10-03): *"para las compras, los productos que tienen precios en dolares
 * deben calcularse en base a la tasa establecida"*. Al elegir o escanear un producto, la linea toma
 * `costo en dolares x tasa vigente` en vez del costo de catalogo -- que solo se pone al dia al
 * "Aplicar precios" y puede ir atrasado. El costo se puede seguir cambiando a mano: es la factura
 * del suplidor la que manda.
 *
 * Si no se puede leer la tasa (sin permiso de ver el catalogo, sin la migracion, sin red), la
 * compra funciona como siempre, con el costo de catalogo: no es motivo para frenar una compra.
 *
 * LOTE 261: la tasa la lee `useTasaDelDolar`, el mismo que pinta el control para cambiarla, asi
 * que se pide una vez y cambiarla pone al dia el costo de lo que se elija despues. Y se fue
 * `origenDe`: la linea ya no dice "US$ 45.00 x 63.50" debajo del costo. Pedido del dueño
 * (2026-10-03): *"solo debe mostrar en peso dominicano"*.
 */
import { useCallback } from 'react';
import { costoParaCompra } from '@/services/precios/preciosEnDolares';
import { useTasaDelDolar, type CambioDeTasa } from '@/hooks/useTasaDelDolar';

export function useCostoEnDolares(alCambiarLaTasa?: (c: CambioDeTasa) => void) {
  const tasaDelDolar = useTasaDelDolar(alCambiarLaTasa);
  const { costosUsd, tasa } = tasaDelDolar;

  /** El costo con que entra el producto: en dolares por la tasa si lo sigue, o el de catalogo. */
  const costoDe = useCallback((prod: { id: string; cost?: unknown }) =>
    costoParaCompra(prod.cost, costosUsd.get(prod.id), tasa?.tasa ?? null), [costosUsd, tasa]);

  return { costoDe, tasaDelDolar };
}
