'use client';

/**
 * El estado de "Precios en dolares" (lote 247): la tasa, los productos atados,
 * lo que cambiaria y la confirmacion.
 *
 * Lo crea la PAGINA de productos y se carga AL PULSAR el boton (`cargar`), no en
 * un efecto al montar: lo que se pide por una accion del usuario se pide en esa
 * accion (criterio de los lotes 224 y 236).
 *
 * Las guardas de re-entrada son `useRef` y no el estado: dos clics seguidos
 * llegan antes de volver a pintar y los dos verian el estado en `false`. Aqui
 * importa mas que en otros sitios: dos "Aplicar" son dos cambios de precio.
 */
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { leerRespuesta } from '@/utils/leerRespuesta';
import type { Renglon, Tasa } from '@/services/precios/preciosEnDolares';

const DIRECCION = '/api/v1/products/dolar';

export type DatosDeDolares = {
  tasa: Tasa | null;
  historial: Tasa[];
  renglones: Renglon[];
  /** El dia de RD segun el servidor. */
  hoy: string;
  puedeAplicar: boolean;
};

export type ProductoParaAtar = { id: string; sku: string | null; name: string; cost: number };

const json = (method: string, cuerpo: unknown): RequestInit =>
  ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });

/** Los que se marcan al cargar: los que cambiarian. Lo que no cambia no hace falta confirmarlo. */
export const losQueCambian = (renglones: Renglon[]) =>
  renglones.flatMap((r) => (r.calculo?.cambia ? [r.productId] : []));

export function usePreciosEnDolares() {
  /** La pantalla esta abierta (ocupa el sitio de la lista de productos). */
  const [abierta, setAbierta] = useState(false);
  const [datos, setDatos] = useState<DatosDeDolares | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [encontrados, setEncontrados] = useState<ProductoParaAtar[]>([]);
  const enCurso = useRef(false);
  const busqueda = useRef(0);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const leido = await leerRespuesta<{ data: DatosDeDolares }>(await fetch(DIRECCION));
      if (!leido.bien) { setError(leido.mensaje || 'No se pudieron cargar los precios en dólares.'); return; }
      setDatos(leido.cuerpo.data);
      setMarcados(losQueCambian(leido.cuerpo.data.renglones));
    } catch {
      setError('No se pudieron cargar los precios en dólares. Revisa la conexión.');
    }
  }, []);

  /** Abrir la pantalla la CARGA: se pide al pulsar, no en un efecto al montar. */
  const abrir = useCallback(() => { setAbierta(true); void cargar(); }, [cargar]);
  const cerrar = useCallback(() => setAbierta(false), []);

  /** Una escritura y, si salio, recargar: los precios nuevos los calcula el servidor. */
  const escribir = useCallback(async (peticion: () => Promise<Response>, fallo: string, bien: string): Promise<boolean> => {
    if (enCurso.current) return false;
    enCurso.current = true;
    setOcupado(true);
    try {
      const leido = await leerRespuesta(await peticion());
      if (!leido.bien) { toast.error(leido.mensaje || fallo); return false; }
      toast.success(bien);
      await cargar();
      return true;
    } catch {
      toast.error(`${fallo} Revisa la conexión.`);
      return false;
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }, [cargar]);

  const guardarTasa = useCallback((tasa: string) =>
    escribir(() => fetch(`${DIRECCION}/tasa`, json('PUT', { tasa })),
      'No se pudo guardar la tasa.', 'Tasa guardada. Los precios no cambian hasta que los confirmes.'), [escribir]);

  const atar = useCallback((productId: string, costoUsd: string) =>
    escribir(() => fetch(DIRECCION, json('PUT', { productIds: [productId], costoUsd })),
      'No se pudo guardar el costo en dólares.', 'Costo en dólares guardado.'), [escribir]);

  /** Lote 258: fija (o quita, vacio) el precio base en dolares de un producto. */
  const fijarPrecioUsd = useCallback((productId: string, precioUsd: string) =>
    escribir(() => fetch(DIRECCION, json('PATCH', { productId, precioUsd })),
      'No se pudo guardar el precio en dólares.',
      precioUsd.trim() === '' ? 'Precio en dólares quitado.' : 'Precio en dólares guardado.'), [escribir]);

  /** Lote 251: varios productos con el mismo costo, en una sola peticion (todo o nada). */
  const atarVarios = useCallback((productIds: string[], costoUsd: string) =>
    escribir(() => fetch(DIRECCION, json('PUT', { productIds, costoUsd })),
      'No se pudieron añadir los productos.',
      productIds.length === 1 ? 'Producto añadido.' : `${productIds.length} productos añadidos.`), [escribir]);

  const soltar = useCallback((productId: string) =>
    escribir(() => fetch(`${DIRECCION}?productId=${encodeURIComponent(productId)}`, { method: 'DELETE' }),
      'No se pudo soltar el producto.', 'El producto ya no sigue al dólar. Sus precios se quedan como están.'), [escribir]);

  /**
   * Aplica los precios con la tasa que se esta VIENDO: si ya no es la vigente, el
   * servidor lo rechaza. Solo viajan la tasa y los productos; los importes los
   * calcula el servidor.
   */
  const aplicarCon = useCallback((tasa: Tasa | null, productos: string[]) => {
    if (!tasa || productos.length === 0) return Promise.resolve(false);
    return escribir(() => fetch(`${DIRECCION}/aplicar`, json('POST', { tasa: tasa.tasa, productos })),
      'No se pudieron aplicar los precios.', 'Precios actualizados.');
  }, [escribir]);

  /** Aplica a los marcados, con la tasa en pantalla. */
  const aplicar = useCallback(() => aplicarCon(datos?.tasa ?? null, marcados), [aplicarCon, datos, marcados]);

  const marcar = useCallback((productId: string, si: boolean) =>
    setMarcados((prev) => (si ? [...prev.filter((id) => id !== productId), productId] : prev.filter((id) => id !== productId))), []);

  const marcarTodos = useCallback((si: boolean) =>
    setMarcados(si && datos ? losQueCambian(datos.renglones) : []), [datos]);

  /** Busca productos sin atar. Una respuesta vieja no pisa a una nueva (lote 111). */
  const buscar = useCallback(async (texto: string) => {
    const turno = ++busqueda.current;
    try {
      const leido = await leerRespuesta<{ data: { productos: ProductoParaAtar[] } }>(
        await fetch(`${DIRECCION}?buscar=${encodeURIComponent(texto)}`));
      if (turno !== busqueda.current) return;
      setEncontrados(leido.bien ? leido.cuerpo.data.productos : []);
    } catch {
      if (turno === busqueda.current) setEncontrados([]);
    }
  }, []);

  return { abierta, abrir, cerrar, datos, error, marcados, ocupado, encontrados, cargar, guardarTasa, atar, atarVarios, fijarPrecioUsd, soltar, aplicar, aplicarCon, marcar, marcarTodos, buscar };
}

export type PreciosEnDolaresDeProductos = ReturnType<typeof usePreciosEnDolares>;
