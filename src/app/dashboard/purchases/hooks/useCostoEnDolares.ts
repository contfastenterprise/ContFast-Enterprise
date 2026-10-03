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
 * Se carga UNA vez al abrir la pantalla. Si no se puede (sin permiso de ver el catalogo, sin la
 * migracion, sin red), la compra funciona como siempre, con el costo de catalogo: no es motivo para
 * frenar una compra.
 */
import { useCallback, useEffect, useState } from 'react';
import { leerRespuesta } from '@/utils/leerRespuesta';
import { costoParaCompra, type Renglon, type Tasa } from '@/services/precios/preciosEnDolares';

export type OrigenEnDolares = { costoUsd: number; tasa: number };

export function useCostoEnDolares() {
  const [costosUsd, setCostosUsd] = useState<Map<string, number>>(() => new Map());
  const [tasa, setTasa] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      const leido = await leerRespuesta<{ data: { tasa: Tasa | null; renglones: Renglon[] } }>(await fetch('/api/v1/products/dolar'));
      if (!leido.bien) return;
      setTasa(leido.cuerpo.data.tasa?.tasa ?? null);
      setCostosUsd(new Map(leido.cuerpo.data.renglones.map((r) => [r.productId, r.costoUsd])));
    } catch {
      //  Sin red: la compra sigue con el costo de catalogo.
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  /** El costo con que entra el producto: en dolares por la tasa si lo sigue, o el de catalogo. */
  const costoDe = useCallback((prod: { id: string; cost?: unknown }) =>
    costoParaCompra(prod.cost, costosUsd.get(prod.id), tasa), [costosUsd, tasa]);

  /** De donde sale el costo de un producto que sigue al dolar (para ensenarlo en la linea). */
  const origenDe = useCallback((productId: string): OrigenEnDolares | null => {
    const costoUsd = costosUsd.get(productId);
    return costoUsd && tasa ? { costoUsd, tasa } : null;
  }, [costosUsd, tasa]);

  return { costoDe, origenDe };
}
