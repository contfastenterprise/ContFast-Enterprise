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
      <div className="mt-8 border-t border-slate-200 py-16 text-center">
        <p className="text-lg text-slate-900">Tu cotización está vacía</p>
        <p className="mt-2 text-sm text-slate-500">Añade productos desde el catálogo para ver aquí sus precios y el total.</p>
        <Link href={`/${empresaSlug}/productos`}
          className="mt-8 inline-block rounded-full bg-[#001e40] px-8 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-white hover:bg-[#00142a]">
          Ver productos
        </Link>
      </div>
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
                <button type="button" onClick={() => guardar(cambiarCantidad(carrito, r.productId, 0))}
                  className="text-xs font-semibold uppercase tracking-wider underline underline-offset-4">Quitar</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px] print:block">
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {cot.renglones.map((r) => (
            <li key={r.productId} className="flex items-center gap-4 py-5 sm:gap-6 print:py-2">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center bg-[#f4f4f3] print:hidden">
                {r.imageUrl
                  ? <img src={r.imageUrl} alt="" className={FOTO_ENTERA} />
                  : <span className="text-xl font-light tracking-[0.2em] text-slate-300" aria-hidden="true">{inicialesDe(r.nombre)}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/${empresaSlug}/productos/${r.slug}`} className="text-[15px] text-slate-900 hover:underline underline-offset-4">{r.nombre}</Link>
                <p className="mt-1 text-sm text-slate-500">
                  {precioDeTienda(r.precio)} <span className="text-xs uppercase tracking-wider">c/u + ITBIS</span>
                  <span className="hidden print:inline"> · Cantidad: {r.cantidad}</span>
                </p>
              </div>
              <div role="group" aria-label={`Cantidad de ${r.nombre}`} className="flex items-center border border-slate-300 print:hidden">
                <button type="button" onClick={() => guardar(cambiarCantidad(carrito, r.productId, r.cantidad - 1))} aria-label="Una menos"
                  disabled={r.cantidad <= 1} className="flex h-9 w-9 items-center justify-center text-slate-600 hover:text-slate-900 disabled:opacity-30">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-9 text-center text-sm text-slate-900">{r.cantidad}</span>
                <button type="button" onClick={() => guardar(cambiarCantidad(carrito, r.productId, r.cantidad + 1))} aria-label="Una más"
                  className="flex h-9 w-9 items-center justify-center text-slate-600 hover:text-slate-900">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="w-28 shrink-0 text-right text-[15px] text-slate-900">{precioDeTienda(r.importe)}</p>
              <button type="button" onClick={() => guardar(cambiarCantidad(carrito, r.productId, 0))} aria-label={`Quitar ${r.nombre} de la cotización`}
                className="text-slate-400 hover:text-red-600 print:hidden">
                <Trash2 className="h-4 w-4" />
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
            <button type="button" onClick={() => window.print()} disabled={cot.renglones.length === 0}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#001e40] text-sm font-semibold uppercase tracking-[0.15em] text-white hover:bg-[#00142a] disabled:opacity-40">
              <Printer className="h-4 w-4" aria-hidden="true" />
              Imprimir cotización
            </button>
            <Link href={`/${empresaSlug}/productos`}
              className="flex h-12 w-full items-center justify-center rounded-full border border-slate-900 text-sm font-semibold uppercase tracking-[0.15em] text-slate-900 hover:bg-slate-900 hover:text-white">
              Seguir viendo productos
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
