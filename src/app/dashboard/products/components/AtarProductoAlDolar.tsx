'use client';

/**
 * Elegir un producto y fijarle su costo en dolares (lote 247). Atarlo NO le
 * cambia el precio: solo empieza a salir en la tabla, con lo que cambiaria.
 */
import { useState } from 'react';
import { Search } from 'lucide-react';
import { enPesos, leerCostoUsd } from '@/services/precios/preciosEnDolares';
import type { ProductoParaAtar } from '../hooks/usePreciosEnDolares';

const campo = 'h-9 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none';

export function AtarProductoAlDolar({ encontrados, ocupado, alBuscar, alAtar }: {
  encontrados: ProductoParaAtar[]; ocupado: boolean;
  alBuscar: (texto: string) => void;
  alAtar: (productId: string, costoUsd: string) => Promise<boolean>;
}) {
  const [texto, setTexto] = useState('');
  const [elegido, setElegido] = useState<ProductoParaAtar | null>(null);
  const [costo, setCosto] = useState('');
  const leido = leerCostoUsd(costo);
  const aviso = costo.trim() !== '' && !leido.bien ? leido.mensaje : null;

  return (
    <form
      className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col gap-2"
      action={async () => {
        if (!elegido || !leido.bien) return;
        if (await alAtar(elegido.id, costo)) { setElegido(null); setCosto(''); setTexto(''); }
      }}
    >
      <p className="text-xs font-semibold text-[#001e40]">Añadir un producto que se compra en dólares</p>
      <div className="flex flex-col md:flex-row gap-2 md:items-start">
        <div className="relative flex-1">
          <label htmlFor="dolar-buscar" className="sr-only">Buscar el producto</label>
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
          <input id="dolar-buscar" type="text" autoComplete="off" value={elegido ? elegido.name : texto}
            onChange={(e) => { setElegido(null); setTexto(e.target.value); alBuscar(e.target.value); }}
            onFocus={() => { if (!elegido) alBuscar(texto); }}
            placeholder="Buscar por nombre o código…" className={`${campo} w-full pl-9`} />
          {!elegido && encontrados.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {encontrados.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setElegido(p)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50">
                    <span className="font-semibold text-slate-800">{p.name}</span>
                    <span className="text-slate-500"> · {p.sku || 'Sin código'} · costo hoy RD$ {enPesos(p.cost)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label htmlFor="dolar-costo" className="sr-only">Costo en dólares</label>
          <input id="dolar-costo" type="text" inputMode="decimal" autoComplete="off" value={costo} onChange={(e) => setCosto(e.target.value)}
            placeholder="Costo en US$" className={`${campo} w-36`} aria-describedby={aviso ? 'dolar-costo-aviso' : undefined} />
        </div>
        <button type="submit" disabled={!elegido || !leido.bien || ocupado}
          className="h-9 px-4 rounded-lg bg-[#003366] hover:bg-[#002244] text-white text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed">
          Añadir
        </button>
      </div>
      {aviso && <p id="dolar-costo-aviso" className="text-[11px] font-semibold text-rose-600">{aviso}</p>}
    </form>
  );
}
