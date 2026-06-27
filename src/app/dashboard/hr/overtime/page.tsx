'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Clock, Coins, Percent, Plus, Trash2, X, RefreshCw, User, Calendar, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// Format currency helper
const formatCurrency = (val: number | string) => {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return 'RD$ ' + (num || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function OvertimeAndEntriesPage() {
  const [activeTab, setActiveTab] = useState<'overtime' | 'income' | 'deduction'>('overtime');
  const [employees, setEmployees] = useState<any[]>([]);
  const [records, setRecords] = useState<{ overtime: any[]; income: any[]; deduction: any[] }>({
    overtime: [],
    income: [],
    deduction: [],
  });
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form States
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [hours, setHours] = useState('');
  const [subType, setSubType] = useState('');
  const [description, setDescription] = useState('');

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
        setEmployees(empData.data.filter((e: any) => e.status === 'active'));
      }

      // Fetch entries
      const entriesRes = await fetch('/api/v1/hr/entries');
      const entriesData = await entriesRes.json();
      if (entriesData.success) {
        setRecords(entriesData.data);
      }
    } catch (error) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    setEmployeeId('');
    setDate(new Date().toISOString().split('T')[0]);
    setAmount('');
    setHours('');
    setDescription('');
    // Set default subtypes
    if (activeTab === 'overtime') setSubType('diurna');
    else if (activeTab === 'income') setSubType('comision');
    else if (activeTab === 'deduction') setSubType('prestamo');

    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) {
      toast.error('Debe seleccionar un empleado');
      return;
    }

    try {
      setSubmitting(true);
      let payloadData: any = {
        employeeId,
      };

      if (activeTab === 'overtime') {
        payloadData = {
          ...payloadData,
          dateWorked: date,
          hours: parseFloat(hours),
          type: subType,
        };
      } else if (activeTab === 'income') {
        payloadData = {
          ...payloadData,
          date,
          amount: parseFloat(amount),
          type: subType,
          description,
        };
      } else {
        payloadData = {
          ...payloadData,
          date,
          amount: parseFloat(amount),
          type: subType,
          description,
        };
      }

      const res = await fetch('/api/v1/hr/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryType: activeTab,
          data: payloadData,
        }),
      });

      const resData = await res.json();
      if (resData.success) {
        toast.success('Registro agregado exitosamente');
        setShowModal(false);
        fetchData();
      } else {
        toast.error(resData.error?.message || 'Error al guardar el registro');
      }
    } catch (err) {
      toast.error('Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este registro?')) return;
    try {
      const res = await fetch(`/api/v1/hr/entries?id=${id}&entryType=${activeTab}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Registro eliminado');
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al eliminar');
      }
    } catch (err) {
      toast.error('Error de red');
    }
  };

  const getActiveList = () => {
    if (activeTab === 'overtime') return records.overtime;
    if (activeTab === 'income') return records.income;
    return records.deduction;
  };

  const activeList = getActiveList();

  // Summary Metrics
  const totalPendingOvertimeCost = records.overtime
    .filter(r => r.status === 'pending')
    .reduce((sum, r) => sum + parseFloat(r.amount), 0);

  const totalPendingIncome = records.income
    .filter(r => r.status === 'pending')
    .reduce((sum, r) => sum + parseFloat(r.amount), 0);

  const totalPendingDeductions = records.deduction
    .filter(r => r.status === 'pending')
    .reduce((sum, r) => sum + parseFloat(r.amount), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Ingresos, Deducciones y Horas Extras
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Gestione las horas extras, bonificaciones y deducciones que se aplicarán en la próxima nómina.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="inline-flex items-center justify-center rounded-md border border-outline bg-surface p-2 text-sm font-medium text-on-surface shadow-sm hover:bg-surface-variant transition-all"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={handleOpenModal}
            className="inline-flex items-center justify-center rounded-md bg-[#003366] px-4 py-2 text-sm font-medium text-white shadow hover:bg-[#001e40] focus:outline-none focus:ring-2 focus:ring-[#003366] focus:ring-offset-2"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Registro
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-outline bg-surface p-6 shadow-sm text-on-surface">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-on-surface-variant/80">Horas Extras Pendientes</span>
            <Clock className="h-5 w-5 text-amber-500" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold tracking-tight text-on-surface">
              {formatCurrency(totalPendingOvertimeCost)}
            </span>
            <p className="text-xs text-on-surface-variant/60 mt-1">
              {records.overtime.filter(r => r.status === 'pending').length} registros listos para procesar
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-outline bg-surface p-6 shadow-sm text-on-surface">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-on-surface-variant/80">Ingresos Adicionales Pendientes</span>
            <Coins className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold tracking-tight text-on-surface">
              {formatCurrency(totalPendingIncome)}
            </span>
            <p className="text-xs text-on-surface-variant/60 mt-1">
              Comisiones, incentivos y bonos a pagar
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-outline bg-surface p-6 shadow-sm text-on-surface">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-on-surface-variant/80">Deducciones Adicionales Pendientes</span>
            <Percent className="h-5 w-5 text-rose-500" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold tracking-tight text-on-surface">
              {formatCurrency(totalPendingDeductions)}
            </span>
            <p className="text-xs text-on-surface-variant/60 mt-1">
              Préstamos y descuentos extraordinarios
            </p>
          </div>
        </div>
      </div>

      {/* Tab Buttons */}
      <div className="border-b border-outline/30">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {(['overtime', 'income', 'deduction'] as const).map((tab) => {
            const label =
              tab === 'overtime'
                ? 'Horas Extras'
                : tab === 'income'
                  ? 'Ingresos Adicionales'
                  : 'Deducciones';
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`border-b-2 py-4 px-1 text-sm font-medium whitespace-nowrap ${active
                    ? 'border-[#003366] text-[#003366] dark:border-[#799dd6] dark:text-[#799dd6]'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                  }`}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Table & Content */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-[#003366] dark:text-[#799dd6]" />
        </div>
      ) : activeList.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline bg-surface py-16 text-on-surface">
          <AlertCircle className="h-10 w-10 text-on-surface-variant/40" />
          <h3 className="mt-2 text-sm font-semibold">No hay registros</h3>
          <p className="mt-1 text-sm text-on-surface-variant/70">
            Comience agregando un nuevo registro para este periodo.
          </p>
          <button
            onClick={handleOpenModal}
            className="mt-4 inline-flex items-center rounded-md bg-[#003366] px-3 py-2 text-sm font-semibold text-white shadow hover:bg-[#001e40] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#003366]"
          >
            <Plus className="-ml-0.5 mr-1.5 h-4 w-4" />
            Agregar Registro
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm text-on-surface">
              <thead>
                <tr className="border-b border-outline bg-surface-variant/20 text-on-surface-variant font-semibold">
                  <th className="p-4">Empleado</th>
                  <th className="p-4">Código</th>
                  <th className="p-4">Tipo</th>
                  <th className="p-4">Fecha</th>
                  {activeTab === 'overtime' ? (
                    <>
                      <th className="p-4">Horas</th>
                      <th className="p-4">Costo Estimado</th>
                    </>
                  ) : (
                    <>
                      <th className="p-4">Descripción</th>
                      <th className="p-4">Monto</th>
                    </>
                  )}
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {activeList.map((record) => {
                  const empName = `${record.firstName} ${record.lastName}`;
                  const formattedDate = new Date(record.dateWorked || record.date).toLocaleDateString('es-DO');

                  // Style for status badge
                  const statusClass =
                    record.status === 'pending'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                      : record.status === 'processed'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400';

                  return (
                    <tr key={record.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 text-slate-800 dark:text-slate-200">
                      <td className="p-4 font-medium">{empName}</td>
                      <td className="p-4">{record.employeeCode}</td>
                      <td className="p-4 capitalize">{record.type}</td>
                      <td className="p-4">{formattedDate}</td>
                      {activeTab === 'overtime' ? (
                        <>
                          <td className="p-4">{Number(record.hours).toFixed(2)} hrs</td>
                          <td className="p-4 font-semibold">{formatCurrency(record.amount)}</td>
                        </>
                      ) : (
                        <>
                          <td className="p-4 max-w-xs truncate">{record.description || 'Sin descripción'}</td>
                          <td className="p-4 font-semibold">{formatCurrency(record.amount)}</td>
                        </>
                      )}
                      <td className="p-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}>
                          {record.status === 'pending' ? 'Pendiente' : record.status === 'processed' ? 'Procesado' : 'Cancelado'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {record.status === 'pending' ? (
                          <button
                            onClick={() => handleDelete(record.id)}
                            className="inline-flex items-center justify-center text-rose-600 hover:text-rose-900 dark:hover:text-rose-400 p-1 rounded hover:bg-rose-55 dark:hover:bg-rose-950/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Inmutable</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal Dialog */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-xl border border-outline bg-surface p-6 shadow-lg text-on-surface">
            {/* Close Button */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 dark:text-slate-400"
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Agregar{' '}
              {activeTab === 'overtime'
                ? 'Horas Extras'
                : activeTab === 'income'
                  ? 'Ingreso Adicional'
                  : 'Deducción'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Llene el formulario para registrar una entrada para el periodo actual.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Employee select */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Empleado
                </label>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  required
                  className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                >
                  <option value="">Seleccione un empleado...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeCode}) - {formatCurrency(emp.salary)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subtype select */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Tipo de {activeTab === 'overtime' ? 'Hora Extra' : activeTab === 'income' ? 'Ingreso' : 'Deducción'}
                </label>
                <select
                  value={subType}
                  onChange={(e) => setSubType(e.target.value)}
                  required
                  className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                >
                  {activeTab === 'overtime' ? (
                    <>
                      <option value="diurna">Diurna (35% recargo)</option>
                      <option value="nocturna">Nocturna (85% recargo / ordinaria nocturna)</option>
                      <option value="festiva">Día de Descanso / Feriado (100% recargo)</option>
                      <option value="doble">Doble (100% recargo especial)</option>
                    </>
                  ) : activeTab === 'income' ? (
                    <>
                      <option value="comision">Comisión</option>
                      <option value="productividad">Productividad</option>
                      <option value="incentivo">Incentivo</option>
                      <option value="transporte">Transporte</option>
                      <option value="combustible">Combustible</option>
                      <option value="otro">Otro</option>
                    </>
                  ) : (
                    <>
                      <option value="prestamo">Préstamo</option>
                      <option value="cooperativa">Cooperativa</option>
                      <option value="seguro">Seguro</option>
                      <option value="embargo">Embargo</option>
                      <option value="otro">Otro</option>
                    </>
                  )}
                </select>
              </div>

              {/* Grid for hours/amount and date */}
              <div className="grid grid-cols-2 gap-4">
                {activeTab === 'overtime' ? (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Horas Trabajadas
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      required
                      placeholder="Ej. 5.5"
                      className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Monto (RD$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                      placeholder="Ej. 1500"
                      className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                  />
                </div>
              </div>

              {/* Description (only for income & deduction) */}
              {activeTab !== 'overtime' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Descripción / Nota
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Escriba un detalle..."
                    rows={2}
                    className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="inline-flex items-center justify-center rounded-md border border-outline bg-surface px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-variant transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-md bg-[#003366] px-4 py-2 text-sm font-medium text-white shadow hover:bg-[#001e40] disabled:opacity-50"
                >
                  {submitting ? 'Guardando...' : 'Guardar Registro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>

  );
}
