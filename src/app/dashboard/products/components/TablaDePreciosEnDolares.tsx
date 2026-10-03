'use client';

/**
 * Los productos atados al dolar (lote 247), cada uno con lo que tiene HOY y lo
 * que tendria a la tasa vigente. Solo pinta: no cambia ningun precio. Marcar un
 * renglon es elegirlo para la confirmacion.
 */
import { useState } from 'react';
import { Check, Pencil, Unlink, X } from 'lucide-react';
import { enPesos, escribirTasa, leerCostoUsd, leerPrecioUsd, PRODUCTOS_POR_PAGINA, trozoDePagina, variacion, type Renglon } from '@/services/precios/preciosEnDolares';
import { Pagination } from '@/components/ui/pagination';

const th = 'px-3 py-2 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide';
const td = 'px-3 py-2 text-xs text-slate-700 align-top';

/** "antes → despues", o solo el importe si no cambia. */
function Cambio({ antes, despues }: { antes: number; despues: number | null }) {
  if (despues === null || Math.round(antes * 100) === Math.round(despues * 100)) {
    return <span>{enPesos(antes)}</span>;
  }
  return (
    <span>
      <span className="text-slate-400 line-through">{enPesos(antes)}</span>{' '}
      <span className="font-bold text-[#003366]">{enPesos(despues)}</span>
    </span>
  );
}

function Variacion({ r }: { r: Renglon }) {
  const v = r.calculo ? variacion(r.calculo) : null;
  if (v === null || v === 0) return <span className="text-slate-400">—</span>;
  return <span className={v > 0 ? 'font-bold text-rose-600' : 'font-bold text-emerald-600'}>{v > 0 ? '+' : ''}{v}%</span>;
}

/**
 * Un importe en dolares del producto (el costo, o desde el lote 258 el precio base): se ve, y con el
 * lapiz se corrige. El precio base admite quedar vacio ("sin precio en dolares"); el costo no.
 */
function CampoUsd({ r, que, valor, rotulo, leer, puedeEditar, ocupado, alGuardar }: {
  r: Renglon; que: string; valor: number | null; rotulo: string;
  leer: (v: unknown) => { bien: boolean };
  puedeEditar: boolean; ocupado: boolean; alGuardar: (productId: string, valor: string) => Promise<boolean>;
}) {
  const [escrito, setEscrito] = useState<string | null>(null);
  if (escrito === null) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-slate-500">{rotulo}</span>
        {typeof valor !== 'number' ? <span className="text-slate-400">—</span> : <span className="whitespace-nowrap">US$ {escribirTasa(valor)}</span>}
        {puedeEditar && (
          <button type="button" onClick={() => setEscrito(typeof valor !== 'number' ? '' : escribirTasa(valor))} aria-label={`Cambiar ${que} de ${r.name}`}
            className="text-slate-400 hover:text-[#003366]"><Pencil className="h-3.5 w-3.5" /></button>
        )}
      </span>
    );
  }
  const leido = leer(escrito);
  return (
    <form className="inline-flex items-center gap-1" action={async () => {
      if (leido.bien && await alGuardar(r.productId, escrito)) setEscrito(null);
    }}>
      <input type="text" inputMode="decimal" autoComplete="off" value={escrito} onChange={(e) => setEscrito(e.target.value)}
        aria-label={`${que[0].toUpperCase()}${que.slice(1)} de ${r.name}`}
        className="h-7 w-24 bg-slate-50 border border-slate-200 rounded-md px-2 text-xs outline-none focus:border-[#c5a059]" />
      <button type="submit" disabled={!leido.bien || ocupado} aria-label={`Guardar ${que}`}
        className="text-emerald-600 disabled:opacity-40"><Check className="h-4 w-4" /></button>
      <button type="button" onClick={() => setEscrito(null)} aria-label={`No cambiar ${que}`}
        className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
    </form>
  );
}

