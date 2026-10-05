"use client";

/**
 * La cotizacion del visitante (lote 233). La tienda no tiene cuentas (decision
 * del dueno): el carrito es la cotizacion de quien lo arma y no se envia a
 * ningun sitio. Se puede ajustar, quitar e IMPRIMIR (o guardar en PDF desde el
 * dialogo de impresion del navegador).
 *
 * Antes, "Enviar mi cotizacion" exigia una cuenta y creaba la cotizacion en el
 * sistema. Medido el 2026-09-30: nunca se uso (0 cuentas de cliente, 0
 * cotizaciones de la tienda).
 *
 * El carrito se lee en un EFECTO (el servidor no tiene `localStorage`; leerlo al
 * pintar es el error de hidratacion del lote 195), y los precios llegan del
 * servidor en `catalogo`.
 */
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Trash2, Plus, Minus, Printer } from 'lucide-react';
import { armarCotizacion, cambiarCantidad, CLAVE_CARRITO, leerCarrito, type ProductoCotizable, type RenglonGuardado } from '@/services/storefront/cotizacion';
import { precioDeTienda, inicialesDe } from '@/services/storefront/catalogo';
import { formatDateDisplay } from '@/utils/fechasLocales';
import { FOTO_ENTERA } from '@/utils/fotoEntera';
import clsx from 'clsx';
import { BotonTienda, EnlaceTienda } from '@/components/storefront/BotonTienda';
import { FOCO_TIENDA } from '@/components/storefront/botonTiendaVariantes';
import EstadoVacio from '@/components/storefront/EstadoVacio';

type Empresa = { name: string; rnc: string; phone: string | null; email: string | null; address: string | null };

