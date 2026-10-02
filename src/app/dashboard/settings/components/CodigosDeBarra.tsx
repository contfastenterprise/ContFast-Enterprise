/**
 * Como se generan los codigos de barra de los productos (lote 188).
 * Sale de `settings/page.tsx` en el lote 238, movido tal cual: solo pinta.
 */
import { Layers } from 'lucide-react';
import type { Ajustes } from '../hooks/useAjustes';

export function CodigosDeBarra({ a }: { a: Ajustes }) {
  return (
                <div className="col-span-1 md:col-span-2 mt-6">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Layers className="w-4 h-4 text-[#003366]" />
                      <h4 className="text-sm font-bold text-[#003366]">Códigos de Barra</h4>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-3">
                      Pertenece a la configuración de los <strong>productos</strong>: con esto se generan
                      los códigos de barra al crear un producto que no trae el suyo.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Tipo Predeterminado</label>
                      <select
                        value={a.formData.barcodeDefaultType}
                        onChange={e => a.setFormData({ ...a.formData, barcodeDefaultType: e.target.value })}
                        className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 font-medium text-slate-900 bg-slate-50"
                      >
                        <option value="code128">Code 128 (Predeterminado)</option>
                        <option value="ean13">EAN-13</option>
                        <option value="ean8">EAN-8</option>
                        <option value="upca">UPC-A</option>
                        <option value="qrcode">Código QR</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Prefijo para Auto-Generación</label>
                      <input
                        type="text"
                        value={a.formData.barcodePrefix}
                        onChange={e => a.setFormData({ ...a.formData, barcodePrefix: e.target.value })}
                        className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 font-semibold"
                        placeholder="COD"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Longitud de Código Automático</label>
                      <input
                        type="number"
                        min="4"
                        max="20"
                        value={a.formData.barcodeLength}
                        onChange={e => a.setFormData({ ...a.formData, barcodeLength: parseInt(e.target.value) || 9 })}
                        className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 font-mono"
                      />
                    </div>
                    </div>
                  </div>
                </div>
  );
}
