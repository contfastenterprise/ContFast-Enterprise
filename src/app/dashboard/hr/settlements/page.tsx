'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Award, DollarSign, Calendar, Trash2, Plus, RefreshCw, X, AlertCircle, FileText, Info, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

// Format currency helper
const formatCurrency = (val: number | string) => {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return 'RD$ ' + (num || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function SettlementsPage() {
  const [activeTab, setActiveTab] = useState<'settlements' | 'doblesueldo'>('settlements');
  const [employees, setEmployees] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Settlement Form State
  const [employeeId, setEmployeeId] = useState('');
  const [terminationDate, setTerminationDate] = useState(new Date().toISOString().split('T')[0]);
  const [includePreaviso, setIncludePreaviso] = useState(true);
  const [includeCesantia, setIncludeCesantia] = useState(true);
  const [vacacionesDays, setVacacionesDays] = useState(0);
  const [otrosAmount, setOtrosAmount] = useState(0);

  // Calculation Results
  const [calculation, setCalculation] = useState<any | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Doble Sueldo calculation state
  const [dobleYear, setDobleYear] = useState(new Date().getFullYear());
  const [dobleCalculations, setDobleCalculations] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch employees
      const empRes = await fetch('/api/v1/hr/employees');
      const empData = await empRes.json();
      if (empData.success) {
        setEmployees(empData.data);
      }

      // Fetch settlements
      const setRes = await fetch('/api/v1/hr/settlements');
      const setData = await setRes.json();
      if (setData.success) {
        setSettlements(setData.data);
      }
    } catch (e) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  // Run Doble Sueldo calculation in client based on hire dates and salaries
  useEffect(() => {
    if (employees.length === 0) return;

    const currentYear = dobleYear;
    const list = employees
      .filter((emp) => {
        // Hired before or during the selected year, and not terminated before selected year
        const hireDate = new Date(emp.hireDate);
        if (hireDate.getFullYear() > currentYear) return false;

        if (emp.terminationDate) {
          const termDate = new Date(emp.terminationDate);
          if (termDate.getFullYear() < currentYear) return false;
        }

        return true;
      })
      .map((emp) => {
        const hireDate = new Date(emp.hireDate);
        const termDate = emp.terminationDate ? new Date(emp.terminationDate) : new Date(currentYear, 11, 31);

        // Find months worked in this specific year
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31);

        const effectiveStart = hireDate > startOfYear ? hireDate : startOfYear;
        const effectiveEnd = termDate < endOfYear ? termDate : endOfYear;

        const diffMs = effectiveEnd.getTime() - effectiveStart.getTime();
        const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);

        // Months worked (cap at 12)
        const monthsWorked = Math.min(12, Number((diffDays / 30.4).toFixed(2)));

        // 1/12 of the accumulated wages in the year
        const salary = parseFloat(emp.salary) || 0;
        const accumulated = salary * monthsWorked;
        const amount = accumulated / 12;

        return {
          id: emp.id,
          employeeCode: emp.employeeCode,
          firstName: emp.firstName,
          lastName: emp.lastName,
          hireDate: emp.hireDate,
          salary,
          monthsWorked,
          amount,
        };
      });

    setDobleCalculations(list);
  }, [employees, dobleYear]);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) {
      toast.error('Seleccione un empleado');
      return;
    }

    try {
      setCalculating(true);
      const res = await fetch('/api/v1/hr/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          terminationDate,
          includePreaviso,
          includeCesantia,
          vacacionesPendientesDays: Number(vacacionesDays),
          action: 'calculate',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCalculation(data.data);
        toast.success('Cálculo previsualizado correctamente');
      } else {
        toast.error(data.error?.message || 'Error al calcular');
      }
    } catch (err) {
      toast.error('Error de red');
    } finally {
      setCalculating(false);
    }
  };

  const handleSaveSettlement = async () => {
    if (!calculation) return;

    try {
      setSaving(true);
      const res = await fetch('/api/v1/hr/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: calculation.employee.id,
          terminationDate,
          includePreaviso,
          includeCesantia,
          vacacionesPendientesDays: Number(vacacionesDays),
          otros: Number(otrosAmount),
          action: 'save',
          status: 'paid',
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Liquidación registrada y pagada exitosamente');
        setCalculation(null);
        setEmployeeId('');
        setOtrosAmount(0);
        setVacacionesDays(0);
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al guardar');
      }
    } catch (err) {
      toast.error('Error de red');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSettlement = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar esta liquidación? Esto no reactivará automáticamente al empleado.')) return;
    try {
      const res = await fetch(`/api/v1/hr/settlements?id=${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Liquidación eliminada');
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al eliminar');
      }
    } catch (e) {
      toast.error('Error de red');
    }
  };

  // Doble Sueldo total sum
  const totalDobleSum = dobleCalculations.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Prestaciones y Salario de Navidad
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Calcule las liquidaciones de empleados según el Código de Trabajo de RD y proyecte el Doble Sueldo anual.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="inline-flex items-center justify-center rounded-md border border-outline bg-surface p-2 text-sm font-medium text-on-surface shadow-sm hover:bg-surface-variant transition-all"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tab Buttons */}
      <div className="border-b border-outline/30">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('settlements')}
            className={`border-b-2 py-4 px-1 text-sm font-medium whitespace-nowrap ${activeTab === 'settlements'
                ? 'border-[#003366] text-[#003366] dark:border-[#799dd6] dark:text-[#799dd6]'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
          >
            Liquidaciones (Prestaciones Laborales)
          </button>
          <button
            onClick={() => setActiveTab('doblesueldo')}
            className={`border-b-2 py-4 px-1 text-sm font-medium whitespace-nowrap ${activeTab === 'doblesueldo'
                ? 'border-[#003366] text-[#003366] dark:border-[#799dd6] dark:text-[#799dd6]'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
          >
            Salario de Navidad (Doble Sueldo)
          </button>
        </nav>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-[#003366] dark:text-[#799dd6]" />
        </div>
      ) : activeTab === 'settlements' ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Form Column */}
          <div className="space-y-6 lg:col-span-1">
            <div className="rounded-xl border border-outline bg-surface p-6 shadow-sm">
              <h3 className="text-base font-semibold text-on-surface mb-4">Nueva Liquidación</h3>
              <form onSubmit={handleSimulate} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Empleado
                  </label>
                  <select
                    value={employeeId}
                    onChange={(e) => {
                      setEmployeeId(e.target.value);
                      setCalculation(null);
                    }}
                    required
                    className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                  >
                    <option value="">Seleccione un empleado...</option>
                    {employees
                      .filter((e) => e.status === 'active' || e.status === 'suspended')
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName} ({emp.employeeCode})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Fecha de Salida
                  </label>
                  <input
                    type="date"
                    value={terminationDate}
                    onChange={(e) => {
                      setTerminationDate(e.target.value);
                      setCalculation(null);
                    }}
                    required
                    className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Incluir en el Cálculo
                  </label>

                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includePreaviso}
                      onChange={(e) => {
                        setIncludePreaviso(e.target.checked);
                        setCalculation(null);
                      }}
                      className="rounded border-outline bg-surface text-[#003366] focus:ring-primary"
                    />
                    <span>Preaviso de Ley</span>
                  </label>

                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeCesantia}
                      onChange={(e) => {
                        setIncludeCesantia(e.target.checked);
                        setCalculation(null);
                      }}
                      className="rounded border-outline bg-surface text-[#003366] focus:ring-primary"
                    />
                    <span>Cesantía de Ley</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Vacaciones No Tomadas
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={vacacionesDays}
                      onChange={(e) => {
                        setVacacionesDays(parseInt(e.target.value) || 0);
                        setCalculation(null);
                      }}
                      placeholder="Ej. 14"
                      className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Ajuste Extra (RD$)
                    </label>
                    <input
                      type="number"
                      value={otrosAmount === 0 ? '' : otrosAmount}
                      onChange={(e) => {
                        setOtrosAmount(parseFloat(e.target.value) || 0);
                      }}
                      placeholder="Opcional. Ej. -2000"
                      className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={calculating}
                  className="w-full inline-flex items-center justify-center rounded-md bg-[#003366] px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#001e40] disabled:opacity-50"
                >
                  {calculating ? 'Calculando...' : 'Calcular Previsualización'}
                </button>
              </form>
            </div>
          </div>

          {/* Calculations Breakdown Column */}
          <div className="space-y-6 lg:col-span-2">
            {calculation ? (
              <div className="rounded-xl border border-outline bg-surface p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-outline/30 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-on-surface">
                      {calculation.employee.firstName} {calculation.employee.lastName}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Código: {calculation.employee.employeeCode} | Ingreso: {new Date(calculation.employee.hireDate).toLocaleDateString('es-DO')}
                    </p>
                  </div>
                  <Sparkles className="h-6 w-6 text-[#003366] dark:text-[#799dd6]" />
                </div>

                <div className="grid grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Antigüedad</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {calculation.calculation.yearsOfService} años, {calculation.calculation.monthsOfService} meses
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Salario Promedio Diario</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {formatCurrency(calculation.calculation.dailyRate)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Días a Pagar (Cesantía)</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {calculation.calculation.cesantiaDays} días
                    </span>
                  </div>
                </div>

                {/* Table Breakdown */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Desglose de Pago</h4>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-sm">
                    <div className="flex justify-between p-3.5">
                      <span className="text-slate-600 dark:text-slate-400">Preaviso ({calculation.calculation.preavisoDays} días)</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(calculation.calculation.preaviso)}</span>
                    </div>
                    <div className="flex justify-between p-3.5">
                      <span className="text-slate-600 dark:text-slate-400">Cesantía ({calculation.calculation.cesantiaDays} días)</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(calculation.calculation.cesantia)}</span>
                    </div>
                    <div className="flex justify-between p-3.5">
                      <span className="text-slate-600 dark:text-slate-400">Vacaciones Pendientes/Proporcionales ({calculation.calculation.vacacionesDays} días)</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(calculation.calculation.vacaciones)}</span>
                    </div>
                    <div className="flex justify-between p-3.5">
                      <span className="text-slate-600 dark:text-slate-400">Salario de Navidad Proporcional (1/12)</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(calculation.calculation.navidad)}</span>
                    </div>
                    {otrosAmount !== 0 && (
                      <div className="flex justify-between p-3.5">
                        <span className="text-slate-600 dark:text-slate-400">Ajustes / Otros conceptos</span>
                        <span className={`font-semibold ${otrosAmount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatCurrency(otrosAmount)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between p-4 bg-slate-100 dark:bg-slate-800/80 rounded-b-lg font-bold text-base text-slate-800 dark:text-slate-100">
                      <span>Total Neto a Recibir</span>
                      <span>{formatCurrency(calculation.calculation.preaviso + calculation.calculation.cesantia + calculation.calculation.vacaciones + calculation.calculation.navidad + otrosAmount)}</span>
                    </div>
                  </div>
                </div>

                {/* Warning/Info message */}
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-400">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Información Legal de RD</p>
                    <p className="mt-0.5">
                      De acuerdo al Código de Trabajo, el salario de Navidad está exento de TSS, ISR y embargos.
                      Las prestaciones laborales (preaviso y cesantía) tampoco están sujetas a retenciones de ley.
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setCalculation(null)}
                    className="inline-flex items-center justify-center rounded-md border border-outline bg-surface px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-variant transition-all"
                  >
                    Descartar
                  </button>
                  <button
                    onClick={handleSaveSettlement}
                    disabled={saving}
                    className="inline-flex items-center justify-center rounded-md bg-[#003366] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[#001e40] disabled:opacity-50"
                  >
                    {saving ? 'Guardando...' : 'Registrar y Pagar Liquidación'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-outline bg-surface p-6 shadow-sm space-y-4">
                <h3 className="text-base font-semibold text-on-surface">Histórico de Liquidaciones</h3>

                {settlements.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
                    No hay liquidaciones registradas en el sistema.
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl shadow-md mt-4">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Empleado</th>
                          <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Código</th>
                          <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Fecha Salida</th>
                          <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Cesantía/Preaviso</th>
                          <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Total Liquidado</th>
                          <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center w-24">Estado</th>
                          <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right w-24">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {settlements.map((set) => (
                          <tr key={set.id} className="hover:bg-[#C5A059]/5 transition-colors group text-xs text-slate-700 dark:text-slate-200">
                            <td className="px-4 py-2 align-middle font-semibold text-[#003366] dark:text-[#799dd6]">{set.firstName} {set.lastName}</td>
                            <td className="px-4 py-2 align-middle font-mono">{set.employeeCode}</td>
                            <td className="px-4 py-2 align-middle">{new Date(set.settlementDate).toLocaleDateString('es-DO')}</td>
                            <td className="px-4 py-2 align-middle font-mono">
                              {formatCurrency(Number(set.cesantia) + Number(set.preaviso))}
                            </td>
                            <td className="px-4 py-2 align-middle font-bold text-[#003366] dark:text-slate-100 font-mono">{formatCurrency(set.total)}</td>
                            <td className="px-4 py-2 align-middle text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${set.status === 'paid'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-50 text-slate-500 border border-slate-200'
                                }`}>
                                {set.status === 'paid' ? 'Pagado' : 'Calculado'}
                              </span>
                            </td>
                            <td className="px-4 py-2 align-middle text-right">
                              <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => window.open(`/api/v1/hr/settlements/${set.id}/print`)}
                                  className="p-1.5 text-slate-500 hover:text-[#003366] dark:text-slate-400 dark:hover:text-[#799dd6] hover:bg-[#003366]/5 rounded-lg transition-colors"
                                  title="Imprimir Liquidación"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteSettlement(set.id)}
                                  className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Eliminar"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Doble Sueldo Tab */
        <div className="space-y-6">
          <div className="rounded-xl border border-outline bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
              <div>
                <h3 className="text-base font-semibold text-on-surface">
                  Proyección de Salario de Navidad ({dobleYear})
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Bajo el Artículo 219 del Código de Trabajo dominicano, la regalía pascual equivale a la 1/12 parte de los salarios ordinarios del año.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-500">Año:</span>
                <select
                  value={dobleYear}
                  onChange={(e) => setDobleYear(parseInt(e.target.value) || new Date().getFullYear())}
                  className="rounded-md border border-outline bg-surface p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                >
                  {[2025, 2026, 2027, 2028].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Total projection card */}
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-6 dark:bg-emerald-950/10 dark:border-emerald-900/50 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="block text-sm font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                  Total Proyectado de Regalía Pascual ({dobleYear})
                </span>
                <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-1 block">
                  {formatCurrency(totalDobleSum)}
                </span>
              </div>
              <div className="mt-4 sm:mt-0 bg-emerald-600 text-white rounded-lg px-4 py-2.5 text-sm font-semibold flex items-center gap-2">
                <Award className="h-5 w-5" />
                <span>Proyección de Nómina Exenta</span>
              </div>
            </div>

            {/* Doble Sueldo Grid */}
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl shadow-md">
              <table className="w-full text-left">
                <thead className="bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Empleado</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Código</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Fecha de Ingreso</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right whitespace-nowrap">Salario Mensual</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center whitespace-nowrap">Meses Proyectados en {dobleYear}</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right whitespace-nowrap">Salario de Navidad Estimado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dobleCalculations.map((item) => (
                    <tr key={item.id} className="hover:bg-[#C5A059]/5 transition-colors group text-xs text-slate-700 dark:text-slate-200">
                      <td className="px-4 py-2 align-middle font-semibold text-[#003366] dark:text-[#799dd6]">{item.firstName} {item.lastName}</td>
                      <td className="px-4 py-2 align-middle font-mono">{item.employeeCode}</td>
                      <td className="px-4 py-2 align-middle">{new Date(item.hireDate).toLocaleDateString('es-DO')}</td>
                      <td className="px-4 py-2 align-middle text-right font-mono">{formatCurrency(item.salary)}</td>
                      <td className="px-4 py-2 align-middle text-center">{item.monthsWorked} meses</td>
                      <td className="px-4 py-2 align-middle text-right font-bold text-[#003366] dark:text-[#799dd6] font-mono">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
