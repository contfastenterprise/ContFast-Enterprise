'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Banknote, Plus, Calendar, ShieldCheck, RefreshCw, FileText, Trash2, Eye, Printer, X, Award } from 'lucide-react';
import { toast } from 'sonner';

interface Payroll {
  id: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  frequency: string;
  status: string;
  createdAt: string;
}

export default function PayrollPage() {
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail View State
  const [selectedPayroll, setSelectedPayroll] = useState<Payroll | null>(null);
  const [payrollDetailsList, setPayrollDetailsList] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    periodStart: new Date().toISOString().split('T')[0],
    periodEnd: new Date().toISOString().split('T')[0],
    paymentDate: new Date().toISOString().split('T')[0],
    frequency: 'mensual',
  });

  useEffect(() => {
    fetchPayrolls();
  }, []);

  const fetchPayrolls = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/hr/payroll');
      const data = await res.json();
      if (data.success) {
        setPayrolls(data.data);
      }
    } catch (e) {
      toast.error('Error al cargar nóminas');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPayroll = async (payroll: Payroll) => {
    setSelectedPayroll(payroll);
    setLoadingDetails(true);
    try {
      const res = await fetch(`/api/v1/hr/payroll?id=${payroll.id}`);
      const data = await res.json();
      if (data.success) {
        setPayrollDetailsList(data.data.details);
      }
    } catch (e) {
      toast.error('Error al cargar detalles de la nómina');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCreatePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/hr/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Nómina creada y calculada correctamente.');
        setShowCreateModal(false);
        fetchPayrolls();
        // Open details for the newly created payroll
        handleSelectPayroll(data.data);
      } else {
        toast.error(data.error?.message || 'Error al crear la nómina');
      }
    } catch (err) {
      toast.error('Error al enviar la solicitud');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecalculate = async (id: string) => {
    const toastId = toast.loading('Recalculando nómina...');
    try {
      const res = await fetch(`/api/v1/hr/payroll?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recalculate' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Nómina recalculada exitosamente', { id: toastId });
        if (selectedPayroll && selectedPayroll.id === id) {
          handleSelectPayroll(selectedPayroll);
        }
      } else {
        toast.error(data.error?.message || 'Error', { id: toastId });
      }
    } catch (e) {
      toast.error('Error al recalcular', { id: toastId });
    }
  };

  const handleApprove = async (id: string) => {
    if (!confirm('¿Está seguro de aprobar esta nómina? Esto bloqueará los montos y procesará todos los adicionales y descuentos del período.')) return;
    const toastId = toast.loading('Aprobando nómina...');
    try {
      const res = await fetch(`/api/v1/hr/payroll?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Nómina aprobada exitosamente. Se ha registrado en la auditoría.', { id: toastId });
        fetchPayrolls();
        if (selectedPayroll && selectedPayroll.id === id) {
          setSelectedPayroll({ ...selectedPayroll, status: 'approved' });
        }
      } else {
        toast.error(data.error?.message || 'Error', { id: toastId });
      }
    } catch (e) {
      toast.error('Error de red', { id: toastId });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar esta nómina?')) return;
    try {
      const res = await fetch(`/api/v1/hr/payroll?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Nómina eliminada correctamente');
        setSelectedPayroll(null);
        fetchPayrolls();
      } else {
        toast.error(data.error?.message || 'No se puede eliminar la nómina');
      }
    } catch (e) {
      toast.error('Error al conectar con la base de datos');
    }
  };

  return (

    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface flex items-center gap-2">
            <Banknote className="h-6 w-6 text-primary" /> Procesamiento de Nóminas
          </h1>
          <p className="text-sm text-on-surface-variant/80">
            Genera, calcula y aprueba las nóminas de tus colaboradores para la TSS y DGII.
          </p>
        </div>
        {!selectedPayroll && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary hover:bg-primary-variant text-on-primary rounded-xl shadow-md transition-all shrink-0 self-start md:self-auto"
          >
            <Plus className="h-4 w-4" /> Generar Nómina
          </button>
        )}
      </div>

      {/* Back Button if in detail view */}
      {selectedPayroll && (
        <button
          onClick={() => setSelectedPayroll(null)}
          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
        >
          ← Volver al Historial de Nóminas
        </button>
      )}

      {/* List View or Detail View */}
      {!selectedPayroll ? (
        loading ? (
          <div className="flex h-[30vh] items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : payrolls.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-outline rounded-xl bg-surface p-8">
            <Banknote className="mx-auto h-12 w-12 text-on-surface-variant/30" />
            <h3 className="mt-4 text-sm font-semibold text-on-surface">No hay nóminas registradas</h3>
            <p className="mt-1 text-xs text-on-surface-variant/70">Comienza generando un nuevo período de nómina.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-outline bg-surface shadow-sm">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-surface-variant/25 text-xs text-on-surface-variant/80 uppercase border-b border-outline">
                  <th className="p-3">Período</th>
                  <th className="p-3">Fecha de Pago</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Fecha Creación</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {payrolls.map((pr) => (
                  <tr key={pr.id} className="border-b border-outline/40 hover:bg-surface-variant/10 text-on-surface">
                    <td className="p-3 font-medium">
                      Desde {new Date(pr.periodStart).toLocaleDateString('es-DO')} Hasta {new Date(pr.periodEnd).toLocaleDateString('es-DO')}
                    </td>
                    <td className="p-3 font-mono">{new Date(pr.paymentDate).toLocaleDateString('es-DO')}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${pr.status === 'approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/35 dark:text-emerald-300' :
                          pr.status === 'calculated' ? 'bg-[#003366]/10 text-[#003366] dark:bg-[#003366]/30 dark:text-[#a7c8ff]' :
                            'bg-amber-100 text-amber-800 dark:bg-amber-900/35 dark:text-amber-300'
                        }`}>
                        {pr.status === 'approved' ? 'Aprobada' : pr.status === 'calculated' ? 'Calculada' : pr.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs opacity-75">{new Date(pr.createdAt).toLocaleDateString('es-DO')}</td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => handleSelectPayroll(pr)}
                        className="p-1 hover:bg-surface-variant rounded text-on-surface inline-flex items-center gap-1 text-xs font-semibold"
                      >
                        <Eye className="h-4.5 w-4.5" /> Ver
                      </button>
                      {(pr.status === 'draft' || pr.status === 'calculated') && (
                        <button
                          onClick={() => handleDelete(pr.id)}
                          className="p-1 hover:bg-red-500/10 text-red-500 rounded"
                        >
                          <Trash2 className="h-4.5 w-4.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Detail / Volantes View */
        <div className="space-y-4">
          <div className="bg-surface rounded-xl border border-outline p-5 shadow-sm space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-outline pb-3">
              <div>
                <h3 className="font-bold text-on-surface text-base">
                  Nómina Período: {new Date(selectedPayroll.periodStart).toLocaleDateString('es-DO')} - {new Date(selectedPayroll.periodEnd).toLocaleDateString('es-DO')}
                </h3>
                <p className="text-xs text-on-surface-variant/80 mt-0.5">
                  Estado: <span className="font-semibold text-primary">{selectedPayroll.status.toUpperCase()}</span> | Pago: {new Date(selectedPayroll.paymentDate).toLocaleDateString('es-DO')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/api/v1/hr/payroll/${selectedPayroll.id}/receipts`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-surface border border-outline hover:bg-surface-variant text-on-surface rounded-lg transition-all"
                >
                  <Printer className="h-3.5 w-3.5" /> Imprimir Todos los Volantes
                </a>
                {selectedPayroll.status !== 'approved' && (
                  <>
                    <button
                      onClick={() => handleRecalculate(selectedPayroll.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-surface border border-outline hover:bg-surface-variant text-on-surface rounded-lg transition-all"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Recalcular Todo
                    </button>
                    <button
                      onClick={() => handleApprove(selectedPayroll.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary hover:bg-primary-variant text-on-primary rounded-lg transition-all"
                    >
                      <Award className="h-3.5 w-3.5" /> Aprobar Nómina
                    </button>
                  </>
                )}
              </div>
            </div>

            {loadingDetails ? (
              <div className="flex h-[20vh] items-center justify-center">
                <RefreshCw className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-outline/50">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-surface-variant/20 text-on-surface-variant/90 border-b border-outline">
                      <th className="p-2.5">Código</th>
                      <th className="p-2.5">Colaborador</th>
                      <th className="p-2.5 text-right">Salario Base</th>
                      <th className="p-2.5 text-right">H. Extras</th>
                      <th className="p-2.5 text-right">Bonos/Comis.</th>
                      <th className="p-2.5 text-right text-red-500">AFP</th>
                      <th className="p-2.5 text-right text-red-500">SFS</th>
                      <th className="p-2.5 text-right text-red-500">ISR</th>
                      <th className="p-2.5 text-right text-red-500">Otros Desc</th>
                      <th className="p-2.5 text-right font-bold text-primary">Sueldo Neto</th>
                      <th className="p-2.5 text-right">Recibo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollDetailsList.map((d) => (
                      <tr key={d.id} className="border-b border-outline/30 hover:bg-surface-variant/10 text-on-surface">
                        <td className="p-2.5 font-mono">{d.employeeCode}</td>
                        <td className="p-2.5 font-medium">{d.firstName} {d.lastName}</td>
                        <td className="p-2.5 text-right">{parseFloat(d.baseSalary).toLocaleString('es-DO')}</td>
                        <td className="p-2.5 text-right">{parseFloat(d.overtimeAmount) > 0 ? parseFloat(d.overtimeAmount).toLocaleString('es-DO') : '-'}</td>
                        <td className="p-2.5 text-right">{(parseFloat(d.bonusAmount) + parseFloat(d.commissionAmount)) > 0 ? (parseFloat(d.bonusAmount) + parseFloat(d.commissionAmount)).toLocaleString('es-DO') : '-'}</td>
                        <td className="p-2.5 text-right text-red-600 font-mono">{parseFloat(d.afp) > 0 ? parseFloat(d.afp).toLocaleString('es-DO') : '-'}</td>
                        <td className="p-2.5 text-right text-red-600 font-mono">{parseFloat(d.sfs) > 0 ? parseFloat(d.sfs).toLocaleString('es-DO') : '-'}</td>
                        <td className="p-2.5 text-right text-red-600 font-mono">{parseFloat(d.isr) > 0 ? parseFloat(d.isr).toLocaleString('es-DO') : '-'}</td>
                        <td className="p-2.5 text-right text-red-600 font-mono">{parseFloat(d.otherDeductions) > 0 ? parseFloat(d.otherDeductions).toLocaleString('es-DO') : '-'}</td>
                        <td className="p-2.5 text-right font-bold text-primary font-mono">{parseFloat(d.netSalary).toLocaleString('es-DO')}</td>
                        <td className="p-2.5 text-right">
                          <a
                            href={`/api/v1/hr/payroll/${selectedPayroll.id}/receipts?employeeId=${d.employeeId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block p-1 hover:bg-surface-variant rounded text-on-surface"
                          >
                            <FileText className="h-4 w-4" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Payroll Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-outline rounded-xl w-full max-w-md shadow-2xl p-5 relative">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute right-4 top-4 text-on-surface-variant hover:bg-surface-variant p-1 rounded-full transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="font-bold text-on-surface text-base mb-4 flex items-center gap-1.5">
              <Calendar className="h-5 w-5 text-primary" /> Generar Nómina de Período
            </h3>
            <form onSubmit={handleCreatePayroll} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant">Frecuencia de la Nómina</label>
                <select
                  required
                  value={formData.frequency}
                  onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                  className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                >
                  <option value="mensual">Mensual</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="semanal">Semanal</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant">Fecha de Inicio del Período</label>
                <input
                  type="date"
                  required
                  value={formData.periodStart}
                  onChange={e => setFormData({ ...formData, periodStart: e.target.value })}
                  className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant">Fecha de Fin del Período</label>
                <input
                  type="date"
                  required
                  value={formData.periodEnd}
                  onChange={e => setFormData({ ...formData, periodEnd: e.target.value })}
                  className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface-variant">Fecha Estimada de Pago</label>
                <input
                  type="date"
                  required
                  value={formData.paymentDate}
                  onChange={e => setFormData({ ...formData, paymentDate: e.target.value })}
                  className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                />
              </div>
              <div className="flex justify-end gap-3.5 pt-2 border-t border-outline/30">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold border border-outline rounded-lg text-on-surface hover:bg-surface-variant"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold bg-primary hover:bg-primary-variant text-on-primary rounded-lg"
                >
                  {submitting ? 'Generando...' : 'Generar y Calcular'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>

  );
}
