'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Palmtree, CalendarCheck, CalendarClock, Plus, X, RefreshCw, AlertCircle, Scale, Search,
} from 'lucide-react';
import { toast } from 'sonner';

type Saldo = {
  employeeId: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  hireDate: string;
  status: string;
  generatedDays: number;
  takenDays: number;
  availableDays: number;
  diasSugeridos: number;
  diasPorRegistrar: number;
};

const fecha = (v: string) => (v ? new Date(v).toLocaleDateString('es-DO', { timeZone: 'UTC' }) : '—');

function antiguedad(hireDate: string) {
  if (!hireDate) return '—';
  const alta = new Date(hireDate);
  const hoy = new Date();
  let meses = (hoy.getFullYear() - alta.getFullYear()) * 12 + (hoy.getMonth() - alta.getMonth());
  if (hoy.getDate() < alta.getDate()) meses -= 1;
  if (meses < 0) return '—';
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  if (anios === 0) return `${resto} ${resto === 1 ? 'mes' : 'meses'}`;
  if (resto === 0) return `${anios} ${anios === 1 ? 'año' : 'años'}`;
  return `${anios} a ${resto} m`;
}

export default function VacationsPage() {
  const [saldos, setSaldos] = useState<Saldo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [seleccionado, setSeleccionado] = useState<Saldo | null>(null);
  const [generados, setGenerados] = useState('');
  const [tomados, setTomados] = useState('');

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/hr/vacations');
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Error al cargar');
      setSaldos(json.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar el saldo de vacaciones');
    } finally {
      setLoading(false);
    }
  }

  const totales = useMemo(() => {
    const activos = saldos.filter((s) => s.status === 'active');
    return {
      disponibles: activos.reduce((a, s) => a + Number(s.availableDays || 0), 0),
      tomados: activos.reduce((a, s) => a + Number(s.takenDays || 0), 0),
      porRegistrar: activos.reduce((a, s) => a + Number(s.diasPorRegistrar || 0), 0),
      conPendiente: activos.filter((s) => s.diasPorRegistrar > 0).length,
    };
  }, [saldos]);

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return saldos;
    return saldos.filter((s) =>
      `${s.firstName} ${s.lastName} ${s.employeeCode}`.toLowerCase().includes(q)
    );
  }, [saldos, busqueda]);

  function abrirModal(s: Saldo, prellenarSugeridos = false) {
    setSeleccionado(s);
    setGenerados(prellenarSugeridos && s.diasPorRegistrar > 0 ? String(s.diasPorRegistrar) : '');
    setTomados('');
    setShowModal(true);
  }

  const gen = Number(generados || 0);
  const tom = Number(tomados || 0);
  const disponibleTrasMovimiento = seleccionado
    ? Number(seleccionado.availableDays || 0) + gen - tom
    : 0;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!seleccionado) return;
    if (gen <= 0 && tom <= 0) {
      toast.error('Indique días generados o días tomados');
      return;
    }
    if (disponibleTrasMovimiento < 0) {
      toast.error('El saldo no puede quedar negativo');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/v1/hr/vacations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: seleccionado.employeeId,
          generatedDays: gen,
          takenDays: tom,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'No se pudo guardar');
      toast.success('Saldo de vacaciones actualizado');
      setShowModal(false);
      await cargar();
    } catch (err: any) {
      toast.error(err.message || 'No se pudo guardar el movimiento');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Palmtree className="h-7 w-7 text-emerald-600" /> Vacaciones
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Saldo de días por empleado. Los días sugeridos siguen la escala del Art. 177 del Código de Trabajo.
          </p>
        </div>
        <button
          onClick={cargar}
          className="inline-flex items-center justify-center rounded-md border border-outline bg-surface p-2 text-sm font-medium text-on-surface shadow-sm hover:bg-surface-variant transition"
          title="Actualizar"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Indicadores */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-outline bg-surface p-6 shadow-sm text-on-surface">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-on-surface-variant/80">Días Disponibles</span>
            <CalendarCheck className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold tracking-tight">{totales.disponibles}</span>
            <p className="text-xs text-on-surface-variant/60 mt-1">Acumulados y sin tomar, en empleados activos</p>
          </div>
        </div>

        <div className="rounded-xl border border-outline bg-surface p-6 shadow-sm text-on-surface">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-on-surface-variant/80">Días Tomados</span>
            <CalendarClock className="h-5 w-5 text-[#003366] dark:text-[#799dd6]" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold tracking-tight">{totales.tomados}</span>
            <p className="text-xs text-on-surface-variant/60 mt-1">Histórico registrado</p>
          </div>
        </div>

        <div className="rounded-xl border border-outline bg-surface p-6 shadow-sm text-on-surface">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-on-surface-variant/80">Por Registrar (Art. 177)</span>
            <Scale className="h-5 w-5 text-amber-500" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold tracking-tight">{totales.porRegistrar}</span>
            <p className="text-xs text-on-surface-variant/60 mt-1">
              {totales.conPendiente} {totales.conPendiente === 1 ? 'empleado tiene' : 'empleados tienen'} días por acreditar
            </p>
          </div>
        </div>
      </div>

      {/* Aviso legal */}
      <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <Scale className="h-5 w-5 shrink-0 text-amber-600" />
        <div className="text-on-surface-variant">
          <span className="font-semibold text-on-surface">Los días sugeridos son una referencia, no un cálculo automático.</span>{' '}
          La escala del Art. 177 va de 6 días a los 5 meses hasta 12 a los 11 meses, 14 días entre 1 y 5 años, y 18 a
          partir de los 5 años, contados en días laborables. Sobre el tramo de 5 años o más no hay lectura única —
          algunas fuentes lo leen como 14 días de descanso pagados a 18 días de salario. Confirme con su asesor laboral
          antes de acreditarlos.
        </div>
      </div>

      {/* Buscador */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant/50" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o código..."
          className="w-full rounded-md border border-outline bg-surface py-2 pl-9 pr-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-[#003366] dark:text-[#799dd6]" />
        </div>
      ) : lista.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline bg-surface py-16 text-on-surface">
          <AlertCircle className="h-10 w-10 text-on-surface-variant/40" />
          <h3 className="mt-2 text-sm font-semibold">
            {busqueda ? 'Ningún empleado coincide con la búsqueda' : 'No hay empleados registrados'}
          </h3>
          <p className="mt-1 text-sm text-on-surface-variant/70">
            {busqueda ? 'Pruebe con otro nombre o código.' : 'Registre empleados para llevar su saldo de vacaciones.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm text-on-surface">
              <thead>
                <tr className="border-b border-outline bg-surface-variant/20 text-on-surface-variant font-semibold">
                  <th className="p-4">Empleado</th>
                  <th className="p-4">Código</th>
                  <th className="p-4">Ingreso</th>
                  <th className="p-4">Antigüedad</th>
                  <th className="p-4 text-right">Generados</th>
                  <th className="p-4 text-right">Tomados</th>
                  <th className="p-4 text-right">Disponibles</th>
                  <th className="p-4 text-right">Sugeridos</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {lista.map((s) => {
                  const inactivo = s.status !== 'active';
                  return (
                    <tr
                      key={s.employeeId}
                      className={`hover:bg-surface-variant/20 transition ${inactivo ? 'opacity-55' : ''}`}
                    >
                      <td className="p-4 font-medium">
                        {s.firstName} {s.lastName}
                        {inactivo && (
                          <span className="ml-2 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                            {s.status}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-on-surface-variant">{s.employeeCode}</td>
                      <td className="p-4 text-on-surface-variant">{fecha(s.hireDate)}</td>
                      <td className="p-4 text-on-surface-variant">{antiguedad(s.hireDate)}</td>
                      <td className="p-4 text-right tabular-nums">{s.generatedDays}</td>
                      <td className="p-4 text-right tabular-nums">{s.takenDays}</td>
                      <td className="p-4 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                        {s.availableDays}
                      </td>
                      <td className="p-4 text-right tabular-nums">
                        <span className="text-on-surface-variant">{s.diasSugeridos}</span>
                        {s.diasPorRegistrar > 0 && (
                          <span
                            className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400"
                            title={`Faltan ${s.diasPorRegistrar} días por acreditar según el Art. 177`}
                          >
                            +{s.diasPorRegistrar}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          {s.diasPorRegistrar > 0 && !inactivo && (
                            <button
                              onClick={() => abrirModal(s, true)}
                              className="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition"
                            >
                              Acreditar {s.diasPorRegistrar}
                            </button>
                          )}
                          <button
                            onClick={() => abrirModal(s)}
                            className="inline-flex items-center rounded-md border border-outline bg-surface px-2.5 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-variant transition"
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" /> Movimiento
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && seleccionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-outline bg-surface p-6 shadow-xl text-on-surface">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold">Movimiento de vacaciones</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {seleccionado.firstName} {seleccionado.lastName} ({seleccionado.employeeCode})
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-md p-1 text-on-surface-variant hover:bg-surface-variant transition"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg border border-outline bg-surface-variant/20 p-3 text-center text-xs">
              <div>
                <div className="text-on-surface-variant/70">Disponibles hoy</div>
                <div className="mt-1 text-lg font-bold tabular-nums">{seleccionado.availableDays}</div>
              </div>
              <div>
                <div className="text-on-surface-variant/70">Sugeridos (Art. 177)</div>
                <div className="mt-1 text-lg font-bold tabular-nums">{seleccionado.diasSugeridos}</div>
              </div>
              <div>
                <div className="text-on-surface-variant/70">Antigüedad</div>
                <div className="mt-1 text-lg font-bold">{antiguedad(seleccionado.hireDate)}</div>
              </div>
            </div>

            <form onSubmit={guardar} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Días generados
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={generados}
                    onChange={(e) => setGenerados(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="mt-1 text-[11px] text-on-surface-variant/60">Días que se le acreditan</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Días tomados
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={tomados}
                    onChange={(e) => setTomados(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="mt-1 text-[11px] text-on-surface-variant/60">Días que disfrutó</p>
                </div>
              </div>

              <div
                className={`rounded-lg border p-3 text-sm ${
                  disponibleTrasMovimiento < 0
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400'
                    : 'border-outline bg-surface-variant/20 text-on-surface-variant'
                }`}
              >
                Saldo tras el movimiento:{' '}
                <span className="font-bold tabular-nums">{disponibleTrasMovimiento}</span> días
                {disponibleTrasMovimiento < 0 && ' — no puede quedar negativo'}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="inline-flex items-center justify-center rounded-md border border-outline bg-surface px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-variant transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || disponibleTrasMovimiento < 0 || (gen <= 0 && tom <= 0)}
                  className="inline-flex items-center justify-center rounded-md bg-[#003366] px-4 py-2 text-sm font-medium text-white shadow hover:bg-[#001e40] disabled:opacity-50"
                >
                  {submitting ? 'Guardando...' : 'Guardar movimiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
