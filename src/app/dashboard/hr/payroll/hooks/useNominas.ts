'use client';

/**
 * Lote 294: el estado y las acciones de la pantalla de nomina, movidos TAL CUAL desde
 * `page.tsx` (lineas 27-195 de 42730af). Lo que antes era una variable del componente es
 * ahora un campo del hook, con el mismo nombre; las piezas de `components/` lo reciben como
 * `h` y sacan de el lo que pintan.
 *
 * Las llamadas que se encadenan (aprobar recarga la lista y relee el detalle; crear recarga
 * la lista y abre la nomina nueva; recalcular relee el detalle; eliminar vuelve a la lista)
 * siguen DENTRO de este hook, una al lado de la otra, como estaban: por eso no hay un
 * segundo hook al que tengan que cruzar. Las vigila `scratch/verificar_partir_nomina.ts`.
 */
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/providers/confirm-provider';
import type { AsientoParaVer } from '../components/AsientoDeLaNomina';
import type { PagoParaVer } from '../components/PagoDeLaNomina';
import { leerRespuesta } from '@/utils/leerRespuesta';

export interface Payroll {
  id: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  frequency: string;
  status: string;
  createdAt: string;
}

export function useNominas() {
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
  // Lote 295: el pago de una nomina pagada (fecha, origen y su asiento).
  const [pago, setPago] = useState<PagoParaVer | null>(null);

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
    setPago(null);
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
        // Lote 295: una nomina pagada enseña su pago. Se pide aparte (su ruta mira si existe
        // la tabla 0021); si no se puede leer, el detalle sale igual y dice que no consta.
        const estado = data.data.payroll?.status ?? payroll.status;
        if (estado === 'paid') {
          const leido = await leerRespuesta<{ data: { pago: PagoParaVer | null } }>(await fetch(`/api/v1/hr/payroll/${payroll.id}/pay`));
          if (leido.bien) setPago(leido.cuerpo.data?.pago ?? null);
        }
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

  // Lote 295: tras pagar, lo mismo que tras aprobar -- la lista (cambia el estado) y el
  // detalle releido de la base (ahora con su pago).
  const alPagar = () => {
    fetchPayrolls();
    if (selectedPayroll) handleSelectPayroll(selectedPayroll);
  };

  return { confirm, payrolls, setPayrolls, loading, setLoading, page, setPage, selectedPayroll, setSelectedPayroll, payrollDetailsList, setPayrollDetailsList, loadingDetails, setLoadingDetails, avisoIsr, setAvisoIsr, asiento, setAsiento, motivoRechazo, setMotivoRechazo, pago, showCreateModal, setShowCreateModal, submitting, setSubmitting, itemsPerPage, totalPages, pagedPayrolls, formData, setFormData, fetchPayrolls, handleSelectPayroll, handleCreatePayroll, handleRecalculate, handleApprove, handleDelete, alPagar };
}

export type EstadoNominas = ReturnType<typeof useNominas>;
