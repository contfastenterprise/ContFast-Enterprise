/**
 * La tarjeta del plan de la empresa: estado, dias que quedan y uso.
 *
 * Lote 303: la comparten Configuracion > Plan & Suscripcion y Administracion >
 * "Mi Suscripcion" (lo que ve quien no es Sistemas). Hasta este lote eran dos
 * copias, y la de Administracion se quedo en la de antes del lote 299: rotulaba
 * "Suscripción Activa" con el plan vencido, no conocia la prueba gratis y sin
 * plan decia "No se encontró una suscripción activa". Con UNA tarjeta, las dos
 * pantallas no pueden decir cosas distintas del mismo plan.
 *
 * Solo pinta. Lo que dice sale entero de la regla del lote 299
 * (`planParaLaPantalla`, que arma `/api/v1/admin/settings`): el estado y su
 * rotulo, los dias, y el uso contado igual que lo cuentan las guardas que
 * bloquean. Lo que se bloquea y a quien acudir son los MISMOS textos que los
 * mensajes de bloqueo (`LO_QUE_SE_BLOQUEA`, `PARA_ACTIVAR_UN_PLAN`).
 */
import { FileText, Award, Users, Layers, Calendar } from 'lucide-react';
import { formatDateDisplay } from '@/utils/fechasLocales';
import {
  LO_QUE_SE_BLOQUEA,
  PARA_ACTIVAR_UN_PLAN,
  ROTULO_SIN_PLAN,
  type PlanParaLaPantalla,
} from '@/services/suscripcion/planVigente';

type Estado = PlanParaLaPantalla['estado'];

const ROJO = { chip: 'bg-rose-50 text-rose-700 border border-rose-200', punto: 'bg-rose-500' };

/** El color de cada estado. Solo "Activo" y "Prueba" son vigentes; lo demas, rojo o ambar. */
export const COLOR_DEL_ESTADO: Record<Estado, { chip: string; punto: string }> = {
  activo: { chip: 'bg-emerald-50 text-emerald-700 border border-emerald-200', punto: 'bg-emerald-500' },
  prueba: { chip: 'bg-sky-50 text-sky-700 border border-sky-200', punto: 'bg-sky-500' },
  por_empezar: { chip: 'bg-amber-50 text-amber-700 border border-amber-200', punto: 'bg-amber-500' },
  vencido: ROJO,
  pago_pendiente: ROJO,
  cancelado: ROJO,
  sin_plan: ROJO,
};

const limite = (n: number) => (n === -1 ? 'ilimitado' : String(n));

/** "Quedan 12 días", "Vence hoy", "Venció hace 3 días". */
export function textoDeLosDias(p: Pick<PlanParaLaPantalla, 'diasRestantes'>): string | null {
  const n = p.diasRestantes;
  if (n === null) return null;
  if (n > 0) return `Quedan ${n} día${n === 1 ? '' : 's'}`;
  if (n === 0) return 'Vence hoy';
  return `Venció hace ${-n} día${n === -1 ? '' : 's'}`;
}

/** Lo que se dice cuando el plan no deja operar: lo que se bloquea y a quien acudir. */
export const TEXTO_SIN_PLAN_VIGENTE = `${LO_QUE_SE_BLOQUEA} ${PARA_ACTIVAR_UN_PLAN}`;

function ChipDelEstado({ estado, rotulo }: { estado: Estado; rotulo: string }) {
  const c = COLOR_DEL_ESTADO[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${c.chip}`}>
      <span className={`w-2 h-2 rounded-full ${c.punto}`} />
      {rotulo}
    </span>
  );
}

function Uso({ icono, titulo, valor, detalle, nivel }: {
  icono: React.ReactNode; titulo: string; valor: string; detalle?: string; nivel?: 'normal' | 'ochenta' | 'limite';
}) {
  const color = nivel === 'limite' ? 'text-rose-700' : nivel === 'ochenta' ? 'text-amber-700' : 'text-slate-800';
  return (
    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
      <div className="p-2 bg-blue-50 rounded-lg text-blue-600">{icono}</div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{titulo}</p>
        <p className={`text-lg font-bold mt-1 ${color}`}>{valor}</p>
        {detalle && <p className="text-[11px] text-slate-500 mt-0.5">{detalle}</p>}
      </div>
    </div>
  );
}

export function TarjetaDelPlan({ plan }: { plan: PlanParaLaPantalla | null }) {
  const dias = plan ? textoDeLosDias(plan) : null;
  const ecf = plan?.ecf;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <Award className="w-5 h-5 text-[#C5A059]" />
        <h3 className="font-bold text-[#003366]">Plan y Suscripción</h3>
      </div>
      <div className="p-4">
        {plan && ecf ? (
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-6">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Plan Contratado</p>
                <h4 className="text-xl font-bold text-[#003366] mt-1">{plan.planName}</h4>
              </div>
              <div className="flex items-center gap-3">
                <ChipDelEstado estado={plan.estado} rotulo={plan.rotulo} />
              </div>
            </div>

            {!plan.vigente && (
              <p role="alert" className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                El plan no está vigente. {TEXTO_SIN_PLAN_VIGENTE}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Uso
                icono={<FileText className="w-5 h-5" />}
                titulo="e-CF de este mes"
                valor={ecf.limite === null ? `${ecf.usados} (ilimitado)` : `${ecf.usados} de ${ecf.limite}`}
                detalle={ecf.porcentaje === null ? 'Emitidos en PRODUCCIÓN' : `${ecf.porcentaje} % · emitidos en PRODUCCIÓN`}
                nivel={ecf.nivel}
              />
              <Uso
                icono={<Users className="w-5 h-5" />}
                titulo="Usuarios activos"
                valor={`${plan.usuariosActivos} de ${limite(plan.maxUsers)}`}
              />
              <Uso
                icono={<Layers className="w-5 h-5" />}
                titulo="Almacenes"
                valor={`${plan.almacenes} de ${limite(plan.maxWarehouses)}`}
              />
            </div>

            <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold">
                  Vencimiento / Renovación:{' '}
                  <span className="text-slate-800 font-bold">
                    {formatDateDisplay(plan.currentPeriodEnd)}
                  </span>
                  {dias && <span className="ml-2 text-slate-500">({dias})</span>}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium italic">
                Para contratar, renovar o ampliar su plan, consulte con el administrador del sistema.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="mb-3"><ChipDelEstado estado="sin_plan" rotulo={ROTULO_SIN_PLAN} /></div>
            <p className="text-sm text-slate-500 font-medium">Esta empresa no tiene un plan.</p>
            <p role="alert" className="text-xs text-slate-500 mt-1">{TEXTO_SIN_PLAN_VIGENTE}</p>
          </div>
        )}
      </div>
    </div>
  );
}
