'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { X, FileText, AlertTriangle, Printer, Info } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorDeCarga, motivoDeCarga } from '@/components/ui/estado-carga';
import { CONFIG_RIESGO } from '@/services/cartera/riesgo';
import type { FilaCartera, TipoCartera } from './tipos';
import { AVISO_CREDITO, PALABRAS, dinero } from './tipos';
import { abrirEstadoImpreso } from './estadoImpreso';

interface DocumentoPendiente {
  id: string;
  referencia: string | null;
  codigo: string | null;
  fecha: string;
  vence: string;
  monto: string;
  saldo: string;
  estado: string;
  diasAtraso: number;
}

const fecha = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export function ModalEstadoCuenta({
  fila,
  tipo,
  onCerrar,
}: {
  fila: FilaCartera;
  tipo: TipoCartera;
  onCerrar: () => void;
}) {
  const P = PALABRAS[tipo];
  const r = CONFIG_RIESGO[fila.nivelRiesgo];

  const [documentos, setDocumentos] = useState<DocumentoPendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Fuera del efecto para que el boton de reintentar pueda volver a llamarla.
  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await fetch(`/api/v1/cartera/${fila.id}?tipo=${tipo}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setDocumentos(data.data);
      } else {
        // Sin esto, un fallo dejaba la lista vacia y el estado de cuenta decia
        // "sin documentos pendientes" -- que es justo lo contrario de lo que
        // pasa cuando no se pudo leer.
        setDocumentos([]);
        setErrorCarga(motivoDeCarga(null, data?.error?.message));
      }
    } catch (err) {
      setDocumentos([]);
      setErrorCarga(motivoDeCarga(err));
    } finally {
      setCargando(false);
    }
  }, [fila.id, tipo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Escape cierra. Un modal que solo se cierra con el raton es un modal que
  // atrapa a quien navega con teclado.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [onCerrar]);

  const disponible = fila.cupoCredito !== null ? fila.cupoCredito - fila.saldo : null;

  /** La mecanica -- y el aviso si bloquean la ventana -- vive en un solo sitio. */
  const imprimir = () => abrirEstadoImpreso(tipo, fila.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Estado de cuenta de ${fila.nombre}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between p-5 border-b border-neutral-200">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
              style={{ backgroundColor: r.color }}
              aria-hidden="true"
            >
              {fila.nombre.split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-neutral-900 truncate">{fila.nombre}</h2>
              <p className="text-xs text-neutral-600">
                {fila.rncCedula ? `RNC/Cédula: ${fila.rncCedula}` : 'Sin RNC/Cédula registrado'}
                {' · '}
                <span className={`font-semibold`} style={{ color: r.color }}>{r.etiquetaCorta}</span>
                {fila.diasAtraso > 0 && ` · ${fila.diasAtraso} días de atraso`}
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* El mismo aviso que en la pantalla, palabra por palabra: si aqui
              dijera otra cosa, habria dos reglas y ninguna seria de fiar. */}
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[11px] leading-relaxed text-blue-900">{AVISO_CREDITO}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200/80">
              <span className="text-[11px] text-rose-700 font-medium block">Saldo pendiente</span>
              <div className="text-lg font-bold text-rose-900 tabular-nums">{dinero(fila.saldo)}</div>
              <span className="text-[10px] text-rose-600">{P.totalPie}</span>
            </div>

            {/* Las dos tarjetas del cupo SOLO existen si hay cupo. En suplidores
                no lo hay, y enseñar un 0 se leeria como "cupo agotado". */}
            {fila.cupoCredito !== null && (
              <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                <span className="text-[11px] text-neutral-600 font-medium block">Cupo de crédito</span>
                <div className="text-lg font-bold text-neutral-800 tabular-nums">{dinero(fila.cupoCredito)}</div>
                <span className="text-[10px] text-neutral-600">Autorizado</span>
              </div>
            )}

            {disponible !== null && (
              <div className={`p-3 rounded-xl border ${disponible >= 0 ? 'bg-emerald-50/70 border-emerald-200/80' : 'bg-amber-50/70 border-amber-200/80'}`}>
                <span className={`text-[11px] font-medium block ${disponible >= 0 ? 'text-emerald-700' : 'text-amber-800'}`}>
                  Disponible
                </span>
                <div className={`text-lg font-bold tabular-nums ${disponible >= 0 ? 'text-emerald-900' : 'text-amber-900'}`}>
                  {dinero(disponible)}
                </div>
                <span className={`text-[10px] ${disponible >= 0 ? 'text-emerald-600' : 'text-amber-700'}`}>
                  {disponible >= 0 ? 'Capacidad restante' : 'Cupo excedido'}
                </span>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                Documentos sin saldar
              </h3>
              {!cargando && !errorCarga && (
                <span className="text-xs text-neutral-600">{documentos.length} en total</span>
              )}
            </div>

            {cargando ? (
              <div aria-busy="true" className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 bg-slate-200/70 rounded animate-pulse" aria-hidden="true" />
                ))}
              </div>
            ) : errorCarga ? (
              <ErrorDeCarga mensaje={errorCarga} onReintentar={cargar} />
            ) : documentos.length === 0 ? (
              <div className="py-8 text-center text-neutral-500 border border-dashed border-neutral-200 rounded-xl">
                <FileText className="w-7 h-7 mx-auto mb-2 text-neutral-300" />
                <p className="text-sm font-medium">Sin documentos pendientes</p>
                <p className="text-xs text-neutral-400">Este {P.entidad} no tiene saldo por saldar.</p>
              </div>
            ) : (
              <div className="border border-neutral-200 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-neutral-100/70 text-neutral-600 uppercase text-[11px] tracking-wider">
                    <tr>
                      <th className="py-2 px-3">Documento</th>
                      <th className="py-2 px-3">Fecha</th>
                      <th className="py-2 px-3">Vence</th>
                      <th className="py-2 px-3 text-right">Monto</th>
                      <th className="py-2 px-3 text-right">Saldo</th>
                      <th className="py-2 px-3 text-center">Atraso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200/70">
                    {documentos.map((d) => (
                      <tr key={d.id} className="hover:bg-neutral-50">
                        <td className="py-2 px-3 font-mono text-neutral-800">
                          {d.referencia || d.codigo || 'Sin referencia'}
                        </td>
                        <td className="py-2 px-3 text-neutral-600">{fecha(d.fecha)}</td>
                        <td className="py-2 px-3 text-neutral-600">{fecha(d.vence)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-neutral-700">{dinero(Number(d.monto))}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-neutral-900">{dinero(Number(d.saldo))}</td>
                        <td className="py-2 px-3 text-center">
                          {d.diasAtraso > 0 ? (
                            <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                              <AlertTriangle className="w-3 h-3" />
                              {d.diasAtraso} d.
                            </span>
                          ) : (
                            <span className="text-emerald-700">Al día</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-neutral-200 bg-neutral-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[11px] text-neutral-500">
            Este panel es para consultar. Para registrar {tipo === 'clientes' ? 'un cobro' : 'un pago'}, ve a {P.irA.replace('Ir a ', '')}.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={imprimir}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir estado</span>
            </button>
            <button
              onClick={onCerrar}
              className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
