'use client';

/**
 * Lote 261: la tasa del dolar en Compras y Facturacion, en una linea, con "Cambiar".
 *
 * Solo pinta: el estado y la peticion son de `useTasaDelDolar`, que crea la pantalla (asi la
 * pantalla puede poner al dia sus lineas a medio hacer cuando la tasa cambia).
 *
 * Quien no administra ve la tasa y nada mas: escribirla es de administracion y sistemas, y eso lo
 * dice el servidor, no esta pantalla. Si la empresa no usa precios en dolares, no sale nada.
 */
import { useState } from 'react';
import { DollarSign, Loader2 } from 'lucide-react';
import { escribirTasa } from '@/services/precios/preciosEnDolares';
import { formatDateDisplay } from '@/utils/fechasLocales';
import type { TasaDelDolar } from '@/hooks/useTasaDelDolar';

export function TasaDelDolarEnLinea({ t }: { t: TasaDelDolar }) {
  const [editando, setEditando] = useState(false);
  if (!t.enUso) return null;

  const fecha = t.tasa && t.hoy && t.tasa.fecha !== t.hoy ? ` (del ${formatDateDisplay(t.tasa.fecha)})` : '';

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-700">
        <DollarSign className="h-3.5 w-3.5 text-[#c5a059]" aria-hidden="true" />
        {t.tasa
          ? <>Tasa del dólar: <strong className="font-mono-data text-[#003366]">RD$ {escribirTasa(t.tasa.tasa)}</strong>{fecha}</>
          : 'Sin tasa del dólar escrita'}
      </span>

      {t.puedeCambiar && !editando && (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-[#003366] hover:bg-slate-50"
        >
          Cambiar tasa
        </button>
      )}

      {t.puedeCambiar && editando && (
        //  `action` y no `onSubmit` con `preventDefault`, como en la tasa de Productos (lote 247).
        //  Un `<form>` propio para que Enter guarde la tasa. Por eso este control se pone FUERA del
        //  `<form>` de la factura (en su cabecera): un formulario dentro de otro es HTML invalido, y
        //  Enter acabaria enviando la factura. La compra no es un `<form>`.
        <form
          action={async (datos: FormData) => {
            if (await t.cambiar(String(datos.get('tasa') ?? ''))) setEditando(false);
          }}
          className="flex items-center gap-2"
        >
          <input
            name="tasa"
            inputMode="decimal"
            autoFocus
            defaultValue={t.tasa ? escribirTasa(t.tasa.tasa) : ''}
            aria-label="Nueva tasa del dólar, en pesos"
            placeholder="63.50"
            className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-right font-mono-data outline-none focus:border-primary focus:ring-1 focus:ring-[#c5a059]"
          />
          <button
            type="submit"
            disabled={t.ocupado}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#003366] px-3 py-1.5 font-semibold text-white hover:bg-[#002244] disabled:opacity-60"
          >
            {t.ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Guardar y aplicar precios
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            disabled={t.ocupado}
            className="rounded-xl px-2 py-1.5 text-slate-500 hover:text-slate-700"
          >
            Cancelar
          </button>
        </form>
      )}
    </div>
  );
}
