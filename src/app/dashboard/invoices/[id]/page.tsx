'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/app/dashboard/layout';
import {
  ArrowLeft,
  Calendar,
  FileText,
  Printer,
  Download,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldCheck,
  User,
  Building2,
  CreditCard,
  DollarSign,
  FileCode,
  ExternalLink
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface InvoiceDetail {
  id: string;
  ncf: string;
  ecfType: string;
  status: string;
  paymentStatus: string;
  paymentType: string;
  bankName: string | null;
  transactionNumber: string | null;
  subtotal: string;
  discount: string;
  totalTaxes: string;
  total: string;
  buyerRnc: string | null;
  buyerName: string | null;
  dgiiMessage: string | null;
  xmlPath: string | null;
  signedXmlPath: string | null;
  pdfPath: string | null;
  msellerTrackId: string | null;
  codigoFactura: string | null;
  createdAt: string;
  customerName: string | null;
  customerRnc: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  lines: Array<{
    id: string;
    productId: string;
    quantity: string;
    unitPrice: string;
    discount: string;
    subtotal: string;
    total: string;
    productName: string | null;
    productSku: string | null;
  }>;
  taxes: Array<{
    id: string;
    taxType: string;
    rate: string;
    amount: string;
  }>;
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    async function fetchInvoice() {
      try {
        const res = await fetch(`/api/v1/invoices/${id}`);
        const result = await res.json();

        if (result.success) {
          setInvoice(result.data);
        } else {
          toast.error(result.error?.message || 'Error al cargar los detalles de la factura');
          router.push('/dashboard/ecf');
        }
      } catch (error) {
        toast.error('Error de red al conectar con el servidor');
      } finally {
        setLoading(false);
      }
    }
    if (id) {
      fetchInvoice();
    }
  }, [id, router]);

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP'
    }).format(num);
  };

  const getEcfTypeName = (type: string) => {
    const types: Record<string, string> = {
      '31': 'Factura de Crédito Fiscal Electrónica (e-CF)',
      '32': 'Factura de Consumo Electrónica (e-CF)',
      '33': 'Nota de Débito Electrónica (e-CF)',
      '34': 'Nota de Crédito Electrónica (e-CF)',
      '41': 'Registro de Proveedores Informales Electrónico',
      '43': 'Registro de Único Ingreso Electrónico',
      '44': 'Registro de Gastos Menores Electrónico',
      '45': 'Registro de Regímenes Especiales de Tributación Electrónico',
      '46': 'Registro de Gubernamentales Electrónico'
    };
    return types[type] || `Tipo e-CF ${type}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-semibold border border-emerald-500/20">
            <CheckCircle2 className="h-3.5 w-3.5" /> Aceptado por DGII
          </span>
        );
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-xs font-semibold border border-blue-500/20">
            <Clock className="h-3.5 w-3.5" /> Recibido / Pendiente DGII
          </span>
        );
      case 'signed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-500 text-xs font-semibold border border-indigo-500/20">
            <ShieldCheck className="h-3.5 w-3.5" /> Firmado Digitalmente
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-500 text-xs font-semibold border border-rose-500/20">
            <AlertCircle className="h-3.5 w-3.5" /> Rechazado por DGII
          </span>
        );
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-xs font-semibold border border-amber-500/20">
            <FileText className="h-3.5 w-3.5" /> Borrador
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-500/10 text-slate-400 text-xs font-semibold border border-slate-500/20">
            {status.toUpperCase()}
          </span>
        );
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-xs font-semibold border border-emerald-500/20">
            PAGADO
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-xs font-semibold border border-amber-500/20">
            PAGO PARCIAL
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-rose-500/10 text-rose-500 text-xs font-semibold border border-rose-500/20">
            NO PAGADO
          </span>
        );
    }
  };

  const getPaymentTypeName = (type: string) => {
    const types: Record<string, string> = {
      'cash': 'Efectivo',
      'credit': 'Crédito',
      'bank_transfer': 'Transferencia Bancaria'
    };
    return types[type] || type;
  };

  const handlePrint = () => {
    window.open(`/api/v1/invoices/${id}/print`, '_blank');
  };

  const handleDownloadPdf = () => {
    window.open(`/api/v1/invoices/${id}/pdf`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center max-w-7xl mx-auto w-full">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-10 w-10 text-amber-500 animate-spin" />
          <p className="text-on-surface-variant text-sm font-semibold animate-pulse">
            Cargando comprobante fiscal...
          </p>
        </div>
      </div>

    );
  }

  if (!invoice) return null;

  const clientName = invoice.customerName || invoice.buyerName || 'Consumidor Final';
  const clientRnc = invoice.customerRnc || invoice.buyerRnc || 'N/A';

  return (

    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 font-sans">

      {/* Navigation & Header */}
      <button
        onClick={() => router.push('/dashboard/ecf')}
        className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors text-sm font-semibold mb-2"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Facturación e-CF
      </button>

      {/* Deep Navy Premium Header */}
      <div className="bg-[#001e40] rounded-2xl p-6 md:p-8 border border-[#003366] shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#c5a059] rounded-full blur-[100px] opacity-20 pointer-events-none"></div>

        <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center relative z-10">
          <div className="flex gap-4 items-start md:items-center">
            <div className="h-16 w-16 rounded-xl bg-[#003366] flex items-center justify-center border border-[#004883] text-[#c5a059] shadow-inner shrink-0">
              <FileText className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white font-display mb-1 flex items-center flex-wrap gap-2">
                e-NCF: <span className="font-mono text-[#c5a059]">{invoice.ncf}</span>
                {invoice.codigoFactura && (
                  <span className="text-xs bg-[#003366] border border-[#004883] text-white px-2 py-0.5 rounded font-mono font-medium tracking-wide">
                    {invoice.codigoFactura}
                  </span>
                )}
              </h1>
              <p className="text-[#a7c8ff] text-sm">
                {getEcfTypeName(invoice.ecfType)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <button
              onClick={handlePrint}
              disabled={printing}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#003366] hover:bg-[#004883] text-white px-4 py-2.5 rounded-lg border border-[#004883] transition-all text-sm font-medium disabled:opacity-50"
            >
              {printing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4 text-[#c5a059]" />}
              Imprimir / Ver PDF
            </button>

            <button
              onClick={handleDownloadPdf}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#c5a059] hover:bg-[#b08e4f] text-white px-4 py-2.5 rounded-lg transition-all text-sm font-medium shadow-lg"
            >
              <Download className="h-4 w-4" />
              Descargar e-CF
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Metadata Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* General Information Card */}
        <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30 space-y-4">
          <h3 className="text-sm font-bold text-primary border-b border-outline-variant/30 pb-2 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#c5a059]" /> Datos del Comprobante
          </h3>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Estado DGII:</span>
              <div>{getStatusBadge(invoice.status)}</div>
            </div>
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Fecha Emisión:</span>
              <span className="font-medium">{new Date(invoice.createdAt).toLocaleString('es-DO')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Tipo Pago:</span>
              <span className="font-medium">{getPaymentTypeName(invoice.paymentType)}</span>
            </div>
            {invoice.bankName && (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Banco:</span>
                <span className="font-medium">{invoice.bankName}</span>
              </div>
            )}
            {invoice.transactionNumber && (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">No. Transacción:</span>
                <span className="font-mono text-xs bg-surface-container-high px-1.5 py-0.5 rounded">{invoice.transactionNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Estado Pago:</span>
              <div>{getPaymentStatusBadge(invoice.paymentStatus)}</div>
            </div>
          </div>
        </div>

        {/* Client Information Card */}
        <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30 space-y-4">
          <h3 className="text-sm font-bold text-primary border-b border-outline-variant/30 pb-2 flex items-center gap-2">
            <User className="h-4 w-4 text-[#c5a059]" /> Información del Receptor
          </h3>

          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2.5">
              <Building2 className="h-5 w-5 text-on-surface-variant shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-primary">{clientName}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">Razón Social / Nombre</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <ShieldCheck className="h-5 w-5 text-on-surface-variant shrink-0 mt-0.5" />
              <div>
                <p className="font-mono font-medium">{clientRnc}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">RNC / Cédula</p>
              </div>
            </div>

            {(invoice.customerEmail || invoice.customerPhone) && (
              <div className="pt-2 border-t border-outline-variant/20 space-y-2">
                {invoice.customerEmail && (
                  <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                    <span className="font-medium text-primary">Email:</span> {invoice.customerEmail}
                  </p>
                )}
                {invoice.customerPhone && (
                  <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                    <span className="font-medium text-primary">Tel:</span> {invoice.customerPhone}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* DGII / XML / Integration Details */}
        <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30 space-y-4">
          <h3 className="text-sm font-bold text-primary border-b border-outline-variant/30 pb-2 flex items-center gap-2">
            <FileCode className="h-4 w-4 text-[#c5a059]" /> Integración & Respuestas
          </h3>

          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <span className="text-xs text-on-surface-variant">Track ID (DGII/MSeller):</span>
              <p className="font-mono text-xs bg-surface-container-high/50 p-2 rounded break-all border border-outline-variant/20">
                {invoice.msellerTrackId || 'No disponible'}
              </p>
            </div>

            {invoice.dgiiMessage && (
              <div className="bg-rose-500/5 p-3 rounded-lg border border-rose-500/10 space-y-1">
                <span className="text-xs font-semibold text-rose-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> DGII Responde:
                </span>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {invoice.dgiiMessage}
                </p>
              </div>
            )}

            {!invoice.dgiiMessage && invoice.status === 'accepted' && (
              <div className="bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10 space-y-1">
                <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> DGII Estatus:
                </span>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Documento recibido y aprobado correctamente en la DGII.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Line Items Table */}
      <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-outline-variant/30 bg-surface-container-high/20">
          <h2 className="text-base font-bold text-primary">Detalle de Productos / Servicios</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background/50 border-b border-outline-variant/30 text-on-surface-variant text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold">SKU</th>
                <th className="p-4 font-semibold">Descripción</th>
                <th className="p-4 font-semibold text-center">Cant.</th>
                <th className="p-4 font-semibold text-right">Precio Unit.</th>
                <th className="p-4 font-semibold text-right">Descuento</th>
                <th className="p-4 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {invoice.lines.map((line) => (
                <tr key={line.id} className="hover:bg-surface-container-high/30 transition-colors">
                  <td className="p-4 font-mono text-xs text-on-surface-variant">
                    {line.productSku || 'N/A'}
                  </td>
                  <td className="p-4 text-sm font-medium text-primary">
                    {line.productName || 'Producto / Servicio general'}
                  </td>
                  <td className="p-4 text-sm text-center font-semibold text-on-surface-variant">
                    {parseFloat(line.quantity)}
                  </td>
                  <td className="p-4 text-sm text-right text-on-surface-variant">
                    {formatCurrency(line.unitPrice)}
                  </td>
                  <td className="p-4 text-sm text-right text-rose-500">
                    {parseFloat(line.discount) > 0 ? `-${formatCurrency(line.discount)}` : '-'}
                  </td>
                  <td className="p-4 text-sm font-bold text-primary text-right">
                    {formatCurrency(line.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        <div className="border-t border-outline-variant/30 p-6 bg-surface-container-high/10 flex flex-col md:flex-row md:justify-between gap-6">

          {/* Left side: Taxes breakdown */}
          <div className="w-full md:w-1/2 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Impuestos Detallados
            </h4>
            <div className="space-y-1.5 pt-1">
              {invoice.taxes.length === 0 ? (
                <p className="text-xs text-on-surface-variant/70 italic">
                  No aplica impuestos o exento de ITBIS.
                </p>
              ) : (
                invoice.taxes.map((tax) => (
                  <div key={tax.id} className="flex justify-between max-w-xs text-xs">
                    <span className="text-on-surface-variant font-medium">
                      {tax.taxType} ({parseFloat(tax.rate)}%)
                    </span>
                    <span className="font-semibold text-primary">
                      {formatCurrency(tax.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right side: Overall amounts */}
          <div className="w-full md:w-1/3 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Subtotal:</span>
              <span className="font-semibold text-primary">{formatCurrency(invoice.subtotal)}</span>
            </div>

            {parseFloat(invoice.discount) > 0 && (
              <div className="flex justify-between text-sm text-rose-500">
                <span>Descuento total:</span>
                <span className="font-semibold">-{formatCurrency(invoice.discount)}</span>
              </div>
            )}

            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Impuestos Totales:</span>
              <span className="font-semibold text-primary">{formatCurrency(invoice.totalTaxes)}</span>
            </div>

            <div className="border-t border-outline-variant/30 pt-3 flex justify-between">
              <span className="text-base font-bold text-primary">Monto Total:</span>
              <span className="text-lg font-bold text-[#c5a059] font-display">{formatCurrency(invoice.total)}</span>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
