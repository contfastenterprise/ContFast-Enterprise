/**
 * Configuracion > Empresa: modo del sistema, impresion, limites y conduces automaticos.
 * Sale de `settings/page.tsx` en el lote 238, movido tal cual: solo pinta.
 */
import { Building, FileText, Truck, Printer, Zap, Copy } from 'lucide-react';
import type { Ajustes } from '../hooks/useAjustes';
import { CodigosDeBarra } from './CodigosDeBarra';

export function ParametrosOperativos({ a }: { a: Ajustes }) {
  return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-3">
                <Building className="w-5 h-5 text-[#003366]" />
                <h3 className="font-bold text-[#003366]">Parámetros Operativos</h3>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Actividad Económica</label>
                  <input type="text" value={a.formData.businessActivity} onChange={e => a.setFormData({ ...a.formData, businessActivity: e.target.value })} className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50" />
                </div>

                {/*
                  ANTES esto era "Ambiente Sandbox/Produccion" y guardaba
                  'test' | 'production'. Eran DOS interruptores para una sola
                  decision -- este ajuste y el modo del sistema -- y podian
                  contradecirse: modo PRODUCCION con ambiente 'test' daba datos
                  reales con presentacion de ensayo, en silencio.

                  Ahora hay UNO: el modo. El ambiente de la DGII se deduce de
                  el y se muestra debajo sin poder tocarse, porque no es una
                  eleccion aparte sino una consecuencia.

                  CERTIFICACION existe en la base (0046) pero no se ofrece
                  todavia: el resto del sistema aun supone dos modos.
                */}
                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Zap className="w-3 h-3" /> Modo del sistema</label>
                  <select
                    disabled={!a.isSistemas}
                    value={a.formData.dgiiEnv}
                    onChange={e => a.setFormData({ ...a.formData, dgiiEnv: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 font-medium text-slate-900 bg-slate-50 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    <option value="PRUEBA">Pruebas</option>
                    <option value="PRODUCCION">Producción</option>
                  </select>
                  <p className={`mt-1.5 text-[11px] leading-relaxed ${a.formData.dgiiEnv === 'PRODUCCION' ? 'text-amber-700 font-semibold' : 'text-slate-600'}`}>
                    Comprobantes a la DGII:{' '}
                    <strong>
                      {a.formData.dgiiEnv === 'PRODUCCION' ? 'eCF — ambiente REAL'
                        : a.formData.dgiiEnv === 'CERTIFICACION' ? 'CerteCF — certificación'
                        : 'TesteCF — pruebas'}
                    </strong>
                    {a.formData.dgiiEnv === 'PRODUCCION'
                      ? '. Cada comprobante emitido es una presentación fiscal firme y consume tu secuencia autorizada.'
                      : '. Nada de lo que se emita tiene validez fiscal.'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Printer className="w-3 h-3" /> Formato de Impresión Predeterminado</label>
                  <select value={a.formData.printLayout} onChange={e => a.setFormData({ ...a.formData, printLayout: e.target.value })} className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 font-medium uppercase text-slate-900 bg-slate-50">
                    <option value="carta">Carta (8.5 x 11)</option>
                    <option value="80mm">Ticket 80mm</option>
                    <option value="58mm">Ticket 58mm</option>
                  </select>
                </div>

                {a.formData.printLayout === 'carta' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <Copy className="w-3 h-3" /> Cantidad de Copias (Solo Formato Carta)
                    </label>
                    <select
                      value={a.formData.printCopies}
                      onChange={e => a.setFormData({ ...a.formData, printCopies: parseInt(e.target.value) || 2 })}
                      className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 font-medium text-slate-900 bg-slate-50"
                    >
                      <option value={1}>1 Copia (Solo Original)</option>
                      <option value={2}>2 Copias (Original + Copia)</option>
                      <option value={3}>3 Copias</option>
                      <option value={4}>4 Copias</option>
                      <option value={5}>5 Copias</option>
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Las copias adicionales se rotularán automáticamente como "COPIA".
                    </p>
                  </div>
                )}

                <div className="col-span-1 md:col-span-2 border-t border-slate-100 pt-6 mt-2">
                  <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><FileText className="w-4 h-4" /> Límites y Automatizaciones</h4>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Límite para Notas de Crédito Automáticas (DOP)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-bold">$</span>
                    <input type="number" min="0" step="0.01" value={a.formData.maxCreditNoteApprovalAmount} onChange={e => a.setFormData({ ...a.formData, maxCreditNoteApprovalAmount: Number(e.target.value) })} className="w-full h-8 pl-8 pr-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 font-mono text-slate-900 bg-slate-50" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Límite para Retiro de Caja Chica (DOP)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-bold">$</span>
                    <input type="number" min="0" step="0.01" value={a.formData.maxCashOutApprovalAmount} onChange={e => a.setFormData({ ...a.formData, maxCashOutApprovalAmount: Number(e.target.value) })} className="w-full h-8 pl-8 pr-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 font-mono text-slate-900 bg-slate-50" />
                  </div>
                </div>

                <div className="col-span-1 md:col-span-2 flex items-center gap-3 bg-amber-50 p-4 rounded-lg border border-amber-100 mt-2">
                  <button
                    type="button"
                    onClick={() => a.setFormData({ ...a.formData, autoDeliveryNotes: !a.formData.autoDeliveryNotes })}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${a.formData.autoDeliveryNotes ? 'bg-amber-500' : 'bg-slate-300'
                      }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${a.formData.autoDeliveryNotes ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    />
                  </button>
                  <div>
                    <h4 className="text-sm font-bold text-amber-900 flex items-center gap-2"><Truck className="w-4 h-4" /> Conduces Automáticos</h4>
                    <p className="text-xs text-amber-700/80">Generar un borrador de remisión automáticamente al facturar productos físicos.</p>
                  </div>
                </div>


                {/* Códigos de barra
                    LOTE 188: era una tarjeta suelta al final de la pestaña, al
                    mismo nivel que la identidad de la empresa y la integracion con
                    mSeller -- y no lo es: es un parametro de los PRODUCTOS. Entra
                    aqui dentro y lo dice, para que nadie lo confunda con un ajuste
                    fiscal. Mismo criterio y misma separacion que el bloque de
                    WhatsApp del lote 187. */}
                <CodigosDeBarra a={a} />
              </div>
            </div>
  );
}
