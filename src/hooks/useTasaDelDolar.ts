'use client';

/**
 * Lote 261: la tasa del dolar en Compras y Facturacion, con la opcion de cambiarla.
 *
 * Lee lo mismo que la pantalla de Productos (`GET /api/v1/products/dolar`): la tasa vigente, los
 * productos que siguen al dolar con su costo en US$, y si quien mira puede escribir la tasa (lo
 * dice el SERVIDOR con `puedeAplicar`: administracion y sistemas). Cambiarla guarda la tasa Y
 * aplica los precios en una sola peticion (`aplicar: true`), por decision del dueño.
 *
 * Si no se puede leer (sin permiso de ver el catalogo, sin la migracion 0017, sin red) la pantalla
 * sigue como siempre: el control no sale y la compra usa el costo de catalogo. No es motivo para
 * frenar una compra ni una venta.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { leerRespuesta } from '@/utils/leerRespuesta';
import { leerTasa, type Renglon, type Tasa } from '@/services/precios/preciosEnDolares';
import { mensajeDelCambio, type ResultadoDelCambio } from '@/services/precios/cambioDeTasa';

const DIRECCION = '/api/v1/products/dolar';

/** Lo que recibe la pantalla al cambiar la tasa, para poner al dia lo que tenga a medio hacer. */
export interface CambioDeTasa extends ResultadoDelCambio {
  anterior: number | null;
  nueva: number;
  costosUsd: ReadonlyMap<string, number>;
}

export function useTasaDelDolar(alCambiar?: (c: CambioDeTasa) => void | Promise<void>) {
  const [tasa, setTasa] = useState<Tasa | null>(null);
  const [hoy, setHoy] = useState<string | null>(null);
  const [puedeCambiar, setPuedeCambiar] = useState(false);
  const [costosUsd, setCostosUsd] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [leida, setLeida] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  //  Dos clics seguidos llegan antes de volver a pintar: la guarda va en un `ref` (lote 227).
  const enCurso = useRef(false);
  //  La ultima `alCambiar` de la pantalla, no la del primer render: la pantalla la redefine en
  //  cada pintada con su estado de ese momento (las lineas, "sin ITBIS").
  const avisar = useRef(alCambiar);
  useEffect(() => { avisar.current = alCambiar; }, [alCambiar]);

  const cargar = useCallback(async () => {
    try {
      const leido = await leerRespuesta<{ data: { tasa: Tasa | null; hoy: string; renglones: Renglon[]; puedeAplicar: boolean } }>(
        await fetch(DIRECCION),
      );
      if (!leido.bien) return;
      const d = leido.cuerpo.data;
      setTasa(d.tasa);
      setHoy(d.hoy);
      setPuedeCambiar(!!d.puedeAplicar);
      setCostosUsd(new Map(d.renglones.map((r) => [r.productId, r.costoUsd])));
      setLeida(true);
    } catch {
      //  Sin red: la pantalla sigue sin el control.
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  /** Guarda la tasa escrita y aplica los precios. Devuelve si se hizo. */
  const cambiar = useCallback(async (texto: string): Promise<boolean> => {
    const leidaTasa = leerTasa(texto);
    if (!leidaTasa.bien) {
      toast.error(leidaTasa.mensaje);
      return false;
    }
    if (enCurso.current) return false;
    enCurso.current = true;
    setOcupado(true);
    try {
      const leido = await leerRespuesta<{ data: { tasa: Tasa } & ResultadoDelCambio }>(await fetch(`${DIRECCION}/tasa`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasa: leidaTasa.valor, aplicar: true }),
      }));
      if (!leido.bien) {
        toast.error(leido.mensaje || 'No se pudo cambiar la tasa.');
        return false;
      }
      const d = leido.cuerpo.data;
      const anterior = tasa?.tasa ?? null;
      setTasa(d.tasa);
      toast.success(mensajeDelCambio(d.tasa.tasa, d));
      await avisar.current?.({ anterior, nueva: d.tasa.tasa, costosUsd, aplicados: d.aplicados, atados: d.atados });
      return true;
    } catch {
      toast.error('No se pudo cambiar la tasa: revisa la conexión.');
      return false;
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }, [tasa, costosUsd]);

  return {
    tasa,
    hoy,
    puedeCambiar,
    costosUsd,
    /** Si hay algo que ensenar: una tasa escrita o productos que siguen al dolar. */
    enUso: leida && (tasa !== null || costosUsd.size > 0),
    ocupado,
    cambiar,
  };
}

export type TasaDelDolar = ReturnType<typeof useTasaDelDolar>;
