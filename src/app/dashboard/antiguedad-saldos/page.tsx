'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Building2, TrendingUp, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useRbac } from '@/components/providers/rbacContext';
import { ErrorDeCarga, motivoDeCarga } from '@/components/ui/estado-carga';
import { CONFIG_RIESGO, NIVELES, type NivelRiesgo } from '@/services/cartera/riesgo';
import { GraficaDonaRiesgo } from '@/components/cartera/GraficaDonaRiesgo';
import { LeyendaRiesgo } from '@/components/cartera/LeyendaRiesgo';
import { TarjetasResumen } from '@/components/cartera/TarjetasResumen';
import { TablaCartera } from '@/components/cartera/TablaCartera';
import { ModalEstadoCuenta } from '@/components/cartera/ModalEstadoCuenta';
import { AVISO_CREDITO, PALABRAS, dineroCorto, type EstadisticaNivel, type FilaCartera, type TipoCartera } from '@/components/cartera/tipos';

/** El esqueleto tiene la forma de lo que viene: tarjetas, dona y tabla. */
function EsqueletoCartera() {
  const barra = (c: string) => <div className={`bg-slate-200/70 rounded animate-pulse ${c}`} />;
  return (
    <div data-esqueleto-cartera aria-busy="true" aria-live="polite" className="space-y-4">
      <p className="sr-only">Cargando la cartera…</p>
      <div aria-hidden="true" className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-4 rounded-xl border border-neutral-200/90 space-y-2">
              {barra('h-3 w-24')}
              {barra('h-7 w-32')}
              {barra('h-2 w-20')}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 bg-white rounded-xl border border-neutral-200/80 p-4 flex justify-center">
            <div className="w-[300px] h-[300px] rounded-full bg-slate-200/70 animate-pulse" />
          </div>
          <div className="lg:col-span-7 bg-white rounded-xl border border-neutral-200/80 p-4 space-y-3">
            {barra('h-3 w-48')}
            {barra('h-3 w-full')}
            {barra('h-3 w-5/6')}
            <div className="grid grid-cols-3 gap-2.5 pt-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 bg-slate-200/70 rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200/90 overflow-hidden">
          <div className="p-4 border-b border-neutral-200 bg-neutral-50/50">{barra('h-8 w-72')}</div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-4 border-t border-neutral-100">
              {barra('h-8 w-8 rounded-full')}
              {barra('h-4 flex-1')}
              {barra('h-6 w-24')}
              {barra('h-6 w-20')}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CarteraPage() {
  // LAS PESTAÑAS SE AJUSTAN AL PERMISO, no al reves.
  //
  // Las dos pestañas piden modulos distintos -- clientes exige `cobros`,
  // suplidores exige `proveedores` --, y hay roles reales que tienen uno y no
  // el otro: `facturacion` tiene cobros y NO proveedores; `compras` al reves.
  // Enseñar las dos siempre significaba que ese usuario pulsara una pestaña
  // para recibir un 403, que es un "no puedes" disfrazado de averia.
  //
  // Es la misma comprobacion que usa la barra lateral, asi que lo que se ve
  // aqui y lo que se ve en el menu no pueden discrepar.
  //
  // OJO CON EL `loading`: mientras la sesion no ha respondido, `hasPermission`
  // devuelve false para TODO (`if (!user) return false`). Sin gatear por el,
  // la pantalla arranca acusando al usuario de no tener acceso y luego se
  // desdice sola. Un "no puedes" que dura 300ms sigue siendo un "no puedes".
  const { hasPermission, loading: cargandoPermisos } = useRbac();
  const puedeClientes = !cargandoPermisos && hasPermission('cobros', 'read');
  const puedeSuplidores = !cargandoPermisos && hasPermission('proveedores', 'read');
  const sinAcceso = !cargandoPermisos && !puedeClientes && !puedeSuplidores;

  const [tipo, setTipo] = useState<TipoCartera>('clientes');
  const [filas, setFilas] = useState<FilaCartera[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [nivel, setNivel] = useState<NivelRiesgo | null>(null);
  const [detalle, setDetalle] = useState<FilaCartera | null>(null);

  const P = PALABRAS[tipo];

  const cargar = useCallback(async (cual: TipoCartera) => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await fetch(`/api/v1/cartera?tipo=${cual}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setFilas(data.data);
      } else {
        // P2-37: vaciar y dejar rastro. Sin esto, un fallo enseñaria la cartera
        // de la pestaña anterior como si fuera esta.
        setFilas([]);
        setErrorCarga(motivoDeCarga(null, data?.error?.message));
      }
    } catch (err) {
      setFilas([]);
      setErrorCarga(motivoDeCarga(err));
    } finally {
      setCargando(false);
    }
  }, []);

  // Los permisos llegan cuando responde la sesion, asi que la pestaña inicial
  // puede resultar no permitida: se corrige al saberlo, en vez de dejar que la
  // primera carga se estrelle contra un 403.
  useEffect(() => {
    if (cargandoPermisos) return;
    if (tipo === 'clientes' && !puedeClientes && puedeSuplidores) setTipo('suplidores');
    if (tipo === 'suplidores' && !puedeSuplidores && puedeClientes) setTipo('clientes');
  }, [cargandoPermisos, tipo, puedeClientes, puedeSuplidores]);

  /** La pestaña que hay abierta, ¿puede este usuario abrirla de verdad? */
  const permitida = tipo === 'clientes' ? puedeClientes : puedeSuplidores;

  useEffect(() => {
    // Al cambiar de pestaña se vacia ANTES de pedir: si no, mientras carga
    // suplidores seguirias viendo clientes bajo el rotulo de suplidores.
    setFilas([]);
    setNivel(null);
    setDetalle(null);
    // No se pide lo que se sabe que va a dar 403. El caso real es `compras`,
    // que solo tiene `proveedores`: la pestaña inicial es clientes, y sin este
    // freno la pantalla pedia clientes, cobraba el 403, pintaba el aviso de
    // error y SOLO DESPUES el efecto de arriba la movia a suplidores. El
    // usuario veia una averia que no existia.
    if (cargandoPermisos || !permitida) return;
    cargar(tipo);
  }, [tipo, cargar, cargandoPermisos, permitida]);

  const stats: EstadisticaNivel[] = useMemo(() => {
    const total = filas.length || 1;
    return NIVELES.map((n) => {
      const suyas = filas.filter((f) => f.nivelRiesgo === n);
      return {
        key: n,
        config: CONFIG_RIESGO[n],
        cantidad: suyas.length,
        porcentaje: (suyas.length / total) * 100,
        saldo: suyas.reduce((a, f) => a + f.saldo, 0),
      };
    });
  }, [filas]);

  const saldoTotal = useMemo(() => filas.reduce((a, f) => a + f.saldo, 0), [filas]);
  const saldoDe = (n: NivelRiesgo) => stats.find((s) => s.key === n)?.saldo ?? 0;
  const conAtraso = filas.filter((f) => f.diasAtraso > 0).length;

  const exportarCsv = () => {
    if (filas.length === 0) {
      toast.error('No hay nada que exportar todavía.');
      return;
    }
    const escapar = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cabecera = 'Nombre,RNC_Cedula,Telefono,Correo,Riesgo,Dias_Atraso,Saldo,Cupo_Credito,Documentos_Pendientes\n';
    const cuerpo = filas
      .map((f) =>
        [
          escapar(f.nombre),
          escapar(f.rncCedula),
          escapar(f.telefono),
          escapar(f.correo),
          escapar(CONFIG_RIESGO[f.nivelRiesgo].etiquetaCorta),
          f.diasAtraso,
          f.saldo.toFixed(2),
          // Vacio y no 0: el suplidor no tiene cupo, no tiene cupo cero.
          f.cupoCredito === null ? '' : f.cupoCredito.toFixed(2),
          f.documentosPendientes,
        ].join(',')
      )
      .join('\n');

    // BOM al principio: sin el, Excel en Windows abre las tildes rotas.
    const blob = new Blob(['﻿' + cabecera + cuerpo], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cartera_${tipo}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pb-12">
      <header className="mb-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-xs">
            <Building2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-neutral-900 tracking-tight">
              Antigüedad de Saldos — {tipo === 'clientes' ? 'Clientes' : 'Suplidores'}
            </h1>
            <p className="text-xs text-neutral-500">
              Saldos pendientes clasificados por días transcurridos desde el vencimiento
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportarCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-neutral-300 rounded-lg shadow-2xs transition-colors"
            title="Exportar la cartera a CSV"
          >
            <Download className="w-3.5 h-3.5 text-neutral-500" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </button>
          <button
            onClick={() => cargar(tipo)}
            disabled={cargando}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors disabled:opacity-50"
            title="Volver a cargar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">Actualizar</span>
          </button>
        </div>
      </header>

      {/* Pestañas: la misma tabla con el dinero al reves. Solo las que este
          usuario puede abrir de verdad, y solo cuando ya se sabe cuales son
          (si no, la tira aparece vacia y despues brota, que se ve a averia). */}
      {!cargandoPermisos && !sinAcceso && (
      <div className="mb-4 flex items-center gap-1 border-b border-neutral-200" role="tablist">
        {(['clientes', 'suplidores'] as TipoCartera[])
          .filter((t) => (t === 'clientes' ? puedeClientes : puedeSuplidores))
          .map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tipo === t}
            onClick={() => setTipo(t)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
              tipo === t
                ? 'border-neutral-900 text-neutral-900 bg-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100/70'
            }`}
          >
            {t === 'clientes' ? 'Clientes (por cobrar)' : 'Suplidores (por pagar)'}
          </button>
        ))}
      </div>
      )}

      {/* El aviso va ARRIBA y siempre, no escondido en un tooltip: un cliente
          que debe mucho y sale en verde no se entiende sin el, y esa confusion
          es justo la que hace que se deje de confiar en la pantalla. */}
      <div
        data-aviso-credito
        className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2"
      >
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-[11px] leading-relaxed text-blue-900">{AVISO_CREDITO}</p>
      </div>

      {sinAcceso ? (
        /* Se llega aqui escribiendo la URL: el menu ya no lo enseña. Decirlo es
           mejor que un panel vacio que parece roto. Y va DESPUES de resolver
           los permisos -- `sinAcceso` es false mientras `cargandoPermisos`, asi
           que lo que se ve entretanto es el esqueleto, no una acusacion. */
        <div className="bg-white rounded-xl border border-neutral-200 p-10 text-center">
          <p className="text-sm font-semibold text-neutral-800">No tienes acceso a esta pantalla</p>
          <p className="text-xs text-neutral-500 mt-1">
            Necesitas permiso de lectura sobre cobros o sobre proveedores. Pídeselo a quien
            administre los usuarios.
          </p>
        </div>
      ) : cargandoPermisos || cargando ? (
        <EsqueletoCartera />
      ) : errorCarga ? (
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm">
          <ErrorDeCarga mensaje={errorCarga} onReintentar={() => cargar(tipo)} />
        </div>
      ) : (
        <>
          <TarjetasResumen filas={filas} tipo={tipo} />

          <section className="mb-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              <div className="lg:col-span-5 flex justify-center">
                <div className="w-full">
                  <GraficaDonaRiesgo
                    stats={stats}
                    totalEntidades={filas.length}
                    totalSaldo={saldoTotal}
                    seleccionado={nivel}
                    onSeleccionar={setNivel}
                    nombrePlural={P.entidades}
                  />
                </div>
              </div>

              <div className="lg:col-span-7 flex flex-col justify-between bg-white rounded-xl border border-neutral-200/80 p-4 shadow-xs">
                <div>
                  <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-neutral-100">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-neutral-700" />
                      <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                        Balance Operativo
                      </h2>
                    </div>
                    <span className="text-[11px] font-semibold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-full">
                      {conAtraso} con atraso
                    </span>
                  </div>

                  <p className="text-xs text-neutral-600 leading-relaxed mb-4">
                    {AVISO_CREDITO}
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-3">
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl">
                      <span className="text-[11px] text-emerald-800 font-semibold block">Al día</span>
                      <span className="text-base font-bold text-emerald-950 tabular-nums">{dineroCorto(saldoDe('bajo'))}</span>
                      <span className="text-[10px] text-emerald-700 block mt-0.5">Todo dentro del plazo</span>
                    </div>
                    <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl">
                      <span className="text-[11px] text-amber-800 font-semibold block">En observación</span>
                      <span className="text-base font-bold text-amber-950 tabular-nums">{dineroCorto(saldoDe('medio'))}</span>
                      <span className="text-[10px] text-amber-700 block mt-0.5">Atraso ≤ 15 días</span>
                    </div>
                    <div className="p-3 bg-rose-50/70 border border-rose-200/80 rounded-xl col-span-2 sm:col-span-1">
                      <span className="text-[11px] text-rose-800 font-semibold block">Acción inmediata</span>
                      <span className="text-base font-bold text-rose-950 tabular-nums">
                        {dineroCorto(saldoDe('alto') + saldoDe('critico'))}
                      </span>
                      <span className="text-[10px] text-rose-700 block mt-0.5">Más de 15 días de atraso</span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-neutral-500 pt-2 border-t border-neutral-100 flex items-center justify-between gap-2">
                  <span>Haz clic en la dona o en la leyenda para filtrar la tabla.</span>
                  <span className="font-medium text-neutral-700 whitespace-nowrap">
                    Total: {dineroCorto(saldoTotal)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-4">
            <LeyendaRiesgo stats={stats} seleccionado={nivel} onSeleccionar={setNivel} />
          </section>

          <section>
            <TablaCartera
              filas={filas}
              tipo={tipo}
              seleccionado={nivel}
              onSeleccionar={setNivel}
              onVerEstado={setDetalle}
            />
          </section>
        </>
      )}

      {detalle && (
        <ModalEstadoCuenta fila={detalle} tipo={tipo} onCerrar={() => setDetalle(null)} />
      )}
    </div>
  );
}
