'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Search, Phone, Mail, Copy, Check, ArrowUpDown, FileSpreadsheet, Eye, ExternalLink, Printer,
} from 'lucide-react';
import { CONFIG_RIESGO, type NivelRiesgo } from '@/services/cartera/riesgo';
import { GraficaRendimiento } from './GraficaRendimiento';
import { IconoRiesgo } from './iconosRiesgo';
import type { FilaCartera, TipoCartera } from './tipos';
import { PALABRAS, dinero, dineroCorto } from './tipos';
import { urlEstadoImpreso } from './estadoImpreso';

type Campo = 'nombre' | 'saldo' | 'riesgo' | 'atraso';

const PESO_RIESGO: Record<NivelRiesgo, number> = { bajo: 1, medio: 2, alto: 3, critico: 4 };

export function TablaCartera({
  filas,
  tipo,
  seleccionado,
  onSeleccionar,
  onVerEstado,
}: {
  filas: FilaCartera[];
  tipo: TipoCartera;
  seleccionado: NivelRiesgo | null;
  onSeleccionar: (n: NivelRiesgo | null) => void;
  onVerEstado: (f: FilaCartera) => void;
}) {
  const P = PALABRAS[tipo];
  const [busqueda, setBusqueda] = useState('');
  const [campo, setCampo] = useState<Campo>('saldo');
  const [asc, setAsc] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const copiar = async (texto: string, marca: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(marca);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      // El portapapeles puede estar bloqueado (sin https, o permiso denegado).
      // No hay nada que recuperar y no se pierde ningun dato: el texto sigue a
      // la vista para copiarlo a mano.
    }
  };

  const filtradas = filas.filter((f) => {
    if (seleccionado && f.nivelRiesgo !== seleccionado) return false;
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return (
      f.nombre.toLowerCase().includes(q) ||
      (f.rncCedula ?? '').toLowerCase().includes(q) ||
      (f.telefono ?? '').toLowerCase().includes(q) ||
      (f.correo ?? '').toLowerCase().includes(q)
    );
  });

  const ordenadas = [...filtradas].sort((a, b) => {
    let c = 0;
    if (campo === 'nombre') c = a.nombre.localeCompare(b.nombre, 'es');
    else if (campo === 'saldo') c = a.saldo - b.saldo;
    else if (campo === 'riesgo') c = PESO_RIESGO[a.nivelRiesgo] - PESO_RIESGO[b.nivelRiesgo];
    else c = a.diasAtraso - b.diasAtraso;
    return asc ? c : -c;
  });

  const ordenar = (f: Campo) => {
    if (campo === f) setAsc(!asc);
    else {
      setCampo(f);
      setAsc(false);
    }
  };

  const iniciales = (nombre: string) =>
    nombre.split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="bg-white rounded-xl border border-neutral-200/90 shadow-xs overflow-hidden" data-tabla-cartera>
      <div className="p-4 border-b border-neutral-200 bg-neutral-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={`Buscar por nombre, RNC/cédula, teléfono o correo...`}
            className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-neutral-300 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-neutral-800 transition-all"
            data-buscar-cartera
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-600"
              aria-label="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {seleccionado && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-100 rounded-lg text-xs text-neutral-700">
              <span>Filtrado por:</span>
              <span
                className="font-semibold px-1.5 py-0.5 rounded text-[11px]"
                style={{
                  backgroundColor: `${CONFIG_RIESGO[seleccionado].color}20`,
                  color: CONFIG_RIESGO[seleccionado].color,
                }}
              >
                {CONFIG_RIESGO[seleccionado].etiquetaCorta}
              </span>
              <button
                onClick={() => onSeleccionar(null)}
                className="ml-1 text-neutral-400 hover:text-neutral-700 font-bold"
                title="Limpiar filtro"
              >
                ✕
              </button>
            </div>
          )}

          <span className="text-xs text-neutral-500 hidden sm:inline tabular-nums">
            Mostrando {ordenadas.length} de {filas.length}
          </span>

          {/* Este panel es para MIRAR. Registrar cobros y pagos vive en su
              pantalla, y desde aqui se va con un clic en vez de duplicar la
              operacion en dos sitios que podrian discrepar. */}
          <Link
            href={P.rutaOperativa}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg shadow-xs transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{P.irA}</span>
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-neutral-100/70 border-b border-neutral-200 text-neutral-600 font-semibold uppercase tracking-wider text-[11px]">
              <th onClick={() => ordenar('nombre')} className="py-3 px-4 cursor-pointer hover:bg-neutral-200/50 transition-colors select-none">
                <div className="flex items-center gap-1.5"><span>Nombre</span><ArrowUpDown className="w-3 h-3 text-neutral-400" /></div>
              </th>
              <th className="py-3 px-4">RNC / Cédula</th>
              <th className="py-3 px-3 text-center">Tel.</th>
              <th className="py-3 px-3 text-center">Correo</th>
              <th className="py-3 px-4">Facturación Mensual</th>
              <th onClick={() => ordenar('saldo')} className="py-3 px-4 text-right cursor-pointer hover:bg-neutral-200/50 transition-colors select-none">
                <div className="flex items-center justify-end gap-1.5"><span>Saldo Pendiente</span><ArrowUpDown className="w-3 h-3 text-neutral-400" /></div>
              </th>
              <th onClick={() => ordenar('riesgo')} className="py-3 px-4 text-center cursor-pointer hover:bg-neutral-200/50 transition-colors select-none">
                <div className="flex items-center justify-center gap-1.5"><span>Riesgo</span><ArrowUpDown className="w-3 h-3 text-neutral-400" /></div>
              </th>
              <th className="py-3 px-4 text-center">Estado de Cuenta</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-200/70">
            {ordenadas.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-neutral-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <FileSpreadsheet className="w-8 h-8 text-neutral-300" />
                    <p className="text-sm font-medium">
                      {filas.length === 0 ? `Sin ${P.entidades} en cartera` : `No se encontraron ${P.entidades}`}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {filas.length === 0 ? P.moduloVacio : 'Prueba con otro término de búsqueda o quita el filtro de riesgo.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              ordenadas.map((f) => {
                const r = CONFIG_RIESGO[f.nivelRiesgo];
                return (
                  <tr key={f.id} className="hover:bg-neutral-50/80 transition-colors group" data-fila-cartera={f.id}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-xs"
                          style={{ backgroundColor: r.color }}
                          aria-hidden="true"
                        >
                          {iniciales(f.nombre)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-neutral-900 text-xs truncate max-w-[220px]">{f.nombre}</p>
                          <p className="text-[11px] text-neutral-500">
                            {f.documentosPendientes} {f.documentosPendientes === 1 ? P.documento : `${P.documento}s`} sin saldar
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {f.rncCedula ? (
                        <div className="inline-flex items-center gap-1.5 font-mono text-xs text-neutral-700 bg-neutral-100/80 px-2 py-1 rounded">
                          <span>{f.rncCedula}</span>
                          <button
                            onClick={() => copiar(f.rncCedula!, `rnc-${f.id}`)}
                            className="text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
                            title="Copiar identificación"
                          >
                            {copiado === `rnc-${f.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      ) : (
                        /* Sin RNC no se pinta un hueco mudo: se dice que falta,
                           porque para un e-31 hace falta y conviene verlo. */
                        <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          Sin registrar
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {f.telefono ? (
                        <div className="relative inline-flex items-center justify-center group/tel">
                          <a
                            href={`tel:${f.telefono.replace(/[^0-9+]/g, '')}`}
                            className="w-8 h-8 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 flex items-center justify-center transition-colors shadow-2xs"
                            aria-label={`Teléfono de ${f.nombre}: ${f.telefono}`}
                          >
                            <Phone className="w-4 h-4 text-emerald-600" />
                          </a>
                          <div className="absolute z-40 bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tel:flex flex-col items-center pointer-events-none">
                            <div className="bg-neutral-900 text-white rounded-lg px-3 py-2 text-xs shadow-xl border border-neutral-700 whitespace-nowrap">
                              <span className="font-mono font-bold">{f.telefono}</span>
                            </div>
                            <div className="w-2 h-2 bg-neutral-900 rotate-45 -mt-1 border-r border-b border-neutral-700" />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-neutral-400">—</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center">
                      {f.correo ? (
                        <div className="relative inline-flex items-center justify-center group/mail">
                          <button
                            onClick={() => copiar(f.correo!, `mail-${f.id}`)}
                            className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-blue-50 text-neutral-600 hover:text-blue-600 border border-neutral-200/80 flex items-center justify-center cursor-pointer transition-colors"
                            aria-label={`Correo de ${f.nombre}: ${f.correo}`}
                          >
                            {copiado === `mail-${f.id}` ? <Check className="w-4 h-4 text-emerald-600" /> : <Mail className="w-4 h-4" />}
                          </button>
                          <div className="absolute z-40 bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/mail:flex flex-col items-center pointer-events-none">
                            <div className="bg-neutral-900 text-white rounded-lg px-3 py-2 text-xs shadow-xl border border-neutral-700 whitespace-nowrap">
                              <span>{f.correo}</span>
                              <div className="mt-1 text-[10px] text-neutral-400 pt-1 border-t border-neutral-800">Clic para copiar</div>
                            </div>
                            <div className="w-2 h-2 bg-neutral-900 rotate-45 -mt-1 border-r border-b border-neutral-700" />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-neutral-400">—</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <GraficaRendimiento datos={f.mensual} />
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="font-bold text-neutral-900 text-xs tabular-nums">{dinero(f.saldo)}</div>
                      {f.cupoCredito !== null && (
                        <div className="text-[10px] text-neutral-600">Cupo: {dineroCorto(f.cupoCredito)}</div>
                      )}
                    </td>

                    {/* Solo el icono, el mismo de la leyenda. Lleva su nombre y
                        su criterio dentro (`title` y `aria-label`), asi que no
                        hace falta sabersela de memoria ni verla para leerlo. */}
                    <td className="py-3 px-4 text-center">
                      <IconoRiesgo nivel={f.nivelRiesgo} className="w-[18px] h-[18px]" />
                      {f.diasAtraso > 0 && (
                        <div className="text-[10px] text-rose-600 font-medium mt-0.5">{f.diasAtraso} d. atraso</div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => onVerEstado(f)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 hover:text-neutral-900 rounded-md transition-colors cursor-pointer"
                          title="Ver estado de cuenta"
                        >
                          <Eye className="w-3.5 h-3.5 text-neutral-500" />
                          <span className="hidden sm:inline">Ver</span>
                        </button>
                        {/* Un ENLACE: la ruta devuelve el PDF directamente, asi
                            que lo abre el navegador -- sin `window.open` que
                            puedan bloquear, y se puede abrir en otra pestaña. */}
                        <a
                          href={urlEstadoImpreso(tipo, f.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-2 py-1 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 hover:text-neutral-900 rounded-md transition-colors"
                          title="Imprimir estado de cuenta"
                          aria-label={`Imprimir el estado de cuenta de ${f.nombre}`}
                        >
                          <Printer className="w-3.5 h-3.5 text-neutral-500" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="p-3 border-t border-neutral-200 bg-neutral-50/50 flex flex-wrap items-center justify-between text-xs text-neutral-500 gap-2">
        <div className="flex items-center gap-4">
          <span>
            Total listado:{' '}
            <strong className="text-neutral-800 tabular-nums">
              {dinero(ordenadas.reduce((a, f) => a + f.saldo, 0))}
            </strong>
          </span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline">
            Con atraso: <strong className="text-rose-600 tabular-nums">{ordenadas.filter((f) => f.diasAtraso > 0).length}</strong>
          </span>
        </div>
        <div className="text-[11px] text-neutral-400">
          El crédito es de 30 días; el atraso se cuenta desde que vence
        </div>
      </div>
    </div>
  );
}
