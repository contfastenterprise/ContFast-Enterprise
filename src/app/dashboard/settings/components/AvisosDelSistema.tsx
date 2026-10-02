/**
 * El correo al que llegan los avisos de esta empresa (lotes 187, 200, 201 y 204).
 * Sale de `settings/page.tsx` en el lote 238, movido tal cual: solo pinta.
 */
import { MessageSquare } from 'lucide-react';
import { correoDeLaEmpresaParaAvisos, usaElCorreoDeLaEmpresa } from '@/services/avisos/avisoPorCorreo';
import type { Ajustes } from '../hooks/useAjustes';

export function AvisosDelSistema({ a }: { a: Ajustes }) {
  return (
                <div className="col-span-1 md:col-span-2 mt-6">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageSquare className="w-4 h-4 text-[#003366]" />
                      <h4 className="text-sm font-bold text-[#003366]">Avisos del sistema</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="ajuste-correo-de-destino" className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Correo de destino</label>
                        <input id="ajuste-correo-de-destino"
                          type="email"
                          value={a.formData.avisosCorreo || ''}
                          onChange={e => a.setFormData({ ...a.formData, avisosCorreo: e.target.value })}
                          placeholder="avisos@miempresa.com"
                          className={`w-full h-8 px-3 py-1.5 text-xs rounded-lg outline-none focus:ring-1 text-slate-900 bg-white ${
                            a.formData.avisosCorreo.trim() === ''
                              ? 'border-slate-200 focus:border-[#c5a059] focus:ring-[#c5a059]/20'
                              : a.correoDeAvisos
                                ? 'border-emerald-300 focus:border-emerald-400 focus:ring-emerald-200'
                                : 'border-amber-300 focus:border-amber-400 focus:ring-amber-200'
                          }`}
                        />
                        {/*  LOTE 200: el correo es HOY el canal que funciona. Por WhatsApp
                            no sale ninguno: el numero de la cuenta es el de prueba de
                            Meta y rechaza todo (#131037, medido el 2026-09-26). */}
                        {a.formData.avisosCorreo.trim() !== '' && !a.correoDeAvisos && (
                          <p className="text-[10px] text-amber-700 mt-1 leading-tight">
                            Escriba una sola dirección, con arroba y dominio.
                          </p>
                        )}
                        {a.correoDeAvisos && (
                          <p className="text-[10px] text-emerald-700 mt-1 font-mono">
                            Se enviará a {a.correoDeAvisos}
                          </p>
                        )}
                        {/*  LOTE 201, CASILLA EN EL 204: usar el correo de la empresa sin
                             escribirlo otra vez (pedido del dueño). Medido: las seis
                             empresas ya tienen uno válido en su ficha.

                             SE OFRECE, NO SE APLICA SOLO: "vacío = no recibir avisos" es
                             una decisión explícita (lotes 178 y 200). Si cayera por
                             defecto, las seis empezarían a recibir avisos sin que nadie
                             lo hubiera decidido.

                             NO SALE cuando no habría nada que ofrecer -- sin correo de
                             empresa válido --, que es el defecto del avatar del lote 192:
                             prometer un clic que no hace nada.

                             DESMARCAR VACÍA EL CAMPO, y no es una elección estética: el
                             estado de la casilla se DERIVA de lo que hay escrito (no hay
                             columna que lo guarde, así que nunca puede mentir). Si al
                             desmarcar se dejara el texto tal cual, seguiría siendo el
                             correo de la empresa y la casilla volvería a pintarse
                             marcada: un interruptor que no se puede apagar. Vacío es
                             además un estado que significa algo -- no recibir avisos --,
                             así que desmarcar dice justo eso.  */}
                        {(() => {
                          const deLaEmpresa = correoDeLaEmpresaParaAvisos(a.formData.email);
                          if (!deLaEmpresa) return null;
                          return (
                            <label className="mt-1.5 flex items-start gap-1.5 cursor-pointer w-fit">
                              <input
                                type="checkbox"
                                checked={usaElCorreoDeLaEmpresa(a.formData.email, a.formData.avisosCorreo)}
                                onChange={e => a.setFormData({
                                  ...a.formData,
                                  avisosCorreo: e.target.checked ? deLaEmpresa : '',
                                })}
                                className="mt-0.5 h-3 w-3 shrink-0 accent-[#003366] cursor-pointer"
                              />
                              <span className="text-[10px] font-bold text-[#003366] leading-tight">
                                Usar el correo de la empresa ({deLaEmpresa})
                              </span>
                            </label>
                          );
                        })()}
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Llegan a este correo los avisos <strong>graves y de advertencia</strong> de esta empresa:
                          un comprobante rechazado, un arqueo de caja descuadrado, una caja sin cerrar, un cheque
                          en garantía que se cobra pronto y el 606/607 pendiente de presentar.
                          Los informativos no se envían.
                          <br />
                          Déjelo <strong>vacío para no recibir ninguno</strong>. Cada aviso se manda una
                          sola vez. El correo es de esta empresa: los avisos de las demás no llegan aquí.
                        </p>
                      </div>
                    </div>

                  </div>
                </div>
  );
}
