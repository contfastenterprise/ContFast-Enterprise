'use client';

/**
 * La tasa del dolar de la empresa (lote 247): la vigente, escribir la de hoy y
 * las ultimas. Escribirla NO cambia ningun precio: eso se confirma en la tabla.
 */
import { useState } from 'react';
import { diasDeLaTasa, escribirTasa, leerTasa, type Tasa } from '@/services/precios/preciosEnDolares';
import { formatDateDisplay } from '@/utils/fechasLocales';

const campo = 'h-9 w-32 bg-slate-50 border border-slate-200 rounded-lg px-3 text-sm text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none';

function Vigente({ tasa, hoy }: { tasa: Tasa | null; hoy: string }) {
  if (!tasa) {
    return <p className="text-sm font-semibold text-amber-700">Todavía no has escrito ninguna tasa.</p>;
  }
  const dias = diasDeLaTasa(tasa.fecha, hoy);
  return (
    <div>
      <p className="text-2xl font-bold text-[#003366] font-display">RD$ {escribirTasa(tasa.tasa)} <span className="text-xs font-semibold text-slate-500">por dólar</span></p>
      <p className={dias === 0 ? 'text-xs text-emerald-700 font-semibold' : 'text-xs text-amber-700 font-semibold'}>
        {dias === 0 ? 'Es la de hoy.' : `Es del ${formatDateDisplay(tasa.fecha)}: lleva ${dias} ${dias === 1 ? 'día' : 'días'} sin tocarse.`}
      </p>
    </div>
  );
}

export function TasaDelDia({ tasa, historial, hoy, puedeEscribir, ocupado, alGuardar }: {
  tasa: Tasa | null; historial: Tasa[]; hoy: string; puedeEscribir: boolean; ocupado: boolean;
  alGuardar: (tasa: string) => Promise<boolean>;
}) {
  const [escrita, setEscrita] = useState('');
  const leida = leerTasa(escrita);
  const aviso = escrita.trim() !== '' && !leida.bien ? leida.mensaje : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col lg:flex-row gap-4 lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-1">Tasa vigente</p>
        <Vigente tasa={tasa} hoy={hoy} />
      </div>

      {puedeEscribir ? (
        <form
          className="flex flex-col gap-1"
          action={async () => {
            if (!leida.bien) return;
            if (await alGuardar(escrita)) setEscrita('');
          }}
        >
          <label htmlFor="tasa-de-hoy" className="text-xs font-semibold text-[#001e40]">Tasa de hoy ({formatDateDisplay(hoy)})</label>
          <div className="flex gap-2">
            <input id="tasa-de-hoy" type="text" inputMode="decimal" autoComplete="off" value={escrita}
              onChange={(e) => setEscrita(e.target.value)} placeholder="63.50" className={campo} aria-describedby={aviso ? 'tasa-de-hoy-aviso' : undefined} />
            <button type="submit" disabled={!leida.bien || ocupado}
              className="h-9 px-4 rounded-lg bg-[#003366] hover:bg-[#002244] text-white text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed">
              Guardar tasa
            </button>
          </div>
          {aviso && <p id="tasa-de-hoy-aviso" className="text-[11px] font-semibold text-rose-600">{aviso}</p>}
        </form>
      ) : (
        <p className="text-xs text-slate-500 max-w-xs">La tasa la escribe administración.</p>
      )}

      {historial.length > 1 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-1">Anteriores</p>
          <ul className="text-xs text-slate-600 space-y-0.5">
            {historial.slice(1, 5).map((t) => (
              <li key={t.fecha}>{formatDateDisplay(t.fecha)} · <span className="font-semibold">{escribirTasa(t.tasa)}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
