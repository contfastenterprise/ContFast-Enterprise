/**
 * Configuracion > Empresa: nombre, RNC, contacto y logo; debajo, los avisos.
 * Sale de `settings/page.tsx` en el lote 238, movido tal cual: solo pinta.
 */
import { Image as ImageIcon, Lock, UploadCloud, X } from 'lucide-react';
import type { Ajustes } from '../hooks/useAjustes';
import { AvisosDelSistema } from './AvisosDelSistema';

export function IdentidadFiscal({ a }: { a: Ajustes }) {
  return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-3">
                <Lock className="w-5 h-5 text-[#003366]" />
                <h3 className="font-bold text-slate-800">Identidad Fiscal</h3>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Nombre Comercial</label>
                  <input
                    type="text"
                    disabled={a.isNameDisabled}
                    value={a.formData.name || ''}
                    onChange={e => a.setFormData({ ...a.formData, name: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">RNC</label>
                  <input
                    type="text"
                    disabled={a.isRncDisabled}
                    value={a.formData.rnc || ''}
                    onChange={e => a.setFormData({ ...a.formData, rnc: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Dirección de la Empresa</label>
                  <input
                    type="text"
                    value={a.formData.address || ''}
                    onChange={e => a.setFormData({ ...a.formData, address: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Teléfono de la Empresa</label>
                  <input
                    type="text"
                    value={a.formData.phone || ''}
                    onChange={e => a.setFormData({ ...a.formData, phone: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Correo Electrónico de la Empresa</label>
                  <input
                    type="email"
                    value={a.formData.email || ''}
                    onChange={e => a.setFormData({ ...a.formData, email: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 font-semibold"
                  />
                </div>
                <div className="col-span-1 md:col-span-2 border-t border-slate-100 pt-6">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Logo de la Empresa (Facturas y Reportes)</label>
                  <div className="flex items-start gap-4 mt-2">
                    {/* Botón de Subida (Izquierda, Pequeño) */}
                    <div className="w-24 h-24 flex-shrink-0">
                      <label className="flex flex-col items-center justify-center w-full h-full border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-white hover:bg-slate-50 transition-colors">
                        <UploadCloud className="w-6 h-6 text-slate-500 mb-1" />
                        <span className="text-[10px] text-slate-500/70 font-bold uppercase text-center leading-tight">Subir<br/>Logo</span>
                        <input type="file" className="hidden" accept="image/*" onChange={a.handleLogoUpload} />
                      </label>
                    </div>

                    {/* Previsualización del Logo (Derecha, Grande) */}
                    <div className="flex-1 max-w-sm relative group">
                      <div className="w-full h-24 border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-center overflow-hidden">
                        {a.formData.logoUrl ? (
                          <img src={a.formData.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                        ) : (
                          <div className="flex flex-col items-center text-slate-400">
                            <ImageIcon className="w-8 h-8 mb-2 opacity-30" />
                            <span className="text-xs font-medium opacity-50">Ningún logo cargado</span>
                          </div>
                        )}
                      </div>
                      {a.formData.logoUrl && (
                        <button type="button" onClick={() => a.setFormData({ ...a.formData, logoUrl: '' })} className="absolute -top-2 -right-2 bg-rose-100 text-rose-600 rounded-full p-1.5 hover:bg-rose-200 shadow-sm transition-colors opacity-0 group-hover:opacity-100" title="Remover Logo">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>


                {/*  Avisos del sistema.

                     LOTE 187: vive DENTRO de Identidad Fiscal, debajo del logo (pedido
                     del dueño). Antes estaba en la tarjeta de codigos de barra, donde
                     nadie lo encontro.

                     LOTE 200: aqui habia ademas un numero de WhatsApp. El canal se
                     RETIRO porque nunca llego a entregar un aviso: la cuenta solo tiene
                     el numero de PRUEBA de Meta y rechaza todo (#131037, medido el
                     2026-09-26). Queda el correo, que es el que funciona.  */}
                <AvisosDelSistema a={a} />
              </div>
            </div>
  );
}
