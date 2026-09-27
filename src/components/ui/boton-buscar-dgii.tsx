'use client';

import { RefreshCw, Search } from 'lucide-react';

/**
 * El botón que consulta un RNC o cédula en el padrón de la DGII.
 *
 * Existe porque la misma acción estaba escrita a mano en tres formularios
 * (clientes, suplidores y el alta rápida de cliente en facturas) con tres
 * colores y dos alturas distintas: dorado, azul marino y ámbar. Quien usa los
 * tres no tiene por qué adivinar que hacen lo mismo.
 *
 * - Dorado de la casa con texto oscuro, el mismo par que "Imprimir": el azul
 *   marino es el del botón que GUARDA, y con los dos iguales el formulario
 *   tendría dos acciones principales.
 * - `h-8`, la altura de los campos de esos formularios, para que el botón no
 *   sobresalga de la línea del campo al que acompaña.
 */
export function BotonBuscarDgii({
  onClick,
  buscando,
  disabled,
  texto = 'Buscar DGII',
}: {
  onClick: () => void;
  buscando: boolean;
  disabled?: boolean;
  texto?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={buscando || disabled}
      className="h-8 px-3 shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#C5A059] hover:bg-[#b08c4a] text-slate-950 text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {buscando ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
      {texto}
    </button>
  );
}
