'use client';

/**
 * El alta de un conduce: factura relacionada, fecha, transporte, lineas a
 * despachar y observaciones. Salio de `page.tsx` al partirla (lote 226), con el
 * mismo marcado. Solo pinta: el estado vive en `useFormularioConduce`, que crea
 * la pagina, para que lo escrito sobreviva a cancelar como hasta ahora.
 */
import { ArrowLeft, Check, FileText, Package, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FormularioConduce } from '../hooks/useFormularioConduce';

export function FormularioDeConduce({
  formulario,
  onSalir,
}: {
  formulario: FormularioConduce;
  /** "Volver al listado" y "Cancelar". */
  onSalir: () => void;
}) {
  const f = formulario;
  return (
    <>
      <div>
        <button
          onClick={onSalir}
          className="flex items-center gap-1 text-xs font-semibold text-[#C5A059] hover:underline mb-2"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al listado
        </button>
        <h2 className="text-2xl font-bold text-[#003366]">Nuevo Conduce de Entrega</h2>
        <p className="text-slate-500 text-sm">Registre un nuevo despacho de mercancías sobre una factura existente.</p>
      </div>

      <form onSubmit={f.handleSubmit} className="space-y-6">
        {/* Select Invoice & Driver */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 flex flex-col justify-end">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Factura Relacionada</label>
              {f.targetInvoice ? (
                <div className="flex items-center justify-between border border-emerald-200 bg-emerald-50/50 rounded-xl px-4 py-2.5">
                  <div>
                    <div className="text-xs font-bold text-emerald-800 font-mono">NCF: {f.targetInvoice.ncf}</div>
                    <div className="text-[11px] text-slate-500">{f.targetInvoice.buyerName || 'Consumidor Final'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={f.descartarFactura}
                    className="text-xs text-rose-600 font-bold hover:underline"
                  >
                    Cambiar Factura
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={f.abrirBuscador}
                  className="w-full h-8 text-xs font-semibold text-[#003366] dark:text-[#C5A059] border-dashed border-[#003366]/40 hover:border-[#003366] hover:bg-[#003366]/5 transition gap-1.5 justify-center cursor-pointer"
                >
                  <FileText className="h-3.5 w-3.5 text-[#C5A059]" />
                  <span>Vincular Factura Afectada</span>
                </Button>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#001e40]">Fecha de Despacho</label>
              <input
                type="date"
                required
                value={f.deliveryDate}
                onChange={(e) => f.setDeliveryDate(e.target.value)}
                className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#001e40]">Nombre del Chofer</label>
              <input
                type="text"
                placeholder="Ej. Juan Pérez"
                value={f.driverName}
                onChange={(e) => f.setDriverName(e.target.value)}
                className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#001e40]">Licencia Chofer</label>
              <input
                type="text"
                placeholder="001-0000000-0"
                value={f.driverLicense}
                onChange={(e) => f.setDriverLicense(e.target.value)}
                className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#001e40]">Placa del Vehículo</label>
              <input
                type="text"
                placeholder="L123456"
                value={f.vehiclePlate}
                onChange={(e) => f.setVehiclePlate(e.target.value)}
                className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#001e40]">Responsable Despacho</label>
              <input
                type="text"
                placeholder="Firma autorizada"
                value={f.dispatcherName}
                onChange={(e) => f.setDispatcherName(e.target.value)}
                className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Line dispatch checklist */}
        {f.targetInvoice && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-100 px-4 py-3">
              <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-[#003366]" /> Líneas de Despacho Físico
              </span>
            </div>
            <div className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200">
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left">Artículo / Servicio</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Facturado</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Entregado Ant.</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Pendiente</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Despachar Hoy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {f.dispatchLines.map((line, idx) => (
                      <tr key={`${line.productId}-${idx}`} className="group">
                        <td className="px-4 py-2.5 font-medium text-slate-800 text-xs">{line.productName}</td>
                        <td className="px-4 py-2.5 text-center text-slate-500 text-xs">{line.invoicedQty}</td>
                        <td className="px-4 py-2.5 text-center text-slate-500 text-xs">{line.previouslyDelivered}</td>
                        <td className="px-4 py-2.5 text-center text-indigo-600 font-bold text-xs">{line.pendingQty}</td>
                        <td className="px-4 py-2.5 text-center">
                          <input
                            type="number"
                            min="0"
                            max={line.pendingQty}
                            value={line.quantity}
                            onChange={(e) => f.cambiarCantidad(idx, e.target.value)}
                            className="w-20 text-center h-8 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Notes / Observaciones */}
              <div className="border-t border-slate-100 pt-6 mt-6">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Observaciones Contables / Notas de Entrega</label>
                <textarea
                  rows={3}
                  value={f.notesText}
                  onChange={(e) => f.setNotesText(e.target.value)}
                  placeholder="Ingrese notas particulares del chofer, dirección detallada, condiciones de la mercancía, etc."
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50"
                />
              </div>
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onSalir}
            className="border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold h-8 px-3 py-1.5 rounded-lg text-xs transition"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={f.submitting || !f.targetInvoice}
            className="bg-[#003366] hover:bg-[#002244] text-white font-bold h-8 px-3 py-1.5 rounded-lg shadow-md transition flex items-center gap-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {f.submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Registrar Conduce
          </button>
        </div>
      </form>
    </>
  );
}
