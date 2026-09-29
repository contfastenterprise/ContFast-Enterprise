'use client';

/**
 * La ventana "Buscar Facturas Pendientes de Despacho" del alta de un conduce.
 * Salio de `page.tsx` al partirla (lote 226), con el mismo marcado: solo pinta,
 * el estado y la busqueda viven en `useFormularioConduce`.
 */
import { Check, FileText, RefreshCw, X } from 'lucide-react';
//  Lote 227: `m` y no `motion`; el `LazyMotion` lo pone la pagina.
import { m, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import type { FormularioConduce } from '../hooks/useFormularioConduce';

export function BuscadorDeFacturas({ formulario }: { formulario: FormularioConduce }) {
  const f = formulario;
  return (
    <AnimatePresence>
      {f.showInvoiceSearch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-xl w-full overflow-hidden"
          >
            <div className="bg-[#003366] text-white px-4 py-3 flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2 text-base">
                <FileText className="w-5 h-5 text-[#C5A059]" /> Buscar Facturas Pendientes de Despacho
              </h3>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => f.setShowInvoiceSearch(false)}
                className="hover:bg-white/10 p-1.5 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Búsqueda por NCF, Cliente o RNC..."
                    aria-label="Buscar facturas por NCF, cliente o RNC"
                    value={f.invoiceSearchQuery}
                    onChange={(e) => f.setInvoiceSearchQuery(e.target.value)}
                    className="flex-1 h-8 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors"
                  />
                <Button
                  onClick={f.handleSearchInvoices}
                  variant="primary"
                  size="sm"
                  className="cursor-pointer"
                >
                  Buscar
                </Button>
              </div>

              <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
                {f.invoicesLoading ? (
                  <div className="flex justify-center py-12">
                    <RefreshCw className="h-6 w-6 animate-spin text-[#C5A059]" />
                  </div>
                ) : f.invoicesList.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm">
                    Busque facturas aceptadas con despachos pendientes (e-31, e-32, e-45).
                  </div>
                ) : (
                  f.invoicesList.map((inv) => (
                    //  Lote 227: un <button> y no un <div> con onClick, para que
                    //  se pueda elegir tambien con el teclado.
                    <button
                      type="button"
                      key={inv.id}
                      onClick={() => f.handleSelectInvoice(inv)}
                      className="w-full text-left p-4 hover:bg-slate-50 transition-colors flex justify-between items-center cursor-pointer group"
                    >
                      <div>
                        <div className="font-mono font-bold text-xs text-[#003366]">{inv.ncf}</div>
                        <div className="text-xs font-semibold text-slate-800">{inv.buyerName || 'Consumidor Final'}</div>
                        <div className="text-[10px] text-slate-500">Monto: RD$ {Number(inv.total).toLocaleString('es-DO')}</div>
                      </div>
                      <span className="text-xs font-bold text-[#C5A059] group-hover:underline flex items-center gap-1">
                        Vincular <Check className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