export function TablaDePreciosEnDolares({ renglones, marcados, puedeAplicar, ocupado, alMarcar, alMarcarTodos, alGuardarCosto, alGuardarPrecio, alSoltar }: {
  renglones: Renglon[]; marcados: string[]; puedeAplicar: boolean; ocupado: boolean;
  alMarcar: (productId: string, si: boolean) => void;
  alMarcarTodos: (si: boolean) => void;
  alGuardarCosto: (productId: string, costoUsd: string) => Promise<boolean>;
  alGuardarPrecio: (productId: string, precioUsd: string) => Promise<boolean>;
  alSoltar: (r: Renglon) => void;
}) {
  //  Lote 256: la tabla se pagina en el navegador. La lista ya llega entera (la necesitan "marcar
  //  todos" y "Aplicar precios", que valen para TODAS las paginas, no solo la que se ve).
  const [paginaPedida, setPaginaPedida] = useState(1);
  if (renglones.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-slate-500">
        Ningún producto sigue al dólar todavía. Añade el primero arriba, con su costo en dólares.
      </p>
    );
  }
  const elegidos = new Set(marcados);
  const cambian = renglones.filter((r) => r.calculo?.cambia);
  const todos = cambian.length > 0 && cambian.every((r) => elegidos.has(r.productId));
  const { visibles, pagina, paginas } = trozoDePagina(renglones, paginaPedida);
  return (
    <div>
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {puedeAplicar && (
              <th className={`${th} w-8`}>
                <input type="checkbox" checked={todos} disabled={cambian.length === 0} onChange={(e) => alMarcarTodos(e.target.checked)}
                  aria-label="Marcar todos los productos que cambian" />
              </th>
            )}
            <th className={th}>Producto</th>
            <th className={th}>En dólares</th>
            <th className={`${th} text-right`}>Costo (RD$)</th>
            <th className={`${th} text-right`}>Precio base</th>
            <th className={`${th} text-right`}>Consumidor</th>
            <th className={`${th} text-right`}>Mayorista</th>
            <th className={`${th} text-right`}>Proveedor</th>
            <th className={`${th} text-right`}>Variación</th>
            <th className={th}><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visibles.map((r) => {
            const c = r.calculo;
            return (
              <tr key={r.productId} className={c?.cambia ? 'bg-amber-50/40' : undefined}>
                {puedeAplicar && (
                  <td className={td}>
                    <input type="checkbox" checked={elegidos.has(r.productId)} disabled={!c?.cambia}
                      onChange={(e) => alMarcar(r.productId, e.target.checked)} aria-label={`Aplicar el precio nuevo a ${r.name}`} />
                  </td>
                )}
                <td className={td}>
                  <p className="font-semibold text-slate-800">{r.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {r.sku || 'Sin código'} · {r.tasaAplicada === null ? 'nunca calculado con una tasa' : `calculado a ${escribirTasa(r.tasaAplicada)}`}
                  </p>
                  {c?.avisos.map((a) => <p key={a} className="text-[11px] font-semibold text-amber-700 mt-0.5">{a}</p>)}
                </td>
                <td className={td}>
                  <div className="flex flex-col gap-1">
                    <CampoUsd r={r} que="el costo en dólares" rotulo="Costo" valor={r.costoUsd} leer={leerCostoUsd}
                      puedeEditar={puedeAplicar} ocupado={ocupado} alGuardar={alGuardarCosto} />
                    <CampoUsd r={r} que="el precio base en dólares" rotulo="Precio" valor={r.precioUsd} leer={leerPrecioUsd}
                      puedeEditar={puedeAplicar} ocupado={ocupado} alGuardar={alGuardarPrecio} />
                  </div>
                </td>
                <td className={`${td} text-right`}><Cambio antes={r.actual.cost} despues={c ? c.despues.cost : null} /></td>
                <td className={`${td} text-right`}><Cambio antes={r.actual.price} despues={c ? c.despues.price : null} /></td>
                <td className={`${td} text-right`}><Cambio antes={r.actual.priceConsumidor} despues={c ? c.despues.priceConsumidor : null} /></td>
                <td className={`${td} text-right`}><Cambio antes={r.actual.priceMayorista} despues={c ? c.despues.priceMayorista : null} /></td>
                <td className={`${td} text-right`}><Cambio antes={r.actual.priceProveedor} despues={c ? c.despues.priceProveedor : null} /></td>
                <td className={`${td} text-right`}><Variacion r={r} /></td>
                <td className={`${td} text-right`}>
                  {puedeAplicar && (
                    <button type="button" onClick={() => alSoltar(r)} disabled={ocupado} title="Dejar de seguir al dólar"
                      aria-label={`Que ${r.name} deje de seguir al dólar`} className="text-slate-400 hover:text-rose-600 disabled:opacity-40">
                      <Unlink className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <div className="px-4 py-2 border-t border-slate-100">
      <Pagination
        currentPage={pagina}
        totalPages={paginas}
        totalItems={renglones.length}
        pageSize={PRODUCTOS_POR_PAGINA}
        onPageChange={setPaginaPedida}
        itemLabel="productos"
        hideControlsWhenSinglePage
      />
    </div>
    </div>
  );
}
