/**
 * La barra de filtros de la lista de conduces (lote 245): estado y rango de
 * fecha de entrega. Solo pinta: lo escrito y que pasa al cambiarlo son de la
 * pagina. Los estados y la regla de las fechas vienen de
 * `services/inventario/filtrosDeConduces.ts`, los mismos que lee la ruta.
 */
import { FilterX } from 'lucide-react';
import DateRangePicker from '@/components/ui/date-range-picker';
import { ESTADOS_DE_CONDUCE, hayFiltros, type FiltrosEscritos } from '@/services/inventario/filtrosDeConduces';

export function FiltrosDeConduces({ filtros, alCambiar, alLimpiar }: {
  filtros: FiltrosEscritos; alCambiar: (cambio: Partial<FiltrosEscritos>) => void; alLimpiar: () => void;
}) {
  return (
    <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-end gap-3">
      <div className="md:w-48">
        <label htmlFor="filtro-estado-conduce" className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Estado</label>
        <select
          id="filtro-estado-conduce"
          value={filtros.estado}
          onChange={(e) => alCambiar({ estado: e.target.value })}
          className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-medium text-slate-900 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none"
        >
          <option value="">Todos</option>
          {ESTADOS_DE_CONDUCE.map((e) => <option key={e.valor} value={e.valor}>{e.nombre}</option>)}
        </select>
      </div>
      <div className="md:w-72">
        <span className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Fecha de entrega</span>
        <DateRangePicker from={filtros.desde} to={filtros.hasta} onChange={({ from, to }) => alCambiar({ desde: from, hasta: to })} />
      </div>
      {hayFiltros(filtros) && (
        <button
          type="button"
          onClick={alLimpiar}
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 transition"
        >
          <FilterX className="h-3.5 w-3.5" aria-hidden="true" /> Quitar filtros
        </button>
      )}
    </div>
  );
}
