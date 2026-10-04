'use client';

/**
 * Lote 266: el aviso de un borrador reabierto con precios que ya no son los del catalogo.
 *
 * Pedido del dueño (2026-10-03): al reabrir un borrador, la opcion de actualizar sus precios. Eligio
 * un AVISO con boton y no cambiarlos solo: en un borrador no se distingue un precio que quedo viejo
 * de uno que alguien acordo a mano. Solo pinta; las lineas y el cambio son de la pagina.
 */
import { AlertTriangle } from 'lucide-react';
import { enPesos } from '@/services/precios/preciosEnDolares';
import type { PrecioViejo } from '@/services/invoice/preciosDelBorrador';

const NOMBRE_DEL_NIVEL: Record<string, string> = {
  base: 'base', consumidor: 'consumidor', mayorista: 'mayorista', proveedor: 'proveedor',
};

export function AvisoPreciosDelBorrador({ viejos, alActualizar, alDejar }: {
  viejos: readonly PrecioViejo[];
  alActualizar: () => void;
  alDejar: () => void;
}) {
  if (viejos.length === 0) return null;
  const n = viejos.length;
  return (
    <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="flex-1 space-y-2">
          <p className="font-semibold">
            {n === 1
              ? 'El precio de 1 producto cambió desde que se guardó este borrador.'
              : `El precio de ${n} productos cambió desde que se guardó este borrador.`}
          </p>
          <ul className="space-y-0.5 text-xs">
            {viejos.map((v) => (
              <li key={v.indice} className="font-mono-data">
                {v.nombre} ({NOMBRE_DEL_NIVEL[v.nivel] ?? v.nivel}):{' '}
                <span className="line-through text-amber-700">RD$ {enPesos(v.guardado)}</span>{' '}
                → <strong>RD$ {enPesos(v.actual)}</strong>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={alActualizar}
              className="rounded-lg bg-[#003366] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#002244]"
            >
              Actualizar precios
            </button>
            <button
              type="button"
              onClick={alDejar}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Dejar los del borrador
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
