'use client';

import { useState, useEffect, useCallback } from 'react';
import { Clock, Coins, Percent, Plus, Trash2, RefreshCw, User, Calendar, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorDeCarga, motivoDeCarga } from '@/components/ui/estado-carga';
import { useConfirm } from '@/providers/confirm-provider';
import { formatDateDisplay } from '@/utils/fechasLocales';
import { leerRespuesta } from '@/utils/leerRespuesta';
import { PestanasDeRegistro, PanelDeRegistro } from '@/components/ui/pestanas-de-registro';

// Format currency helper
const formatCurrency = (val: number | string) => {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return 'RD$ ' + (num || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// `records` NO es una lista: son tres, una por pestaña. Vaciarlo con `[]`
// compila mal y ademas romperia `getActiveList`, que lee una de las tres.
// Fuera del componente (lote 252): no depende de nada suyo.
const SIN_REGISTROS = { overtime: [], income: [], deduction: [] };

type FormularioDeNovedad = { employeeId: string; date: string; amount: string; hours: string; subType: string; description: string };
const formularioVacio = (subType = ''): FormularioDeNovedad =>
  ({ employeeId: '', date: new Date().toISOString().split('T')[0], amount: '', hours: '', subType, description: '' });

export default function OvertimeAndEntriesPage() {
  const h = useNovedades();
  const { activeTab, setActiveTab, showModal, setShowModal, fetchData, handleOpenModal } = h;

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
        {/* Lote 249: en la cabecera, SOLO las pestanas (como en Compras). Recargar baja a la fila de
            las pestanas de contenido; lo que se registra es del tipo de la pestana de contenido elegida. */}
        <PestanasDeRegistro
          enFormulario={showModal}
          lista="Novedades"
          alVerLista={() => setShowModal(false)}
          alRegistrar={handleOpenModal}
        />
      </div>

      {!showModal && (<>

      <TarjetasDeNovedades h={h} />
      {/* Tab Buttons */}
      <div className="border-b border-outline/30 flex items-end justify-between gap-3">
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
        <button
          type="button"
          onClick={fetchData}
          title="Recargar"
          aria-label="Recargar"
          className="mb-2 inline-flex items-center justify-center rounded-md border border-outline bg-surface p-2 text-sm font-medium text-on-surface shadow-sm hover:bg-surface-variant transition"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <TablaDeNovedades h={h} />
      </>)}

      <FormularioDeNovedad h={h} />
    </div>

  );
}

/** El estado y las acciones de la pagina, movidos TAL CUAL desde el componente. */
function useNovedades() {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<'overtime' | 'income' | 'deduction'>('overtime');
  const [employees, setEmployees] = useState<any[]>([]);
  const [records, setRecords] = useState<{ overtime: any[]; income: any[]; deduction: any[] }>({
    overtime: [],
    income: [],
    deduction: [],
  });
  const [loading, setLoading] = useState(true);
  // P2-37: el fallo de carga NO se limpia solo. Mientras este puesto, la lista
  // enseña el error en vez de su mensaje de vacio.
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form States -- un solo objeto (lote 252: se llenaban seis por separado al abrir), con la
  // fecha de hoy calculada una vez al montar y no en cada pintada. Los nombres de siempre se
  // conservan para que el formulario no cambie.
  const [form, setForm] = useState<FormularioDeNovedad>(() => formularioVacio());
  const { employeeId, date, amount, hours, subType, description } = form;
  const cambiar = (clave: keyof FormularioDeNovedad) => (valor: string) => setForm((f) => ({ ...f, [clave]: valor }));
  const setEmployeeId = cambiar('employeeId');
  const setDate = cambiar('date');
  const setAmount = cambiar('amount');
  const setHours = cambiar('hours');
  const setSubType = cambiar('subType');
  const setDescription = cambiar('description');

  //  Lote 252: una funcion estable que mira el ESTADO antes de leer el cuerpo; las dos lecturas a
  //  la vez. El efecto solo la llama.
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorCarga(null);
      const [empRes, entriesRes] = await Promise.all([fetch('/api/v1/hr/employees'), fetch('/api/v1/hr/entries')]);
      const empleados = await leerRespuesta<{ data: any[] }>(empRes);
      if (empleados.bien) {
        setEmployees(empleados.cuerpo.data.filter((e: any) => e.status === 'active'));
      }

      const novedades = await leerRespuesta<{ data: { overtime: any[]; income: any[]; deduction: any[] } }>(entriesRes);
      if (novedades.bien) {
        setRecords(novedades.cuerpo.data);
      } else {
        setRecords(SIN_REGISTROS);
        setErrorCarga(motivoDeCarga(null, novedades.mensaje));
      }
    } catch (error) {
      // Mismo caso que empleados: el vacio invita a "comenzar agregando un
      // nuevo registro", asi que un fallo se leia como un periodo sin horas.
      setRecords(SIN_REGISTROS);
      setErrorCarga(motivoDeCarga(error));
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenModal = () => {
    // El subtipo por defecto es el de la pestana de contenido elegida.
    setForm(formularioVacio(activeTab === 'overtime' ? 'diurna' : activeTab === 'income' ? 'comision' : 'prestamo'));
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

      const leido = await leerRespuesta(res);
      if (leido.bien) {
        toast.success('Registro agregado exitosamente');
        setShowModal(false);
        fetchData();
      } else {
        toast.error(leido.mensaje || 'Error al guardar el registro');
      }
    } catch (err) {
      toast.error('Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await confirm({
      title: 'Confirmar eliminación',
      description: '¿Está seguro de eliminar este registro? Esta acción no se puede deshacer.',
      action: async () => {
        const res = await fetch(`/api/v1/hr/entries?id=${id}&entryType=${activeTab}`, {
          method: 'DELETE',
        });
        const leido = await leerRespuesta(res);
        if (!leido.bien) {
          throw new Error(leido.mensaje || 'Error al eliminar');
        }
        fetchData();
      },
      onSuccessMessage: 'Registro eliminado correctamente.',
      onErrorMessage: 'No fue posible eliminar el registro.',
    });
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

  return { confirm, activeTab, setActiveTab, employees, setEmployees, records, setRecords, loading, setLoading, errorCarga, setErrorCarga, showModal, setShowModal, submitting, setSubmitting, form, setForm, employeeId, date, amount, hours, subType, description, cambiar, setEmployeeId, setDate, setAmount, setHours, setSubType, setDescription, fetchData, handleOpenModal, handleSubmit, handleDelete, getActiveList, activeList, totalPendingOvertimeCost, totalPendingIncome, totalPendingDeductions };
}

type EstadoOvertimeAndEntriesPage = ReturnType<typeof useNovedades>;

function TarjetasDeNovedades({ h }: { h: EstadoOvertimeAndEntriesPage }) {
  const { records, totalPendingOvertimeCost, totalPendingIncome, totalPendingDeductions } = h;
  return (
    <>
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
    </>
  );
}

function TablaDeNovedades({ h }: { h: EstadoOvertimeAndEntriesPage }) {
  const { activeTab, loading, errorCarga, fetchData, handleOpenModal, handleDelete, activeList } = h;
  return (
    <>
      {/* Table & Content */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-[#003366] dark:text-[#799dd6]" />
        </div>
      ) : errorCarga ? (
        <ErrorDeCarga mensaje={errorCarga} onReintentar={fetchData} />
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
                  const formattedDate = formatDateDisplay(record.dateWorked || record.date);

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
                            type="button"
                            onClick={() => handleDelete(record.id)}
                            title="Eliminar"
                            aria-label="Eliminar registro"
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
    </>
  );
}

function FormularioDeNovedad({ h }: { h: EstadoOvertimeAndEntriesPage }) {
  const { activeTab, employees, showModal, setShowModal, submitting, form, employeeId, date, amount, hours, subType, description, setEmployeeId, setDate, setAmount, setHours, setSubType, setDescription, handleSubmit } = h;
  return (
    <>
      {/* Registrar: era un modal; desde el lote 249 es la segunda pestana. El tipo es el de la
          pestana de contenido que estaba elegida, y el titulo lo dice. */}
      {showModal && (
        <PanelDeRegistro titulo={`Agregar ${activeTab === 'overtime' ? 'Horas Extras' : activeTab === 'income' ? 'Ingreso Adicional' : 'Deducción'}`}>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Llene el formulario para registrar una entrada para el periodo actual.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
            {/* Employee select */}
            <div>
              <label htmlFor="nov-1" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Empleado
              </label>
              <select id="nov-1"
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
              <label htmlFor="nov-2" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Tipo de {activeTab === 'overtime' ? 'Hora Extra' : activeTab === 'income' ? 'Ingreso' : 'Deducción'}
              </label>
              <select id="nov-2"
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
                  <label htmlFor="nov-3" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Horas Trabajadas
                  </label>
                  <input id="nov-3"
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
                  <label htmlFor="nov-4" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Monto (RD$)
                  </label>
                  <input id="nov-4"
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
                <label htmlFor="nov-5" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Fecha
                </label>
                <input id="nov-5"
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
                <label htmlFor="nov-6" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Descripción / Nota
                </label>
                <textarea id="nov-6"
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
                className="inline-flex items-center justify-center rounded-md border border-outline bg-surface px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-variant transition"
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
        </PanelDeRegistro>
      )}
    </>
  );
}
