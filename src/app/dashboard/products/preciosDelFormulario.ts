/**
 * Lote 310: cuándo el formulario de Productos recalcula los precios desde el costo.
 *
 * Hasta este lote lo hacía un efecto que miraba `formData.cost`, y ese efecto corría también al
 * ABRIR un producto (`handleEdit` llena el formulario y deja el autocálculo puesto). Así, el
 * formulario enseñaba los precios de la fórmula del lote 265 (`costo / (1 - margen)`) mientras el
 * producto tenía guardados otros — los del recargo viejo, `costo × (1 + margen)`, en 76 de 86
 * productos de PRODUCCIÓN (medido el 2026-10-08, `medir_precios_nivel_310.ts`). La factura y la
 * cotización cobran lo GUARDADO, así que el dueño veía un precio en Productos y otro al facturar
 * (Canaleta Cajón Roble, costo 700: proveedor 777,78 en el formulario, 770 en la factura). Y peor:
 * abrir un producto y pulsar Guardar sin tocar nada le cambiaba los precios.
 *
 * Ahora se recalcula solo por un gesto de quien edita: al ESCRIBIR el costo con el autocálculo
 * puesto, o al ENCENDER el autocálculo. Abrir un producto enseña lo guardado, que es lo que se cobra.
 */
import { preciosDesdeCosto } from '@/services/precios/margen';

export interface PreciosDelFormulario {
  cost: string;
  price: string;
  priceConsumidor: string;
  priceMayorista: string;
  priceProveedor: string;
}

/** El formulario con los cuatro precios calculados desde su costo; sin costo válido, tal cual. */
export function conPreciosDelCosto<T extends PreciosDelFormulario>(form: T): T {
  if (form.cost === '' || form.cost == null) return form;
  const costo = Number(form.cost);
  if (!Number.isFinite(costo) || costo < 0) return form;
  const p = preciosDesdeCosto(costo);
  return {
    ...form,
    price: p.price.toFixed(2),
    priceConsumidor: p.priceConsumidor.toFixed(2),
    priceMayorista: p.priceMayorista.toFixed(2),
    priceProveedor: p.priceProveedor.toFixed(2),
  };
}

/** Lo que pasa al escribir el costo: con el autocálculo puesto, los precios lo siguen. */
export function alCambiarElCosto<T extends PreciosDelFormulario>(form: T, costo: string, autocalcular: boolean): T {
  const nuevo = { ...form, cost: costo };
  return autocalcular ? conPreciosDelCosto(nuevo) : nuevo;
}
