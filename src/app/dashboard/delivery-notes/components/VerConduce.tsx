'use client';

/**
 * Ver un conduce (lote 223): factura, hora de emision, cliente, numero y, por
 * cada mercancia, SKU, nombre, cantidad facturada, lo que despacha y cuanto
 * falta si no hay bastante. Pedido del dueño.
 *
 * Aparte de `page.tsx` (829 lineas) a proposito. Los datos los arma el servidor
 * (`/api/v1/delivery-notes/[id]/detalle`) y el texto de la columna de faltante
 * lo decide `disponibilidadDelRenglon`: aqui solo se pinta.
 */
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Modal } from '@/components/ui/dialog';
import { ErrorDeCarga, motivoDeCarga } from '@/components/ui/estado-carga';
import { formatDateDisplay, formatDateTimeDisplay } from '@/utils/fechasLocales';
import { disponibilidadDelRenglon } from '@/services/inventario/faltanteDelConduce';
import type { ConduceParaVer } from '@/services/inventario/verConduce';

const ESTADOS: Record<string, string> = { approved: 'Despachado', draft: 'Borrador', voided: 'Anulado' };

export function VerConduce({ conduceId, onClose }: { conduceId: string | null; onClose: () => void }) {
  const [conduce, setConduce] = useState<ConduceParaVer | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!conduceId) return;
    //  Una respuesta vieja no puede pisar la del conduce que se abrio despues.
    let vigente = true;
    setCargando(true);
    setError(null);
    setConduce(null);
    fetch(`/api/v1/delivery-notes/${conduceId}/detalle`)
      .then((r) => r.json())
      .then((data) => {
        if (!vigente) return;
        if (data.success) setConduce(data.data);
        else setError(motivoDeCarga(null, data.error?.message));
      })
      .catch((err) => { if (vigente) setError(motivoDeCarga(err)); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [conduceId, intento]);

  return (
    <Modal
      isOpen={conduceId !== null}
      onClose={onClose}
      maxWidth="4xl"
      title={conduce ? `Conduce ${conduce.numero}` : 'Conduce'}
      description={conduce ? ESTADOS[conduce.estado] ?? conduce.estado : undefined}
    >
      {cargando && <div className="py-10 text-center text-sm text-slate-400">Cargando conduce…</div>}
      {error && <ErrorDeCarga mensaje={error} onReintentar={() => setIntento((n) => n + 1)} />}

      {conduce && <VistaDelConduce conduce={conduce} />}
    </Modal>
  );
}

/**
 * Solo pinta: sin estado ni red. Separado del modal para poder dibujarse con
 * datos reales y FOTOGRAFIARSE (regla de la seccion 4: lo que se ve, se mira).
 */
export function VistaDelConduce({ conduce }: { conduce: ConduceParaVer }) {
  const conFaltante = conduce.renglones.filter((r) => (r.faltan ?? 0) > 0).length;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <Dato etiqueta="Número de conduce" valor={conduce.numero} mono />
        <Dato etiqueta="Factura" valor={conduce.factura?.ncf ?? 'Sin factura'} mono />
        <Dato etiqueta="Emisión de la factura" valor={formatDateTimeDisplay(conduce.factura?.emitida)} />
        <Dato etiqueta="Fecha de entrega" valor={formatDateDisplay(conduce.fechaEntrega)} />
        <Dato
          etiqueta="Cliente"
          valor={conduce.cliente ? `${conduce.cliente.nombre}${conduce.cliente.rnc ? ` · ${conduce.cliente.rnc}` : ''}` : 'Sin cliente'}
        />
        <Dato etiqueta="Almacén" valor={conduce.almacen ?? '—'} />
      </dl>

      {conFaltante > 0 && (
        <div role="status" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          No se puede despachar todavía: falta mercancía en {conFaltante} {conFaltante === 1 ? 'producto' : 'productos'}.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left">
          <thead className="bg-slate-50/80 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">SKU</th>
              <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mercancía</th>
              <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Facturada</th>
              <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Despacha</th>
              <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Faltante</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {conduce.renglones.map((r) => {
              const d = disponibilidadDelRenglon(r, conduce.estado);
              return (
                <tr key={r.productId}>
                  <td className="px-3 py-2 text-xs font-mono text-slate-500 whitespace-nowrap">{r.sku ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-800 font-medium">{r.nombre}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 text-right tabular-nums">{r.facturada}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 text-right tabular-nums">{r.despacha}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    <span className={clsx(
                      'inline-flex rounded border px-2 py-0.5 text-[10px] font-bold',
                      d.tono === 'falta' && 'bg-rose-50 text-rose-700 border-rose-200',
                      d.tono === 'alcanza' && 'bg-emerald-50 text-emerald-700 border-emerald-100',
                      d.tono === 'neutro' && 'bg-slate-50 text-slate-500 border-slate-200',
                    )}>
                      {d.texto}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor, mono = false }: { etiqueta: string; valor: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{etiqueta}</dt>
      <dd className={clsx('text-slate-800 font-semibold', mono && 'font-mono')}>{valor}</dd>
    </div>
  );
}
