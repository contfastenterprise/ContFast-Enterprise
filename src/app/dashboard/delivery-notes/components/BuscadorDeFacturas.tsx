'use client';

/**
 * La ventana "Buscar Facturas Pendientes de Despacho" del alta de un conduce.
 * Salio de `page.tsx` al partirla (lote 226), con el mismo marcado: solo pinta,
 * el estado y la busqueda viven en `useFormularioConduce`.
 */
import { Check, FileText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
//  Lote 277: la ventana es la de la casa (`Modal`): foco, Escape y titulo anunciado.
import { Modal } from '@/components/ui/dialog';
import type { FormularioConduce } from '../hooks/useFormularioConduce';

export function BuscadorDeFacturas({ formulario }: { formulario: FormularioConduce }) {
  const f = formulario;
  return (
    //  Su fondo no cerraba la ventana: `cerrarAlPulsarFuera={false}` conserva eso.
    <Modal
      isOpen={f.showInvoiceSearch}
      onClose={() => f.setShowInvoiceSearch(false)}
      title="Buscar Facturas Pendientes de Despacho"
      icono={<FileText />}
      maxWidth="xl"
      cerrarAlPulsarFuera={false}
      sinRelleno
    >
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
                  type="button"
                  onClick={f.handleSearchInvoices}
                  variant="primary"
                  size="sm"
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
    </Modal>
  );
}
