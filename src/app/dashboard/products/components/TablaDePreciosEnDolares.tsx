'use client';

/**
 * Los productos atados al dolar (lote 247), cada uno con lo que tiene HOY y lo
 * que tendria a la tasa vigente. Solo pinta: no cambia ningun precio. Marcar un
 * renglon es elegirlo para la confirmacion.
 */
import { useState } from 'react';
import { Check, Pencil, Unlink, X } from 'lucide-react';
import { enPesos, escribirTasa, leerCostoUsd, variacion, type Renglon } from '@/services/precios/preciosEnDolares';

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

/** El costo en dolares de un producto: se ve, y con el lapiz se corrige. */
function CostoUsd({ r, puedeEditar, ocupado, alGuardar }: {
  r: Renglon; puedeEditar: boolean; ocupado: boolean; alGuardar: (productId: string, costoUsd: string) => Promise<boolean>;
}) {
  const [escrito, setEscrito] = useState<string | null>(null);
  if (escrito === null) {
    return (
      <span className="inline-flex items-center gap-1.5">
        US$ {escribirTasa(r.costoUsd)}
        {puedeEditar && (
          <button type="button" onClick={() => setEscrito(escribirTasa(r.costoUsd))} aria-label={`Cambiar el costo en dólares de ${r.name}`}
            className="text-slate-400 hover:text-[#003366]"><Pencil className="h-3.5 w-3.5" /></button>
        )}
      </span>
    );
  }
  const leido = leerCostoUsd(escrito);
  return (
    <form className="inline-flex items-center gap-1" onSubmit={async (e) => {
      e.preventDefault();
      if (leido.bien && await alGuardar(r.productId, escrito)) setEscrito(null);
    }}>
      <input type="text" inputMode="decimal" autoComplete="off" value={escrito} onChange={(e) => setEscrito(e.target.value)}
        aria-label={`Costo en dólares de ${r.name}`}
        className="h-7 w-24 bg-slate-50 border border-slate-200 rounded-md px-2 text-xs outline-none focus:border-[#c5a059]" />
      <button type="submit" disabled={!leido.bien || ocupado} aria-label="Guardar el costo en dólares"
        className="text-emerald-600 disabled:opacity-40"><Check className="h-4 w-4" /></button>
      <button type="button" onClick={() => setEscrito(null)} aria-label="No cambiar el costo en dólares"
        className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
    </form>
  );
}

export function TablaDePreciosEnDolares({ renglones, marcados, puedeAplicar, ocupado, alMarcar, alMarcarTodos, alGuardarCosto, alSoltar }: {
  renglones: Renglon[]; marcados: string[]; puedeAplicar: boolean; ocupado: boolean;
  alMarcar: (productId: string, si: boolean) => void;
  alMarcarTodos: (si: boolean) => void;
  alGuardarCosto: (productId: string, costoUsd: string) => Promise<boolean>;
  alSoltar: (r: Renglon) => void;
}) {
  if (renglones.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-slate-500">
        Ningún producto sigue al dólar todavía. Añade el primero arriba, con su costo en dólares.
      </p>
    );
  }
  const cambian = renglones.filter((r) => r.calculo?.cambia);
  const todos = cambian.length > 0 && cambian.every((r) => marcados.includes(r.productId));
  return (
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
            <th className={th}>Costo en dólares</th>
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
          {renglones.map((r) => {
            const c = r.calculo;
            return (
              <tr key={r.productId} className={c?.cambia ? 'bg-amber-50/40' : undefined}>
                {puedeAplicar && (
                  <td className={td}>
                    <input type="checkbox" checked={marcados.includes(r.productId)} disabled={!c?.cambia}
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
                <td className={td}><CostoUsd r={r} puedeEditar={puedeAplicar} ocupado={ocupado} alGuardar={alGuardarCosto} /></td>
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
  );
}
