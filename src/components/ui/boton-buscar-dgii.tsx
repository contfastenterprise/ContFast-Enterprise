'use client';

import { RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
 *
 * Lote 274 (estándar de UI): por dentro es el `Button` de la casa, variante `documento`
 * (ese mismo dorado con texto oscuro) y tamaño `sm` (h-8). La API no cambia.
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
    <Button
      type="button"
      variant="documento"
      size="sm"
      onClick={onClick}
      disabled={buscando || disabled}
      className="shrink-0 gap-1.5"
    >
      {buscando ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
      {texto}
    </Button>
  );
}
