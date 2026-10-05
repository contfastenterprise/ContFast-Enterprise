/**
 * Lote 297: la insignia del estado de una nomina, la misma en la vista del movil y en la
 * tabla del escritorio. El TEXTO sale de `etiquetaDelEstado` (la regla unica de
 * `services/nomina/estadoDeNomina.ts`) y el COLOR, de esta tabla, uno por estado.
 *
 * Antes cada vista llevaba su ternario: traducia "aprobada" y "calculada" y el resto
 * salia crudo ("paid", "draft") y en ambar, el color de lo pendiente, aunque la nomina
 * ya estuviera pagada.
 */
import { etiquetaDelEstado } from '@/services/nomina/estadoDeNomina';

const COLORES: Record<string, string> = {
  draft: 'bg-slate-50 text-slate-600 border border-slate-200',
  calculated: 'bg-blue-50 text-[#003366] border border-blue-200',
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  paid: 'bg-teal-50 text-teal-800 border border-teal-300',
  cancelled: 'bg-rose-50 text-rose-700 border border-rose-200',
};

/** Un estado que no esta en la tabla sale en ambar: algo que mirar, no un color de los conocidos. */
const DESCONOCIDO = 'bg-amber-50 text-amber-700 border border-amber-200';

function colorDelEstado(status: string): string {
  return COLORES[status] ?? DESCONOCIDO;
}

export function InsigniaDeEstado({ status, tamano }: { status: string; tamano: 'sm' | 'md' }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded ${tamano === 'sm' ? 'text-[9px]' : 'text-[10px]'} font-bold uppercase ${colorDelEstado(status)}`}>
      {etiquetaDelEstado(status)}
    </span>
  );
}
