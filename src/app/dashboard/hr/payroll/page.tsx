'use client';

import { useState, useEffect } from 'react';
import { Banknote, Plus, Calendar, ShieldCheck, RefreshCw, FileText, Trash2, Eye, Printer, Award } from 'lucide-react';
import { Modal } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useConfirm } from '@/providers/confirm-provider';
import { formatDateDisplay } from '@/utils/fechasLocales';
import { Pagination } from '@/components/ui/pagination';

import { Button, IconButton } from '@/components/ui/button';
import { CabeceraDePagina } from '@/components/ui/cabecera-de-pagina';
// Lote 290: la pantalla ofrece lo que la API admitiria, con la misma regla.
import { accionesDeNomina } from '@/services/nomina/estadoDeNomina';
import { AsientoDeLaNomina, type AsientoParaVer } from './components/AsientoDeLaNomina';
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
  const confirm = useConfirm();
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Detail View State
  const [selectedPayroll, setSelectedPayroll] = useState<Payroll | null>(null);
  const [payrollDetailsList, setPayrollDetailsList] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  // Lote 290: aviso cuando el ISR se calcula con la escala de otro año.
  const [avisoIsr, setAvisoIsr] = useState<string | null>(null);
  // Lote 293: el asiento que registro la aprobacion, y el motivo si se nego.
  const [asiento, setAsiento] = useState<AsientoParaVer | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState<string | null>(null);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const itemsPerPage = 15;
  const totalPages = Math.ceil(payrolls.length / itemsPerPage);
  const pagedPayrolls = payrolls.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const [formData, setFormData] = useState({
    periodStart: new Date().toISOString().split('T')[0],
    periodEnd: new Date().toISOString().split('T')[0],
    paymentDate: new Date().toISOString().split('T')[0],
    frequency: 'mensual',
  });

  useEffect(() => {
    setPage(1);
    fetchPayrolls();
  }, []);

  async function fetchPayrolls() {
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
    setAvisoIsr(null);
    setAsiento(null);
    setMotivoRechazo(null);
    setLoadingDetails(true);
    try {
      const res = await fetch(`/api/v1/hr/payroll?id=${payroll.id}`);
      const data = await res.json();
      if (data.success) {
        setPayrollDetailsList(data.data.details);
        // Lote 290: el estado de la base, no el de la lista (tras crear, la lista
        // traia 'draft' y no se ofrecia aprobar).
        if (data.data.payroll) setSelectedPayroll(data.data.payroll);
        setAvisoIsr(data.data.avisoIsr ?? null);
        setAsiento(data.data.asiento ?? null);
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
        if (data.aviso) toast.warning(data.aviso, { duration: 10000 });
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
        if (data.aviso) toast.warning(data.aviso, { duration: 10000 });
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
    await confirm({
      title: 'Confirmar aprobación',
      description: '¿Está seguro de aprobar esta nómina? Esto bloqueará los montos y procesará todos los adicionales y descuentos del período.',
      action: async () => {
        const res = await fetch(`/api/v1/hr/payroll?id=${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve' }),
        });
        const data = await res.json();
        if (!data.success) {
          // Lote 290: el motivo del 409 (sin detalle, ya aprobada) se dice;
          // la confirmacion solo enseña su mensaje fijo.
          if (data.error?.message) toast.error(data.error.message);
          // Lote 293: y se queda a la vista (cuenta sin enlazar, periodo cerrado).
          setMotivoRechazo(data.error?.message || 'Error al aprobar la nómina.');
          throw new Error(data.error?.message || 'Error');
        }
        fetchPayrolls();
        // Lote 293: se relee para enseñar el estado y el asiento registrado.
        if (selectedPayroll && selectedPayroll.id === id) handleSelectPayroll(selectedPayroll);
      },
      onSuccessMessage: 'Nómina aprobada y asentada en el libro diario.',
      onErrorMessage: 'Error al aprobar la nómina.',
    });
  };

  const handleDelete = async (id: string) => {
    await confirm({
      title: 'Confirmar eliminación',
      description: '¿Está seguro de eliminar esta nómina? Esta acción no se puede deshacer.',
      action: async () => {
        const res = await fetch(`/api/v1/hr/payroll?id=${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error?.message || 'No se puede eliminar la nómina');
        }
        setSelectedPayroll(null);
        fetchPayrolls();
      },
      onSuccessMessage: 'Nómina eliminada correctamente.',
      onErrorMessage: 'No fue posible eliminar la nómina.',
    });
  };

  return (

    <div className="space-y-6">
      {/* Header */}
      <CabeceraDePagina
        titulo="Procesamiento de Nóminas"
        descripcion="Genera, calcula y aprueba las nóminas de tus colaboradores para la TSS y DGII."
        icono={<Banknote />}
        acciones={!selectedPayroll && (
          <Button
            type="button"
            className="shrink-0 self-start md:self-auto"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="h-4 w-4" /> Generar Nómina
          </Button>
        )}
      />

      {/* Back Button if in detail view */}
      {selectedPayroll && (
        <Button
          type="button"
          variant="link"
          className="h-auto px-0 text-xs"
          onClick={() => setSelectedPayroll(null)}
        >
          ← Volver al Historial de Nóminas
        </Button>
      )}

      {/* List View or Detail View */}
      {!selectedPayroll ? (
        loading ? (
          <div className="flex h-[30vh] items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-[#003366]" />
          </div>
        ) : payrolls.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-300 rounded-xl bg-white p-8">
            <Banknote className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-4 text-sm font-semibold text-slate-800">No hay nóminas registradas</h3>
            <p className="mt-1 text-xs text-slate-500">Comienza generando un nuevo período de nómina.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <>
              {/* Mobile View */}
              <div className="md:hidden flex flex-col divide-y divide-slate-100 bg-white">
                {pagedPayrolls.map((pr) => (
                  <div key={pr.id} className="flex flex-col p-4 hover:bg-slate-50 transition-colors gap-3">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs text-slate-800">
                          Desde {formatDateDisplay(pr.periodStart)}
                        </span>
                        <span className="font-semibold text-xs text-slate-800">
                          Hasta {formatDateDisplay(pr.periodEnd)}
                        </span>
                      </div>
                      <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase ${pr.status === 'approved' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : pr.status === 'calculated' 
                          ? 'bg-blue-50 text-[#003366] border border-blue-200' 
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                        {pr.status === 'approved' ? 'Aprobada' : pr.status === 'calculated' ? 'Calculada' : pr.status}
                      </span>
                    </div>
                    
                    <div className="flex flex-col gap-1 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Fecha de Pago:</span>
                        <span className="font-mono font-bold text-[#003366]">{formatDateDisplay(pr.paymentDate)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Creación:</span>
                        <span className="text-slate-500">{formatDateDisplay(pr.createdAt)}</span>
                      </div>
                    </div>
                    
                    <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="bg-slate-100 hover:text-[#003366] hover:bg-[#003366]/10"
                        onClick={() => handleSelectPayroll(pr)}
                        title="Ver Volantes"
                      >
                        <Eye className="h-4 w-4" /> Ver
                      </Button>
                      {accionesDeNomina(pr.status, 0).eliminar && (
                        <IconButton
                          type="button"
                          aria-label="Eliminar nómina"
                          className="bg-slate-100 hover:text-rose-600 hover:bg-rose-50"
                          onClick={() => handleDelete(pr.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/80 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Período</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Fecha de Pago</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Estado</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Fecha Creación</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedPayrolls.map((pr) => (
                      <tr key={pr.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-4 py-2.5 align-middle text-xs font-semibold text-slate-700">
                          Desde {formatDateDisplay(pr.periodStart)} Hasta {formatDateDisplay(pr.periodEnd)}
                        </td>
                        <td className="px-4 py-2.5 align-middle text-xs font-mono font-bold text-[#003366]">{formatDateDisplay(pr.paymentDate)}</td>
                        <td className="px-4 py-2.5 align-middle text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${pr.status === 'approved' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : pr.status === 'calculated' 
                              ? 'bg-blue-50 text-[#003366] border border-blue-200' 
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                            {pr.status === 'approved' ? 'Aprobada' : pr.status === 'calculated' ? 'Calculada' : pr.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 align-middle text-xs text-slate-500">{formatDateDisplay(pr.createdAt)}</td>
                        <td className="px-4 py-2.5 align-middle text-right">
                          <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="hover:text-[#003366] hover:bg-[#003366]/10"
                              onClick={() => handleSelectPayroll(pr)}
                              title="Ver Volantes"
                            >
                              <Eye className="h-3.5 w-3.5" /> Ver
                            </Button>
                            {accionesDeNomina(pr.status, 0).eliminar && (
                              <IconButton
                                type="button"
                                aria-label="Eliminar nómina"
                                className="hover:text-rose-600 hover:bg-rose-50"
                                onClick={() => handleDelete(pr.id)}
                                title="Eliminar"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </IconButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginacion: el componente comun (P3-45, lote 128) */}
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={payrolls.length}
                pageSize={itemsPerPage}
                onPageChange={setPage}
                itemLabel="nóminas"
                hideControlsWhenSinglePage
              />
            </>
          </div>
        )
      ) : (
        /* Detail / Volantes View */
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-800 text-base">
                  Nómina Período: {formatDateDisplay(selectedPayroll.periodStart)} - {formatDateDisplay(selectedPayroll.periodEnd)}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Estado: <span className="font-semibold text-[#003366]">{selectedPayroll.status.toUpperCase()}</span> | Pago: {formatDateDisplay(selectedPayroll.paymentDate)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="documento"><a
                  href={`/api/v1/hr/payroll/${selectedPayroll.id}/receipts`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Printer className="h-4 w-4" /> Imprimir Todos los Volantes
                </a></Button>
                {accionesDeNomina(selectedPayroll.status, payrollDetailsList.length).recalcular && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => handleRecalculate(selectedPayroll.id)}
                  >
                    <RefreshCw className="h-4 w-4" /> Recalcular Todo
                  </Button>
                )}
                {!loadingDetails && accionesDeNomina(selectedPayroll.status, payrollDetailsList.length).aprobar && (
                  <Button
                    type="button"
                    onClick={() => handleApprove(selectedPayroll.id)}
                  >
                    <Award className="h-4 w-4" /> Aprobar Nómina
                  </Button>
                )}
              </div>
            </div>

            {avisoIsr && (
              <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                {avisoIsr}
              </p>
            )}

            {!loadingDetails && (
              <AsientoDeLaNomina status={selectedPayroll.status} asiento={asiento} motivoRechazo={motivoRechazo} />
            )}

            {loadingDetails ? (
              <div className="flex h-[20vh] items-center justify-center">
                <RefreshCw className="h-7 w-7 animate-spin text-[#003366]" />
              </div>
            ) : (
              <>
                {/* Mobile View */}
                <div className="md:hidden flex flex-col divide-y divide-slate-100 bg-white border border-slate-200 rounded-lg">
                  {payrollDetailsList.map((d) => (
                    <div key={d.id} className="flex flex-col p-4 hover:bg-slate-50 transition-colors gap-3">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                          <span className="font-semibold text-sm text-slate-800">{d.firstName} {d.lastName}</span>
                          <span className="font-mono font-bold text-xs text-[#003366]">{d.employeeCode}</span>
                        </div>
                        <a
                          href={`/api/v1/hr/payroll/${selectedPayroll.id}/receipts?employeeId=${d.employeeId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 p-1.5 rounded-lg bg-[#003366]/10 text-[#003366] font-semibold text-[10px] uppercase"
                        >
                          <FileText className="h-3 w-3" /> Volante
                        </a>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase">Salario Base</span>
                          <span className="font-medium text-slate-700">{parseFloat(d.baseSalary).toLocaleString('es-DO')}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase">H. Ext / Bonos</span>
                          <span className="font-medium text-slate-700">
                            {(parseFloat(d.overtimeAmount) + parseFloat(d.bonusAmount) + parseFloat(d.commissionAmount)) > 0 
                              ? (parseFloat(d.overtimeAmount) + parseFloat(d.bonusAmount) + parseFloat(d.commissionAmount)).toLocaleString('es-DO') 
                              : '-'}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-red-400 font-semibold uppercase">Deducciones (TSS/ISR)</span>
                          <span className="font-mono text-red-600">
                            {(parseFloat(d.afp) + parseFloat(d.sfs) + parseFloat(d.isr) + parseFloat(d.otherDeductions)).toLocaleString('es-DO')}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-[#003366] font-bold uppercase">Sueldo Neto</span>
                          <span className="font-mono font-bold text-[#003366] text-sm">{parseFloat(d.netSalary).toLocaleString('es-DO')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop View */}
                <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-200">
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Código</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Colaborador</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Salario Base</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">H. Extras</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Bonos/Comis.</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right text-red-500">AFP</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right text-red-500">SFS</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right text-red-500">ISR</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right text-red-500">Otros Desc</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right font-bold text-[#003366]">Sueldo Neto</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Recibo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollDetailsList.map((d) => (
                        <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50 text-slate-800">
                          <td className="px-4 py-2.5 font-mono">{d.employeeCode}</td>
                          <td className="px-4 py-2.5 font-medium">{d.firstName} {d.lastName}</td>
                          <td className="px-4 py-2.5 text-right">{parseFloat(d.baseSalary).toLocaleString('es-DO')}</td>
                          <td className="px-4 py-2.5 text-right">{parseFloat(d.overtimeAmount) > 0 ? parseFloat(d.overtimeAmount).toLocaleString('es-DO') : '-'}</td>
                          <td className="px-4 py-2.5 text-right">{(parseFloat(d.bonusAmount) + parseFloat(d.commissionAmount)) > 0 ? (parseFloat(d.bonusAmount) + parseFloat(d.commissionAmount)).toLocaleString('es-DO') : '-'}</td>
                          <td className="px-4 py-2.5 text-right text-red-600 font-mono">{parseFloat(d.afp) > 0 ? parseFloat(d.afp).toLocaleString('es-DO') : '-'}</td>
                          <td className="px-4 py-2.5 text-right text-red-600 font-mono">{parseFloat(d.sfs) > 0 ? parseFloat(d.sfs).toLocaleString('es-DO') : '-'}</td>
                          <td className="px-4 py-2.5 text-right text-red-600 font-mono">{parseFloat(d.isr) > 0 ? parseFloat(d.isr).toLocaleString('es-DO') : '-'}</td>
                          <td className="px-4 py-2.5 text-right text-red-600 font-mono">{parseFloat(d.otherDeductions) > 0 ? parseFloat(d.otherDeductions).toLocaleString('es-DO') : '-'}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-[#003366] font-mono">{parseFloat(d.netSalary).toLocaleString('es-DO')}</td>
                          <td className="px-4 py-2.5 text-right">
                            <a
                              href={`/api/v1/hr/payroll/${selectedPayroll.id}/receipts?employeeId=${d.employeeId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block p-1 hover:bg-slate-100 rounded text-slate-500"
                            >
                              <FileText className="h-4 w-4" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Create Payroll Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Generar Nómina de Período"
        icono={<Calendar />}
        maxWidth="md"
        cerrarAlPulsarFuera={false}
        bloqueada={submitting}
      >
            <form onSubmit={handleCreatePayroll} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Frecuencia de la Nómina</label>
                <select
                  required
                  value={formData.frequency}
                  onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                  className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-800"
                >
                  <option value="mensual">Mensual</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="semanal">Semanal</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha de Inicio del Período</label>
                <input
                  type="date"
                  required
                  value={formData.periodStart}
                  onChange={e => setFormData({ ...formData, periodStart: e.target.value })}
                  className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha de Fin del Período</label>
                <input
                  type="date"
                  required
                  value={formData.periodEnd}
                  onChange={e => setFormData({ ...formData, periodEnd: e.target.value })}
                  className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Estimada de Pago</label>
                <input
                  type="date"
                  required
                  value={formData.paymentDate}
                  onChange={e => setFormData({ ...formData, paymentDate: e.target.value })}
                  className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-800"
                />
              </div>
              <div className="flex justify-end gap-3.5 pt-2 border-t border-slate-200/60 mt-4">
                <Button variant="secondary"
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex">
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex">
                  {submitting ? 'Generando...' : 'Generar y Calcular'}
                </Button>
              </div>
            </form>
      </Modal>
    </div>

  );
}
