'use client';

/**
 * El estado y las acciones del alta de un conduce (lote 226).
 *
 * Salio de `page.tsx` (844 lineas) al partirla. Es un HOOK que se crea en la
 * pagina, y no estado propio del formulario, a proposito: el formulario se
 * monta y desmonta al entrar y salir del alta, y hasta ahora el chofer, la
 * placa, la fecha y demas SOBREVIVIAN a cancelar (solo se limpiaban la factura
 * y sus lineas). Con el estado dentro del formulario se perderian al cerrarlo:
 * seria un cambio de comportamiento escondido en un refactor.
 *
 * El codigo de las acciones es el de la pagina, sin tocar.
 */
import { useState } from 'react';
import { toast } from 'sonner';

export function useFormularioConduce({ onCreado }: { onCreado: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [driverName, setDriverName] = useState('');
  const [driverLicense, setDriverLicense] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [dispatcherName, setDispatcherName] = useState('');
  const [notesText, setNotesText] = useState('');

  // Target Invoice
  const [showInvoiceSearch, setShowInvoiceSearch] = useState(false);
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [targetInvoice, setTargetInvoice] = useState<any>(null);

  // Line dispatches
  const [dispatchLines, setDispatchLines] = useState<any[]>([]);

  /** Quitar la factura elegida y sus lineas (cancelar, volver, cambiar factura). */
  const descartarFactura = () => {
    setTargetInvoice(null);
    setDispatchLines([]);
  };

  /** Lo que hacia el `onChange` de "Despachar Hoy", tal cual. */
  const cambiarCantidad = (idx: number, valor: string) => {
    const line = dispatchLines[idx];
    const val = Math.min(Number(valor), line.pendingQty);
    const updated = [...dispatchLines];
    updated[idx].quantity = val;
    setDispatchLines(updated);
  };

  // Search for accepted invoices with pending or partial delivery status
  const handleSearchInvoices = async () => {
    setInvoicesLoading(true);
    try {
      // Fetch current delivery notes to check for drafts
      const dRes = await fetch(`/api/v1/delivery-notes?per_page=100`);
      const dData = await dRes.json();
      const draftInvoiceIds = new Set<string>();
      if (dData.success) {
        (dData.data || []).forEach((dn: any) => {
          if (dn.status === 'draft') {
            draftInvoiceIds.add(dn.invoiceId);
          }
        });
      }

      // Fetch invoices (without forcing accepted status, we will filter in frontend to allow signed/submitted too)
      const res = await fetch(`/api/v1/ecf?q=${encodeURIComponent(invoiceSearchQuery)}&per_page=50`);
      const data = await res.json();
      if (data.success) {
        // Filter out credit notes (34) and check deliveryStatus, only show active invoices (accepted, signed, submitted)
        // Also exclude invoices that already have a draft delivery note
        const validInvoices = (data.data || []).filter(
          (inv: any) =>
            inv.ecfType !== '34' &&
            ['accepted', 'signed', 'submitted'].includes(inv.status) &&
            (inv.deliveryStatus === 'pending' || inv.deliveryStatus === 'partial') &&
            !draftInvoiceIds.has(inv.id)
        );
        setInvoicesList(validInvoices);
      }
    } catch (err) {
      toast.error('Error al buscar facturas.');
    } finally {
      setInvoicesLoading(false);
    }
  };

  const abrirBuscador = () => {
    setShowInvoiceSearch(true);
    handleSearchInvoices();
  };

  const handleSelectInvoice = async (inv: any) => {
    try {
      toast.info('Cargando líneas y cantidades despachadas...');
      const res = await fetch(`/api/v1/invoices/${inv.id}`);
      const data = await res.json();
      if (data.success) {
        const fullInvoice = data.data;

        // Fetch already approved delivery notes to calculate delivered quantities
        const dRes = await fetch(`/api/v1/delivery-notes?per_page=100`);
        const dData = await dRes.json();
        const deliveredMap: Record<string, number> = {};

        if (dData.success) {
          const approvedNotes = (dData.data || []).filter(
            (dn: any) => dn.invoiceId === inv.id && dn.status === 'approved'
          );

          // Get detail lines for each approved note to sum up
          for (const an of approvedNotes) {
            const linesRes = await fetch(`/api/v1/delivery-notes/${an.id}`);
            const linesData = await linesRes.json();
            if (linesData.success && linesData.data?.lines) {
              for (const l of linesData.data.lines) {
                deliveredMap[l.productId] = (deliveredMap[l.productId] || 0) + Number(l.quantity);
              }
            }
          }
        }

        setTargetInvoice(fullInvoice);
        // Map lines
        const linesMap = fullInvoice.lines.map((l: any) => {
          const invQty = Number(l.quantity);
          const prevQty = deliveredMap[l.productId] || 0;
          const pendingQty = Math.max(0, invQty - prevQty);

          return {
            productId: l.productId,
            productName: l.productName,
            invoicedQty: invQty,
            previouslyDelivered: prevQty,
            pendingQty: pendingQty,
            quantity: pendingQty, // Default to dispatch all remaining
          };
        });

        setDispatchLines(linesMap);
        setShowInvoiceSearch(false);
        toast.success(`Factura ${inv.ncf} seleccionada.`);
      }
    } catch (err) {
      toast.error('Error al cargar los detalles de la factura.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetInvoice) {
      toast.error('Debe seleccionar una factura de referencia.');
      return;
    }
    if (dispatchLines.every((l) => l.quantity <= 0)) {
      toast.error('Debe despachar una cantidad mayor a cero en al menos un producto.');
      return;
    }

    // Verify limit validation
    for (const line of dispatchLines) {
      if (line.quantity > line.pendingQty) {
        toast.error(`No puede despachar más de la cantidad pendiente para: ${line.productName}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        invoiceId: targetInvoice.id,
        deliveryDate,
        driverName,
        driverLicense,
        vehiclePlate,
        dispatcherName,
        notes: notesText,
        lines: dispatchLines
          .filter((l) => l.quantity > 0)
          .map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
      };

      const res = await fetch('/api/v1/delivery-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al guardar conduce.');
      }

      toast.success('Borrador de conduce creado correctamente.', {
        description: `Código: ${data.data.deliveryNumber}`,
      });

      // Reset Form State
      setTargetInvoice(null);
      setDispatchLines([]);
      setDriverName('');
      setDriverLicense('');
      setVehiclePlate('');
      setDispatcherName('');
      setNotesText('');
      onCreado();
    } catch (err: any) {
      toast.error('Error al crear conduce', { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return {
    submitting,
    deliveryDate, setDeliveryDate,
    driverName, setDriverName,
    driverLicense, setDriverLicense,
    vehiclePlate, setVehiclePlate,
    dispatcherName, setDispatcherName,
    notesText, setNotesText,
    showInvoiceSearch, setShowInvoiceSearch,
    invoiceSearchQuery, setInvoiceSearchQuery,
    invoicesList, invoicesLoading,
    targetInvoice, dispatchLines,
    descartarFactura, cambiarCantidad,
    handleSearchInvoices, abrirBuscador, handleSelectInvoice, handleSubmit,
  };
}

export type FormularioConduce = ReturnType<typeof useFormularioConduce>;