export default function CartPageClient({ empresaSlug, catalogo, empresa }: {
  empresaSlug: string; catalogo: ProductoCotizable[]; empresa: Empresa;
}) {
  const [carrito, setCarrito] = useState<RenglonGuardado[]>([]);
  const [listo, setListo] = useState(false);
  const [fecha, setFecha] = useState('');

  const cargar = useCallback(() => {
    try { setCarrito(leerCarrito(localStorage.getItem(CLAVE_CARRITO))); } catch { setCarrito([]); }
  }, []);

  useEffect(() => {
    cargar();
    setListo(true);
    setFecha(formatDateDisplay(new Date()));
    const deOtraPestana = (e: StorageEvent) => { if (e.key === CLAVE_CARRITO) cargar(); };
    window.addEventListener('storage', deOtraPestana);
    window.addEventListener('cart_updated', cargar);
    return () => {
      window.removeEventListener('storage', deOtraPestana);
      window.removeEventListener('cart_updated', cargar);
    };
  }, [cargar]);

  const guardar = (nuevo: RenglonGuardado[]) => {
    try { localStorage.setItem(CLAVE_CARRITO, JSON.stringify(nuevo)); } catch { /* navegador sin almacenamiento */ }
    setCarrito(nuevo);
    window.dispatchEvent(new Event('cart_updated'));
  };

  if (!listo) return <div className="py-20" aria-busy="true" />;

  const cot = armarCotizacion(carrito, catalogo);

  if (cot.renglones.length === 0 && cot.noDisponibles.length === 0) {
    return (
      <EstadoVacio titulo="Tu cotización está vacía" texto="Añade productos desde el catálogo para ver aquí sus precios y el total."
        className="mt-8 border-t border-slate-200">
        <EnlaceTienda href={`/${empresaSlug}/productos`}>Ver productos</EnlaceTienda>
      </EstadoVacio>
    );
  }

  return (
    <div className="mt-8">
      {/* Solo en papel: quien emite la cotizacion y cuando. */}
      <div className="hidden print:mb-6 print:block">
        <p className="text-xl font-semibold uppercase tracking-[0.15em]">{empresa.name}</p>
        <p className="text-sm">RNC {empresa.rnc}{empresa.phone ? ` · Tel. ${empresa.phone}` : ''}{empresa.email ? ` · ${empresa.email}` : ''}</p>
        {empresa.address && <p className="text-sm">{empresa.address}</p>}
        <p className="mt-4 text-lg font-semibold uppercase tracking-[0.12em]">Cotización</p>
        <p className="text-sm">Fecha: {fecha}</p>
      </div>

      {cot.noDisponibles.length > 0 && (
        <div role="status" className="mb-6 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
          <p className="font-semibold">Ya no disponible{cot.noDisponibles.length > 1 ? 's' : ''}:</p>
          <ul className="mt-1 space-y-1">
            {cot.noDisponibles.map((r) => (
              <li key={r.productId} className="flex items-center justify-between gap-3">
                <span>{r.nombre}</span>
                <BotonTienda type="button" variante="enlace" tamano="xs" onClick={() => guardar(cambiarCantidad(carrito, r.productId, 0))}
                  aria-label={`Quitar ${r.nombre}`}>Quitar</BotonTienda>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px] print:block">
        {/* Lote 282: en el movil la fila no cabia (el nombre quedaba en 50 px, partido, y el precio
            montado sobre la cantidad). Ahi la foto y el nombre van en una linea y los mandos debajo. */}
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {cot.renglones.map((r) => (
            <li key={r.productId} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-5 sm:flex-nowrap sm:gap-6 print:py-2">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center bg-[#f4f4f3] print:hidden">
                {r.imageUrl
                  ? <img src={r.imageUrl} alt="" className={FOTO_ENTERA} />
                  : <span className="text-xl font-light tracking-[0.2em] text-slate-300" aria-hidden="true">{inicialesDe(r.nombre)}</span>}
              </div>
              <div className="min-w-0 flex-1 basis-[calc(100%-6rem)] sm:basis-0">
                <Link href={`/${empresaSlug}/productos/${r.slug}`} className={clsx('rounded-sm text-[15px] text-slate-900 hover:underline underline-offset-4', FOCO_TIENDA)}>{r.nombre}</Link>
                <p className="mt-1 text-sm text-slate-500">
                  {precioDeTienda(r.precio)} <span className="text-xs uppercase tracking-wider">c/u + ITBIS</span>
                  <span className="hidden print:inline"> · Cantidad: {r.cantidad}</span>
                </p>
              </div>
              <div role="group" aria-label={`Cantidad de ${r.nombre}`} className="ml-24 flex items-center border border-slate-300 sm:ml-0 print:hidden">
                <button type="button" onClick={() => guardar(cambiarCantidad(carrito, r.productId, r.cantidad - 1))} aria-label="Una menos"
                  disabled={r.cantidad <= 1} className={clsx('flex h-9 w-9 items-center justify-center text-slate-600 hover:text-slate-900 disabled:opacity-30', FOCO_TIENDA)}>
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <span className="w-9 text-center text-sm text-slate-900">{r.cantidad}</span>
                <button type="button" onClick={() => guardar(cambiarCantidad(carrito, r.productId, r.cantidad + 1))} aria-label="Una más"
                  className={clsx('flex h-9 w-9 items-center justify-center text-slate-600 hover:text-slate-900', FOCO_TIENDA)}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <p className="ml-auto w-28 shrink-0 text-right text-[15px] text-slate-900 sm:ml-0">{precioDeTienda(r.importe)}</p>
              <button type="button" onClick={() => guardar(cambiarCantidad(carrito, r.productId, 0))} aria-label={`Quitar ${r.nombre} de la cotización`}
                className={clsx('flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:text-red-600 print:hidden', FOCO_TIENDA)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        <aside aria-label="Resumen de la cotización" className="h-fit border border-slate-200 p-6 lg:sticky lg:top-40 print:mt-6 print:border-0 print:p-0">
          <p className="mb-5 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-900">Resumen</p>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600"><dt>Subtotal ({cot.unidades} {cot.unidades === 1 ? 'unidad' : 'unidades'})</dt><dd>{precioDeTienda(cot.subtotal)}</dd></div>
            <div className="flex justify-between text-slate-600"><dt>ITBIS (18 %)</dt><dd>{precioDeTienda(cot.itbis)}</dd></div>
            <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-900"><dt>Total</dt><dd>{precioDeTienda(cot.total)}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            Precios sujetos a confirmación de inventario. Esta cotización no es una factura ni un comprobante fiscal.
            {empresa.phone && ` Para pedir, llámanos al ${empresa.phone}.`}
          </p>
          <div className="mt-6 space-y-3 print:hidden">
            <BotonTienda type="button" tamano="lg" onClick={() => window.print()} disabled={cot.renglones.length === 0} className="w-full">
              <Printer className="h-4 w-4" aria-hidden="true" />
              Imprimir cotización
            </BotonTienda>
            <EnlaceTienda href={`/${empresaSlug}/productos`} variante="contorno" tamano="lg" className="flex w-full">
              Seguir viendo productos
            </EnlaceTienda>
          </div>
        </aside>
      </div>
    </div>
  );
}
