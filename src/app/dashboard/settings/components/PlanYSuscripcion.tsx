/**
 * Configuracion > Plan y Suscripcion: el plan contratado y los disponibles.
 * Sale de `settings/page.tsx` en el lote 238, movido tal cual: solo pinta.
 */
import { FileText, Award, Users, Layers, Calendar } from 'lucide-react';
import { formatDateDisplay } from '@/utils/fechasLocales';
import type { Ajustes } from '../hooks/useAjustes';

export function PlanYSuscripcion({ subscription, availablePlans }: Pick<Ajustes, 'subscription' | 'availablePlans'>) {
  return (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-3">
              <Award className="w-5 h-5 text-[#C5A059]" />
              <h3 className="font-bold text-[#003366]">Plan y Suscripción</h3>
            </div>
            <div className="p-4">
              {subscription ? (
                <div>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-6">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Plan Contratado</p>
                      <h4 className="text-xl font-bold text-[#003366] mt-1">{subscription.planName}</h4>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${subscription.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                        <span className={`w-2 h-2 rounded-full ${subscription.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {subscription.status === 'active' ? 'Activo' : subscription.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                      <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Límite e-CF</p>
                        <p className="text-lg font-bold text-slate-800 mt-1">
                          {subscription.maxEcfLimit === -1 ? 'Ilimitado' : `${subscription.maxEcfLimit} / mes`}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                      <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Límite de Usuarios</p>
                        <p className="text-lg font-bold text-slate-800 mt-1">
                          {subscription.maxUsers === -1 ? 'Ilimitado' : `${subscription.maxUsers}`}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                      <div className="p-2 bg-violet-50 rounded-lg text-violet-600">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Límite de Almacenes</p>
                        <p className="text-lg font-bold text-slate-800 mt-1">
                          {subscription.maxWarehouses === -1 ? 'Ilimitado' : `${subscription.maxWarehouses}`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-semibold">
                        Vencimiento / Renovación:{' '}
                        <span className="text-slate-800 font-bold">
                          {formatDateDisplay(subscription.currentPeriodEnd)}
                        </span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium italic">
                      Para modificar su plan o límites, contacte a soporte.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-slate-500 font-medium">No se encontró una suscripción activa para esta empresa.</p>
                  <p className="text-xs text-slate-400 mt-1">Por favor, póngase en contacto con soporte técnico para activar su plan.</p>
                </div>
              )}
            </div>
          </div>

          {/* Otros Planes Disponibles */}
          {availablePlans.length > 0 && (
            <div className="mt-8 space-y-4">
              <h3 className="text-lg font-bold text-[#003366] flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#C5A059]" /> Planes Disponibles en ContFast
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {availablePlans.map((p) => {
                  const isCurrent = subscription && subscription.planName.toLowerCase() === p.name.toLowerCase();
                  return (
                    <div 
                      key={p.id} 
                      className={`bg-white rounded-xl p-4 border shadow-sm flex flex-col justify-between transition relative overflow-hidden ${
                        isCurrent ? 'border-[#C5A059] ring-2 ring-[#C5A059]/20' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {isCurrent && (
                        <div className="absolute top-0 right-0 bg-[#C5A059] text-white text-[9px] font-bold uppercase tracking-wider py-1 px-3 rounded-bl-lg">
                          Plan Actual
                        </div>
                      )}
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">{p.name}</h4>
                        <p className="text-xs text-slate-500 mt-1 min-h-[36px]">{p.description || 'Sin descripción'}</p>
                        
                        <div className="mt-4 flex items-baseline gap-1">
                          <span className="text-xl font-bold text-[#003366]">${Number(p.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          <span className="text-slate-500 text-[10px] font-semibold">/ mes</span>
                        </div>

                        <ul className="mt-6 space-y-3.5 border-t border-slate-100 pt-4">
                          <li className="flex items-center gap-2 text-xs text-slate-600">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span>Límite e-CF: <strong>{p.maxEcfLimit === -1 ? 'Ilimitado' : `${p.maxEcfLimit} / mes`}</strong></span>
                          </li>
                          <li className="flex items-center gap-2 text-xs text-slate-600">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span>Límite Usuarios: <strong>{p.maxUsers === -1 ? 'Ilimitado' : `${p.maxUsers}`}</strong></span>
                          </li>
                          <li className="flex items-center gap-2 text-xs text-slate-600">
                            <Layers className="w-3.5 h-3.5 text-slate-400" />
                            <span>Límite Almacenes: <strong>{p.maxWarehouses === -1 ? 'Ilimitado' : `${p.maxWarehouses}`}</strong></span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
  );
}
