'use client';

/**
 * Elegir productos y fijarles su costo en dolares (lote 247). Atarlos NO les
 * cambia el precio: solo empiezan a salir en la tabla, con lo que cambiaria.
 *
 * Lote 251, pedido del dueño (2026-10-02): "que se puedan seleccionar varios
 * productos, ya que puede haber productos con el mismo precio". Se marcan los
 * que se quieran (de una o de varias busquedas) y todos reciben el MISMO costo
 * en dolares, de una vez. Lo marcado se queda aunque se cambie la busqueda.
 */
import { useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { enPesos, leerCostoUsd } from '@/services/precios/preciosEnDolares';
import { alternar, marcarTodos, sinMarcar } from '@/services/precios/seleccionDeProductos';
import type { ProductoParaAtar } from '../hooks/usePreciosEnDolares';

const campo = 'h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none';

export function AtarProductoAlDolar({ encontrados, ocupado, alBuscar, alAtar }: {
  encontrados: ProductoParaAtar[]; ocupado: boolean;
  alBuscar: (texto: string) => void;
  alAtar: (productIds: string[], costoUsd: string) => Promise<boolean>;
}) {
  const [texto, setTexto] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [elegidos, setElegidos] = useState<ProductoParaAtar[]>([]);
  const [costo, setCosto] = useState('');
  const leido = leerCostoUsd(costo);
  const aviso = costo.trim() !== '' && !leido.bien ? leido.mensaje : null;
  const ids = new Set(elegidos.map((p) => p.id));
  const porMarcar = sinMarcar(elegidos, encontrados);

  return (
    <form
      className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col gap-2"
      action={async () => {
        if (elegidos.length === 0 || !leido.bien) return;
        if (await alAtar(elegidos.map((p) => p.id), costo)) {
          setElegidos([]); setCosto(''); setTexto(''); setBuscando(false);
        }
      }}
    >
      <p className="text-xs font-semibold text-[#001e40]">Añadir productos que se compran en dólares</p>
      <p className="text-[11px] text-slate-500">Marca uno o varios: todos reciben el mismo costo en dólares.</p>
      <div className="flex flex-col md:flex-row gap-2 md:items-start">
        <div className="flex-1">
          <div className="relative">
            <label htmlFor="dolar-buscar" className="sr-only">Buscar productos</label>
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <input id="dolar-buscar" type="text" autoComplete="off" value={texto}
              onChange={(e) => { setTexto(e.target.value); setBuscando(true); alBuscar(e.target.value); }}
              onFocus={() => { setBuscando(true); alBuscar(texto); }}
              placeholder="Buscar por nombre o código…" className={`${campo} w-full pl-9`} />
          </div>
          {buscando && encontrados.length > 0 && (
            <div className="mt-1 bg-white border border-slate-200 rounded-lg shadow-sm">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100">
                <span className="text-[11px] text-slate-500">{encontrados.length} encontrados</span>
                <div className="flex items-center gap-3">
                  {porMarcar.length > 0 && (
                    <button type="button" onClick={() => setElegidos((prev) => marcarTodos(prev, encontrados))}
                      className="text-[11px] font-bold text-[#003366] hover:underline">
                      Marcar los {porMarcar.length}
                    </button>
                  )}
                  <button type="button" onClick={() => setBuscando(false)} className="text-[11px] font-bold text-slate-500 hover:underline">
                    Listo
                  </button>
                </div>
              </div>
              <ul className="max-h-64 overflow-y-auto">
                {encontrados.map((p) => {
                  const marcado = ids.has(p.id);
                  return (
                    <li key={p.id}>
                      <button type="button" role="checkbox" aria-checked={marcado} onClick={() => setElegidos((prev) => alternar(prev, p))}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-slate-50 ${marcado ? 'bg-amber-50/60' : ''}`}>
                        <span className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center ${marcado ? 'bg-[#003366] border-[#003366] text-white' : 'border-slate-300 bg-white'}`}>
                          {marcado && <Check className="h-3 w-3" />}
                        </span>
                        <span>
                          <span className="font-semibold text-slate-800">{p.name}</span>
                          <span className="text-slate-500"> · {p.sku || 'Sin código'} · costo hoy RD$ {enPesos(p.cost)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        <div>
          <label htmlFor="dolar-costo" className="sr-only">Costo en dólares</label>
          <input id="dolar-costo" type="text" inputMode="decimal" autoComplete="off" value={costo} onChange={(e) => setCosto(e.target.value)}
            placeholder="Costo en US$" className={`${campo} w-36`} aria-describedby={aviso ? 'dolar-costo-aviso' : undefined} />
        </div>
        <button type="submit" disabled={elegidos.length === 0 || !leido.bien || ocupado}
          className="h-9 px-4 rounded-lg bg-[#003366] hover:bg-[#002244] text-white text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
          {elegidos.length > 1 ? `Añadir ${elegidos.length} productos` : 'Añadir'}
        </button>
      </div>
      {elegidos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Productos marcados">
          {elegidos.map((p) => (
            <li key={p.id} className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full pl-2.5 pr-1 py-0.5 text-[11px] text-slate-700">
              {p.name}
              <button type="button" onClick={() => setElegidos((prev) => alternar(prev, p))} aria-label={`Quitar ${p.name}`} className="p-0.5 rounded-full text-slate-400 hover:text-rose-600">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {aviso && <p id="dolar-costo-aviso" className="text-[11px] font-semibold text-rose-600">{aviso}</p>}
    </form>
  );
}
