/**
 * Configuracion > Plan y Suscripcion: el plan contratado y los disponibles.
 * Sale de `settings/page.tsx` en el lote 238, movido tal cual: solo pinta.
 *
 * Lote 299: enseña el ESTADO del plan con la regla unica ("Prueba", "Activo",
 * "Vencido"...), los dias que quedan y el USO -- e-CF de PRODUCCION que salieron a
 * la DGII en el mes de RD, usuarios activos y almacenes --, contado igual que lo
 * cuentan las guardas que bloquean. Antes solo enseñaba los limites, y una prueba
 * gratis o un plan vencido salian como "no se encontró una suscripción activa".
 *
 * Lote 303: la tarjeta del plan sale a `components/suscripcion/TarjetaDelPlan.tsx`,
 * que comparte con Administracion > "Mi Suscripcion". Aqui queda la tarjeta y,
 * debajo, los planes disponibles.
 */
import { FileText, Users, Layers } from 'lucide-react';
import { TarjetaDelPlan } from '@/components/suscripcion/TarjetaDelPlan';
import type { Ajustes } from '../hooks/useAjustes';

export function PlanYSuscripcion({ subscription, availablePlans }: Pick<Ajustes, 'subscription' | 'availablePlans'>) {
  return (
          <>
            <TarjetaDelPlan plan={subscription} />

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
