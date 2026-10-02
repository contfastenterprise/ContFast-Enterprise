/**
 * Configuracion > Empresa: la cuenta de mSeller y la clave de API de cada ambiente.
 * Sale de `settings/page.tsx` en el lote 238, movido tal cual: solo pinta.
 */
import { Settings as SettingsIcon, Lock, Eye, EyeOff } from 'lucide-react';
import type { Ajustes } from '../hooks/useAjustes';

export function IntegracionMseller({ a }: { a: Ajustes }) {
  return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-3">
                <SettingsIcon className="w-5 h-5 text-[#003366]" />
                <h3 className="font-bold text-[#003366]">Integración mSeller API</h3>
              </div>
              <div className="p-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
                  <Lock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    <strong>Seguridad:</strong> Las contraseñas y llaves de API se encriptan de forma segura (AES-256) antes de almacenarse en la base de datos. Una vez guardadas, no podrán ser visualizadas.
                  </p>
                </div>

                {/* Auditoria ISO-13 e ISO-16: dos columnas porque son dos cosas
                    distintas.

                    IZQUIERDA -- la cuenta de la empresa: servidor, usuario y
                    contrasena. Son los mismos para los tres ambientes.

                    DERECHA -- lo unico que cambia entre ambientes: la clave de
                    API. mSeller emite una distinta para pruebas, certificacion y
                    produccion.

                    Antes habia aqui un segundo selector "Ambiente mSeller",
                    siempre deshabilitado, espejo de otro ajuste y escribiendo en
                    una columna que ninguna resolucion consultaba. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

                  {/* ── Cuenta de la empresa ── */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">URL del Servidor</label>
                      <input
                        type="text"
                        disabled={!a.isSistemas}
                        value={a.formData.msellerUrl}
                        onChange={e => a.setFormData({ ...a.formData, msellerUrl: e.target.value })}
                        className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        placeholder="https://api.mseller.app/v1"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Correo Electrónico (Usuario)</label>
                      <input
                        type="email"
                        disabled={!a.isSistemas}
                        value={a.formData.msellerEmail}
                        onChange={e => a.setFormData({ ...a.formData, msellerEmail: e.target.value })}
                        className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        placeholder="usuario@empresa.com"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Contraseña mSeller</label>
                      <div className="relative">
                        <input
                          type={a.showMsellerPassword ? "text" : "password"}
                          disabled={!a.isSistemas}
                          value={a.formData.msellerPassword}
                          onChange={e => a.setFormData({ ...a.formData, msellerPassword: e.target.value })}
                          className="w-full h-8 pl-3 pr-10 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 placeholder-slate-400 text-slate-900 bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                          placeholder={a.hasMsellerPassword ? "•••••••• (Configurada)" : "Ingresa contraseña"}
                        />
                        <button
                          type="button"
                          onClick={() => a.setShowMsellerPassword(!a.showMsellerPassword)}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                        >
                          {a.showMsellerPassword ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                        El usuario y la contraseña son los mismos para todos los ambientes.
                      </p>
                    </div>
                  </div>

                  {/* ── Lo que cambia por ambiente ── */}
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">
                        Ambiente de esta clave
                      </label>
                      <select
                        disabled={!a.isSistemas}
                        value={a.credencialesEntorno}
                        onChange={e => {
                          // Al cambiar de ambiente se vacia el campo. Si se quedara
                          // escrito, guardar otra vez copiaria la clave de un
                          // ambiente al otro sin que nadie se diera cuenta.
                          a.setCredencialesEntorno(e.target.value);
                          a.setFormData(f => ({ ...f, msellerApiKey: '' }));
                        }}
                        className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 font-medium text-slate-900 bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="TesteCF">Pruebas (TesteCF)</option>
                        <option value="CerteCF">Certificación (CerteCF)</option>
                        <option value="eCF">Producción (eCF)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Token de API (API Key)</label>
                      <input
                        type="password"
                        disabled={!a.isSistemas}
                        value={a.formData.msellerApiKey}
                        onChange={e => a.setFormData({ ...a.formData, msellerApiKey: e.target.value })}
                        className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 placeholder-slate-400 text-slate-900 bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                        placeholder={a.claveYaConfigurada ? "•••••••• (Configurada)" : "Ingresa el token de API"}
                      />
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      mSeller entrega una clave de API <strong>distinta para cada ambiente</strong>. Guarda la de
                      cada uno por separado.
                      {' '}
                      {a.entornosMseller.length === 0
                        ? 'Todavía no hay clave guardada para ningún ambiente.'
                        : `Con clave: ${a.entornosMseller.join(', ')}.`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
  );
}
