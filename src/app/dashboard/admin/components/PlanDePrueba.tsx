/**
 * Lote 300: la casilla "Plan de prueba" del formulario de planes y la insignia de la lista.
 * Solo pintan; la regla (que solo uno este marcado) la hacen la ruta y el indice de la 0022.
 */
import type { EstadoPlanDePrueba } from '../planDePrueba';

export function CasillaPlanDePrueba({ marcado, estado, alCambiar }: {
  marcado: boolean;
  estado: EstadoPlanDePrueba;
  alCambiar: (marcado: boolean) => void;
}) {
  return (
    <div className="pt-2">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="planDePrueba"
          checked={estado.disponible && marcado}
          disabled={!estado.disponible}
          onChange={(e) => alCambiar(e.target.checked)}
          aria-describedby="planDePruebaAyuda"
          className="h-4 w-4 border-slate-200 rounded text-primary focus:ring-primary disabled:opacity-50"
        />
        <label htmlFor="planDePrueba" className="text-xs font-bold text-slate-700 cursor-pointer">Plan de prueba</label>
      </div>
      <p id="planDePruebaAyuda" className="text-xs text-slate-500 mt-1 ml-6">
        {estado.disponible
          ? 'Toda empresa nueva empieza con 30 días gratis con los límites de este plan. Solo uno puede estar marcado: marcar este desmarca el anterior.'
          : `No disponible: falta aplicar la migración ${estado.migracion}. Mientras tanto, la prueba usa el plan llamado «Plan Básico».`}
      </p>
    </div>
  );
}

export function InsigniaPlanDePrueba() {
  return (
    <span className="px-2.5 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-100 text-amber-900">
      Plan de prueba
    </span>
  );
}
