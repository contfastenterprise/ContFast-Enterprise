'use client';

/**
 * Ver un conduce (lote 223): factura, hora de emision, cliente, numero y, por
 * cada mercancia, SKU, nombre, cantidad facturada, lo que despacha y cuanto
 * falta si no hay bastante. Pedido del dueño.
 *
 * Aparte de `page.tsx` (829 lineas) a proposito. Los datos los arma el servidor
 * (`/api/v1/delivery-notes/[id]/detalle`) y el texto de la columna de faltante
 * lo decide `disponibilidadDelRenglon`: aqui solo se pinta.
 *
 * LOTE 224: "Despachar lo disponible", y dos avisos de React Doctor del 223
 * cerrados de paso: el conduce se pide AL PULSAR el ojo (`useVerConduce().abrir`)
 * y no en un efecto, y ninguna respuesta se lee sin mirar `r.ok`.
 */
import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ErrorDeCarga, motivoDeCarga } from '@/components/ui/estado-carga';
import { useConfirm } from '@/providers/confirm-provider';
import { formatDateDisplay, formatDateTimeDisplay } from '@/utils/fechasLocales';
import {
  disponibilidadDelRenglon,
  repartoDelDespacho,
  type RenglonDelConduce,
} from '@/services/inventario/faltanteDelConduce';
import type { ConduceParaVer } from '@/services/inventario/verConduce';

const ESTADOS: Record<string, string> = { approved: 'Despachado', draft: 'Borrador', voided: 'Anulado' };

/** Los renglones de la vista, en la forma que usa la regla del reparto. */
function renglonesDelReparto(conduce: ConduceParaVer): RenglonDelConduce[] {
  return conduce.renglones.map((r) => ({
    productId: r.productId, nombre: r.nombre, sku: r.sku, pedido: r.despacha,
    existencia: r.existencia, minimo: r.minimo, llevaInventario: r.llevaInventario,
  }));
}

/**
 * Que queda pendiente si se despacha lo disponible, en palabras, o `null` si el
 * boton no tiene sentido: no es un borrador, alcanza para todo (es la
 * aprobacion de siempre) o no alcanza para nada.
 */
export function pendienteSiSeDespachaLoDisponible(conduce: ConduceParaVer): string | null {
  if (conduce.estado !== 'draft') return null;
  const reparto = repartoDelDespacho(renglonesDelReparto(conduce));
  if (reparto.despachar.length === 0 || reparto.pendiente.length === 0) return null;
  const nombre = new Map(conduce.renglones.map((r) => [r.productId, r.nombre]));
  return reparto.pendiente.map((p) => `${nombre.get(p.productId) ?? p.productId}: ${p.cantidad}`).join('; ');
}

/** El estado del visor. Se pide al pulsar, no en un efecto. */
export function useVerConduce() {
  const [conduceId, setConduceId] = useState<string | null>(null);
  const [conduce, setConduce] = useState<ConduceParaVer | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  //  Una respuesta vieja no puede pisar la del conduce que se abrio despues.
  const peticion = useRef(0);

  const abrir = useCallback(async (id: string) => {
    const mia = ++peticion.current;
    setConduceId(id);
    setConduce(null);
    setError(null);
    setCargando(true);
    try {
      const r = await fetch(`/api/v1/delivery-notes/${id}/detalle`);
      const data = await r.json().catch(() => null);
      if (mia !== peticion.current) return;
      if (r.ok && data?.success) setConduce(data.data);
      else setError(motivoDeCarga(null, data?.error?.message));
    } catch (err) {
      if (mia === peticion.current) setError(motivoDeCarga(err));
    } finally {
      if (mia === peticion.current) setCargando(false);
    }
  }, []);

  const cerrar = useCallback(() => {
    peticion.current++;
    setConduceId(null);
    setConduce(null);
    setError(null);
    setCargando(false);
  }, []);

  return { conduceId, conduce, cargando, error, abrir, cerrar };
}

export function VerConduce({
  visor,
  onDespachado,
}: {
  visor: ReturnType<typeof useVerConduce>;
  /** Tras despachar, para que la lista se recargue. */
  onDespachado: () => void;
}) {
  const confirm = useConfirm();
  const [despachando, setDespachando] = useState(false);
  const { conduceId, conduce, cargando, error, abrir, cerrar } = visor;
  const pendiente = conduce ? pendienteSiSeDespachaLoDisponible(conduce) : null;

  const despacharLoDisponible = async () => {
    if (!conduce || !pendiente) return;
    const ok = await confirm({
      title: `Despachar lo disponible de ${conduce.numero}`,
      description:
        'Se despacha lo que hay en existencia: descuenta el inventario y asienta su costo de venta. ' +
        `Lo pendiente pasa a un conduce nuevo en borrador (${pendiente}).`,
    });
    if (!ok) return;
    setDespachando(true);
    try {
      const r = await fetch(`/api/v1/delivery-notes/${conduce.id}/despachar-disponible`, { method: 'POST' });
      const data = await r.json().catch(() => null);
      if (r.ok && data?.success) {
        toast.success(data.message);
        cerrar();
        onDespachado();
      } else {
        toast.error(data?.error?.message || 'No se pudo despachar lo disponible.');
      }
    } catch (err) {
      toast.error(motivoDeCarga(err));
    } finally {
      setDespachando(false);
    }
  };

  return (
    <Modal
      isOpen={conduceId !== null}
      onClose={cerrar}
      maxWidth="4xl"
      title={conduce ? `Conduce ${conduce.numero}` : 'Conduce'}
      description={conduce ? ESTADOS[conduce.estado] ?? conduce.estado : undefined}
      footer={pendiente ? (
        <Button type="button" onClick={despacharLoDisponible} disabled={despachando}>
          {despachando ? 'Despachando…' : 'Despachar lo disponible'}
        </Button>
      ) : undefined}
    >
      {cargando && <div className="py-10 text-center text-sm text-slate-400">Cargando conduce…</div>}
      {error && conduceId && <ErrorDeCarga mensaje={error} onReintentar={() => abrir(conduceId)} />}

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
