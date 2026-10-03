'use client';

/**
 * "Precios en dolares" (lote 247): la tasa propia de la empresa, los productos
 * que la siguen y la confirmacion que les cambia el precio.
 *
 * Pedido del dueno (2026-10-02): la mayoria de los productos se compran en
 * dolares y la tasa cambia constantemente. Sus cuatro decisiones: tasa propia,
 * escrita por el cada dia, precios que se aplican CON SU CONFIRMACION, y un
 * costo en dolares fijado por producto.
 *
 * LOTE 262: lo de la confirmacion cambio (decision del dueño, 2026-10-03): guardar
 * la tasa ya aplica los precios a todos, como en Compras y Facturacion. La tabla y
 * "Aplicar precios" siguen para lo que cambia sin tocar la tasa: el costo o el
 * precio en dolares de un producto.
 *
 * El estado es de `usePreciosEnDolares`, que crea la pagina; aqui se pinta y se
 * pide la confirmacion.
 */
import { ArrowLeft, DollarSign } from 'lucide-react';
import { useConfirm } from '@/providers/confirm-provider';
import { escribirTasa, type Renglon } from '@/services/precios/preciosEnDolares';
import type { PreciosEnDolaresDeProductos } from '../hooks/usePreciosEnDolares';
import { TasaDelDia } from './TasaDelDia';
import { AtarProductoAlDolar } from './AtarProductoAlDolar';
import { TablaDePreciosEnDolares } from './TablaDePreciosEnDolares';

export function PreciosEnDolares({ d, alVolver }: { d: PreciosEnDolaresDeProductos; alVolver: () => void }) {
  const confirm = useConfirm();
  const { datos } = d;

  const confirmarYAplicar = async () => {
    if (!datos?.tasa || d.marcados.length === 0) return;
    const n = d.marcados.length;
    const si = await confirm({
      title: 'Aplicar los precios nuevos',
      description: `Se cambiará el costo y los precios de ${n} ${n === 1 ? 'producto' : 'productos'} con la tasa de RD$ ${escribirTasa(datos.tasa.tasa)} por dólar. ` +
        'Las facturas y cotizaciones ya hechas no cambian.',
    });
    if (si) await d.aplicar();
  };

  const confirmarYSoltar = async (r: Renglon) => {
    const si = await confirm({
      title: 'Dejar de seguir al dólar',
      description: `"${r.name}" dejará de actualizarse con la tasa. Sus precios se quedan como están ahora.`,
    });
    if (si) await d.soltar(r.productId);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-[#003366] font-display flex items-center gap-2">
            <DollarSign className="h-5 w-5" />Precios en dólares
          </h2>
          {/*  LOTE 262: guardar la tasa ya aplica los precios; "Aplicar precios" queda para
               reaplicar tras cambiar el costo o el precio en dolares de un producto.  */}
          <p className="text-xs text-slate-500 mt-0.5">
            Escribe la tasa del día: al guardarla se aplican los precios de todos los productos en dólares.
            Si cambias el costo o el precio en dólares de un producto, aplícalo con «Aplicar precios».
          </p>
        </div>
        <button type="button" onClick={alVolver}
          className="flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 transition">
          <ArrowLeft className="h-4 w-4" />Volver al catálogo
        </button>
      </div>

      {d.error && (
        <div role="alert" className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-semibold text-rose-700">{d.error}</p>
          <button type="button" onClick={d.cargar} className="h-8 px-3 rounded-lg bg-white border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-100">
            Reintentar
          </button>
        </div>
      )}

      {!datos && !d.error && <p className="text-sm text-slate-500 py-10 text-center">Cargando…</p>}

      {datos && (
        <>
          <TasaDelDia tasa={datos.tasa} historial={datos.historial} hoy={datos.hoy}
            puedeEscribir={datos.puedeAplicar} ocupado={d.ocupado} alGuardar={d.guardarTasa} />

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            {datos.puedeAplicar && (
              <AtarProductoAlDolar encontrados={d.encontrados} ocupado={d.ocupado} alBuscar={d.buscar} alAtar={d.atarVarios} />
            )}
            <TablaDePreciosEnDolares renglones={datos.renglones} marcados={d.marcados} puedeAplicar={datos.puedeAplicar}
              ocupado={d.ocupado} alMarcar={d.marcar} alMarcarTodos={d.marcarTodos} alGuardarCosto={d.atar} alGuardarPrecio={d.fijarPrecioUsd} alSoltar={confirmarYSoltar} />
            {datos.puedeAplicar && datos.renglones.length > 0 && (
              <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-slate-600">
                  {!datos.tasa
                    ? 'Escribe la tasa para ver cómo quedarían los precios.'
                    : d.marcados.length === 0
                      ? 'Ningún precio por cambiar: todos están al día con la tasa vigente.'
                      : `${d.marcados.length} ${d.marcados.length === 1 ? 'producto marcado' : 'productos marcados'}. El costo pasa a "costo en dólares × tasa"; el precio base, a "precio en dólares × tasa" si lo tiene, y los demás precios conservan su margen.`}
                </p>
                <button type="button" onClick={confirmarYAplicar} disabled={!datos.tasa || d.marcados.length === 0 || d.ocupado}
                  className="h-9 px-4 rounded-lg bg-[#C5A059] hover:bg-[#b08c4a] text-slate-950 text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed">
                  Aplicar precios
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
