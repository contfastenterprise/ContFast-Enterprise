'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  RefreshCw,
  Eye,
  ArrowRight,
  Plus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  TrendingUp,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  X,
  Activity,
  Database,
  CreditCard,
  BarChart3,
  Pencil,
  FileCode,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRbac } from '@/components/providers/rbacContext';
import { toast } from 'sonner';
import { SearchBar } from '@/components/ui/search-bar';
import DateRangePicker from '@/components/ui/date-range-picker';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Invoice {
  id: string;
  ncf: string;
  ecfType: string;
  status: string;
  paymentStatus: string;
  subtotal: string;
  totalTaxes: string;
  total: string;
  buyerRnc?: string;
  buyerName?: string;
  msellerTrackId?: string;
  dgiiMessage?: string;
  customerId?: string;
  createdAt: string;
  xmlPath?: string | null;
  signedXmlPath?: string | null;
  msellerXmlPath?: string | null;
}

interface ECFStats {
  totalAmount: string;
  totalITBIS: string;
  totalCount: number;
  byType: Record<string, { count: number; amount: string }>;
  byStatus: Record<string, number>;
  approvalRate: number;
}

interface Submission {
  id: string;
  invoiceId: string;
  ncf?: string;
  ecfType?: string;
  trackId?: string;
  status: string;
  responseMessage?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Sequence {
  id: string;
  ecfType: string;
  prefix: string;
  currentSequence: number;
  maxSequence: number;
  expiryDate?: string;
  sequenceExpiry?: string;
  status: string;
  usedCount: number;
}

interface CreditDebitNote {
  id: string;
  ncf: string;
  type: string;
  invoiceId: string;
  reason: string;
  amount: string;
  status: string;
  createdAt: string;
}

interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

const ECF_TYPE_LABELS: Record<string, string> = {
  // Traditional NCFs
  '01': 'Factura de Crédito Fiscal',
  '02': 'Factura de Consumo',
  '03': 'Nota de Débito',
  '04': 'Nota de Crédito',
  '11': 'Comprobante de Compras',
  '13': 'Comprobante para Gastos Menores',
  '14': 'Comprobante de Regímenes Especiales',
  '15': 'Comprobante Gubernamental',
  '16': 'Comprobante de Exportación',
  '17': 'Comprobante para Pagos al Exterior',
  // Electronic e-CFs
  '31': 'Factura de Crédito Fiscal Electrónica',
  '32': 'Factura de Consumo Electrónica',
  '33': 'Nota de Débito Electrónica',
  '34': 'Nota de Crédito Electrónica',
  '41': 'Comprobante de Compras Electrónico',
  '43': 'Comprobante para Gastos Menores Electrónico',
  '44': 'Comprobante para Regímenes Especiales Electrónico',
  '45': 'Comprobante Gubernamental Electrónico',
  '46': 'Comprobante para Pagos al Exterior Electrónico',
  '47': 'Comprobante de Exportación Electrónico',
};

const ECF_TYPE_DESCRIPTIONS: Record<string, string> = {
  // Electronic & Traditional matching pairs
  '31': 'Emisiones entre contribuyentes para sustentar gastos, costos o crédito fiscal.',
  '01': 'Emisiones entre contribuyentes para sustentar gastos, costos o crédito fiscal.',
  '32': 'Para venta de bienes o servicios a consumidores finales que no requieren sustentar crédito fiscal.',
  '02': 'Para venta de bienes o servicios a consumidores finales que no requieren sustentar crédito fiscal.',
  '33': 'Ajustes que incrementan el valor o monto de una factura emitida anteriormente.',
  '03': 'Ajustes que incrementan el valor o monto de una factura emitida anteriormente.',
  '34': 'Modificaciones por anulaciones, devoluciones, descuentos o correcciones en facturas ya emitidas.',
  '04': 'Modificaciones por anulaciones, devoluciones, descuentos o correcciones en facturas ya emitidas.',
  '41': 'Emitido al adquirir bienes o servicios de personas no registradas en la DGII.',
  '11': 'Emitido al adquirir bienes o servicios de personas no registradas en la DGII.',
  '43': 'Para registrar gastos menores realizados por personal de la empresa que carecen de comprobante.',
  '13': 'Para registrar gastos menores realizados por personal de la empresa que carecen de comprobante.',
  '44': 'Para facturar a personas físicas o jurídicas acogidas a regímenes especiales de tributación.',
  '14': 'Para facturar a personas físicas o jurídicas acogidas a regímenes especiales de tributación.',
  '45': 'Utilizado para facturar la venta de bienes o la prestación de servicios al Estado Dominicano.',
  '15': 'Utilizado para facturar la venta de bienes o la prestación de servicios al Estado Dominicano.',
  '46': 'Para sustentar pagos por rentas de fuente dominicana a personas físicas o jurídicas no residentes.',
  '17': 'Para sustentar pagos por rentas de fuente dominicana a personas físicas o jurídicas no residentes.',
  '47': 'Para reportar las ventas de bienes fuera del territorio nacional.',
  '16': 'Para reportar las ventas de bienes fuera del territorio nacional.',
};

// Helper: Determine if a sequence requires an expiration date (DGII rules)
function isExpiryRequired(isElectronic: boolean, ecfType: string) {
  // Facturas de consumo (02/32), Notas de Débito (03/33) y Notas de Crédito (04/34)
  // no exigen que la fecha se imprima físicamente, por lo que se marca como Opcional.
  if (['02', '03', '04', '32', '33', '34'].includes(ecfType)) {
    return false;
  }
  return true;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Borrador', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: <Clock className="h-3 w-3" /> },
  signed: { label: 'Firmado', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300', icon: <FileText className="h-3 w-3" /> },
  submitted: { label: 'Enviado', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300', icon: <Activity className="h-3 w-3" /> },
  accepted: { label: 'Aceptado', color: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300', icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { label: 'Rechazado', color: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300', icon: <XCircle className="h-3 w-3" /> },
  failed: { label: 'Fallido', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300', icon: <AlertTriangle className="h-3 w-3" /> },
  void: { label: 'Anulado', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', icon: <X className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG['draft'];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.color}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

function ECFTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    '31': 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    '32': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300',
    '33': 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
    '34': 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300',
    '41': 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    '43': 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
    '44': 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300',
    '45': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
    '46': 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
    '47': 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  };
  const isTraditional = type.startsWith('0') || type.startsWith('1');
  const prefix = isTraditional ? 'B' : 'e';
  
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${colors[type] || 'bg-gray-100 text-gray-700'}`}>
      {prefix}-{type}
    </span>
  );
}

function formatCurrency(amount: string | number) {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(n)) return 'RD$0.00';
  return `RD$${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '–';
  return new Date(dateStr).toLocaleDateString('es-DO', { year: 'numeric', month: 'short', day: '2-digit' });
}

// ─── Skeleton ───────────────────────────────────────────────────────────────────

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
      ))}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="h-28 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
  );
}

// ─── New Sequence Modal ──────────────────────────────────────────────────────────

interface NewSeqModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function NewSequenceModal({ open, onClose, onSuccess }: NewSeqModalProps) {
  const [isElectronic, setIsElectronic] = useState(true);
  const [form, setForm] = useState({
    ecfType: '31',
    prefix: 'E',
    startSequence: '1',
    maxSequence: '1000',
    sequenceExpiry: '',
  });

  // Update defaults when switching type
  useEffect(() => {
    setForm(f => ({
      ...f,
      prefix: isElectronic ? 'E' : 'B',
      ecfType: isElectronic ? '31' : '01',
    }));
  }, [isElectronic]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/v1/ecf/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          startSequence: parseInt(form.startSequence, 10),
          maxSequence: parseInt(form.maxSequence, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Error al crear secuencia');
      toast.success('Secuencia SACF creada exitosamente');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative z-10 w-full max-w-md bg-white border border-[#003366] rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between p-6 border-b border-[#003366] bg-[#001733]">
            <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
              <Plus className="h-5 w-5 text-[#C5A059]" /> Nueva Autorización SACF
            </h3>
            <button onClick={onClose} className="p-1 rounded-lg text-on-surface-variant hover:text-primary transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <h4 className="text-sm font-bold text-[#003366]">Formato Electrónico (e-CF)</h4>
                <p className="text-xs text-on-surface-variant">Genera secuencias E-31, E-32, etc. requeridas por DGII para facturación electrónica.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={isElectronic}
                  onChange={(e) => setIsElectronic(e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#C5A059]"></div>
              </label>
            </div>

            <div>
              <label className="text-sm font-semibold text-primary mb-1 block">Tipo de Comprobante</label>
              <select
                value={form.ecfType}
                onChange={(e) => setForm((f) => ({ ...f, ecfType: e.target.value }))}
                className="w-full bg-white border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#C5A059] outline-none transition-colors"
              >
                {isElectronic ? (
                  <>
                    <option value="31">E31 — Factura de Crédito Fiscal Electrónica</option>
                    <option value="32">E32 — Factura de Consumo Electrónica</option>
                    <option value="33">E33 — Nota de Débito Electrónica</option>
                    <option value="34">E34 — Nota de Crédito Electrónica</option>
                    <option value="41">E41 — Comprobante de Compras Electrónico</option>
                    <option value="43">E43 — Comprobante para Gastos Menores Electrónico</option>
                    <option value="44">E44 — Comprobante para Regímenes Especiales Electrónico</option>
                    <option value="45">E45 — Comprobante Gubernamental Electrónico</option>
                    <option value="46">E46 — Comprobante para Pagos al Exterior Electrónico</option>
                    <option value="47">E47 — Comprobante de Exportación Electrónico</option>
                  </>
                ) : (
                  <>
                    <option value="01">B01 — Factura de Crédito Fiscal</option>
                    <option value="02">B02 — Factura de Consumo</option>
                    <option value="03">B03 — Nota de Débito</option>
                    <option value="04">B04 — Nota de Crédito</option>
                    <option value="11">B11 — Comprobante de Compras</option>
                    <option value="13">B13 — Comprobante para Gastos Menores</option>
                    <option value="14">B14 — Comprobante de Regímenes Especiales</option>
                    <option value="15">B15 — Comprobante Gubernamental</option>
                    <option value="16">B16 — Comprobante de Exportación</option>
                    <option value="17">B17 — Comprobante para Pagos al Exterior</option>
                  </>
                )}
              </select>
              {ECF_TYPE_DESCRIPTIONS[form.ecfType] && (
                <p className="mt-2 text-xs text-on-surface-variant italic bg-slate-100 p-2 rounded-lg border border-slate-200">
                  <span className="font-semibold text-primary not-italic block mb-1">¿Para qué se utiliza?</span>
                  {ECF_TYPE_DESCRIPTIONS[form.ecfType]}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-primary mb-1 block">Secuencia Desde</label>
                <input
                  type="number"
                  min="1"
                  value={form.startSequence}
                  onChange={(e) => setForm((f) => ({ ...f, startSequence: e.target.value }))}
                  className="w-full bg-white border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#C5A059] outline-none transition-colors font-mono"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-primary mb-1 block">Secuencia Hasta</label>
                <input
                  type="number"
                  min="2"
                  value={form.maxSequence}
                  onChange={(e) => setForm((f) => ({ ...f, maxSequence: e.target.value }))}
                  className="w-full bg-white border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#C5A059] outline-none transition-colors font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-primary mb-1 flex items-center justify-between">
                <span>Fecha Vencimiento {isExpiryRequired(isElectronic, form.ecfType) && <span className="text-red-500">*</span>}</span>
                <span className="text-on-surface-variant/70 text-xs font-normal">
                  {!isExpiryRequired(isElectronic, form.ecfType) ? '(Opcional) ' : ''}dd-MM-yyyy
                </span>
              </label>
              <input
                type="text"
                placeholder="31-12-2026"
                value={form.sequenceExpiry}
                onChange={(e) => setForm((f) => ({ ...f, sequenceExpiry: e.target.value }))}
                className="w-full bg-white border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#C5A059] outline-none transition-colors font-mono"
                pattern={form.sequenceExpiry ? "\\d{2}-\\d{2}-\\d{4}" : undefined}
                required={isExpiryRequired(isElectronic, form.ecfType)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#003366]">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-on-surface-variant hover:text-primary font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Guardar
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

interface EditSeqModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  sequence: Sequence | null;
}

function EditSequenceModal({ open, onClose, onSuccess, sequence }: EditSeqModalProps) {
  const [form, setForm] = useState({
    currentSequence: '',
    maxSequence: '',
    sequenceExpiry: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sequence) {
      setForm({
        currentSequence: (sequence.currentSequence ?? 0).toString(),
        maxSequence: (sequence.maxSequence ?? 0).toString(),
        sequenceExpiry: sequence.sequenceExpiry || sequence.expiryDate || '',
      });
    }
  }, [sequence]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sequence) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/ecf/sequences/${sequence.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentSequence: parseInt(form.currentSequence, 10),
          maxSequence: parseInt(form.maxSequence, 10),
          sequenceExpiry: form.sequenceExpiry,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Error al actualizar secuencia');
      toast.success('Secuencia actualizada exitosamente');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open || !sequence) return null;

  const isElectronic = !sequence.ecfType.startsWith('0') && !sequence.ecfType.startsWith('1');

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative z-10 w-full max-w-md bg-white border border-[#003366] rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between p-6 border-b border-[#003366] bg-[#001733]">
            <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
              <Pencil className="h-5 w-5 text-[#C5A059]" /> Editar Secuencia SACF
            </h3>
            <button onClick={onClose} className="p-1 rounded-lg text-on-surface-variant hover:text-primary transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div>
              <label className="text-sm font-semibold text-primary mb-1 block">Tipo Comprobante</label>
              <input
                type="text"
                disabled
                value={`${sequence.prefix}-${sequence.ecfType} — ${ECF_TYPE_LABELS[sequence.ecfType] || ''}`}
                 className="w-full bg-surface-container border border-outline rounded-lg px-3 py-2 text-xs text-primary opacity-60 outline-none font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-primary mb-1 block">Secuencia Actual</label>
                <input
                  type="number"
                  min="0"
                  value={form.currentSequence}
                  onChange={(e) => setForm((f) => ({ ...f, currentSequence: e.target.value }))}
                  className="w-full bg-white border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#C5A059] outline-none transition-colors font-mono"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-primary mb-1 block">Secuencia Máxima</label>
                <input
                  type="number"
                  min="1"
                  value={form.maxSequence}
                  onChange={(e) => setForm((f) => ({ ...f, maxSequence: e.target.value }))}
                  className="w-full bg-white border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#C5A059] outline-none transition-colors font-mono"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-primary mb-1 flex items-center justify-between">
                <span>Fecha Vencimiento {isExpiryRequired(isElectronic, sequence.ecfType) && <span className="text-red-500">*</span>}</span>
                <span className="text-on-surface-variant/70 text-xs font-normal">
                  {!isExpiryRequired(isElectronic, sequence.ecfType) ? '(Opcional) ' : ''}dd-MM-yyyy
                </span>
              </label>
              <input
                type="text"
                placeholder="31-12-2026"
                value={form.sequenceExpiry}
                onChange={(e) => setForm((f) => ({ ...f, sequenceExpiry: e.target.value }))}
                className="w-full bg-white border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#C5A059] outline-none transition-colors font-mono"
                pattern={form.sequenceExpiry ? "\\d{2}-\\d{2}-\\d{4}" : undefined}
                required={isExpiryRequired(isElectronic, sequence.ecfType)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#003366]">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-on-surface-variant hover:text-primary font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                Guardar
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ─── Tab Components ──────────────────────────────────────────────────────────────

// Tab 1: Comprobantes
function ComprobantesTab() {
  const [invoiceList, setInvoiceList] = useState<Invoice[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, per_page: 20, total: 0, total_pages: 0 });
  const [stats, setStats] = useState<ECFStats | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [filters, setFilters] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    return { status: '', ecfType: '', from: todayStr, to: todayStr, q: '' };
  });
  const [page, setPage] = useState(1);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [syncingBatch, setSyncingBatch] = useState(false);
  const [resubmittingId, setResubmittingId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedIds([]);
  }, [page, filters]);

  const handleToggleSelectAll = () => {
    if (selectedIds.length === invoiceList.length && invoiceList.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(invoiceList.map(inv => inv.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBatchSyncStatus = async () => {
    if (selectedIds.length === 0) return;
    setSyncingBatch(true);
    try {
      const res = await fetch('/api/v1/ecf/dgii-status/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoiceIds: selectedIds }),
      });
      const data = await res.json();
      if (data.success) {
        const updatedCount = data.data.filter((item: any) => item.updated).length;
        const totalChecked = data.data.length;
        toast.success(`Sincronización completada: ${updatedCount} facturas actualizadas de ${totalChecked} consultadas.`);
        setSelectedIds([]);
        fetchInvoices();
        fetchStats();
      } else {
        toast.error(data.error?.message || 'Error en la sincronización en lote');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSyncingBatch(false);
    }
  };

  const handleSyncFilteredStatus = async () => {
    if (invoiceList.length === 0) return;
    setSyncingBatch(true);
    try {
      const invoiceIds = invoiceList.map(inv => inv.id);
      const res = await fetch('/api/v1/ecf/dgii-status/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoiceIds }),
      });
      const data = await res.json();
      if (data.success) {
        const updatedCount = data.data.filter((item: any) => item.updated).length;
        const totalChecked = data.data.length;
        toast.success(`Sincronización completada: ${updatedCount} facturas actualizadas de ${totalChecked} consultadas.`);
        fetchInvoices();
        fetchStats();
      } else {
        toast.error(data.error?.message || 'Error en la sincronización en lote');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSyncingBatch(false);
    }
  };

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch('/api/v1/ecf/stats');
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), per_page: '20' });
      if (filters.status) params.set('status', filters.status);
      if (filters.ecfType) params.set('ecfType', filters.ecfType);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.q) params.set('q', filters.q);

      const res = await fetch(`/api/v1/ecf?${params}`);
      const data = await res.json();
      if (data.success) {
        setInvoiceList(data.data);
        setMeta(data.meta);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  }, [page, filters]);

  useEffect(() => { fetchStats(); fetchInvoices(); }, [fetchStats, fetchInvoices]);

  const handleRefreshStatus = async (inv: Invoice) => {
    setRefreshingId(inv.id);
    try {
      const res = await fetch(`/api/v1/ecf/${inv.id}/dgii-status`);
      const data = await res.json();
      if (data.success) {
        toast.success(`Estado actualizado: ${data.data.dgiiStatus || data.data.status}`);
        fetchInvoices();
      } else {
        toast.error(data.error?.message || 'Error al consultar estado');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleResubmit = async (inv: Invoice) => {
    setResubmittingId(inv.id);
    try {
      const res = await fetch(`/api/v1/ecf/${inv.id}/resubmit`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('Reenvío encolado exitosamente');
        fetchInvoices();
      } else {
        toast.error(data.error?.message || 'Error al reenviar');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResubmittingId(null);
    }
  };

  const kpis = [
    {
      title: 'Total Facturado',
      value: formatCurrency(stats?.totalAmount || '0'),
      icon: <TrendingUp className="h-6 w-6" />,
      color: 'bg-secondary/10',
      iconColor: 'text-secondary',
      border: 'border-secondary/20',
      glow: 'shadow-[0_0_15px_rgba(197,160,89,0.15)]'
    },
    {
      title: 'ITBIS Recaudado',
      value: formatCurrency(stats?.totalITBIS || '0'),
      icon: <BarChart3 className="h-6 w-6" />,
      color: 'bg-primary/10',
      iconColor: 'text-primary',
      border: 'border-primary/20',
      glow: 'shadow-[0_0_15px_rgba(0,51,102,0.15)]'
    },
    {
      title: '% Aprobados',
      value: `${stats?.approvalRate ?? 0}%`,
      icon: <CheckCircle2 className="h-6 w-6" />,
      color: 'bg-green-500/10',
      iconColor: 'text-green-500',
      border: 'border-green-500/20',
      glow: 'shadow-[0_0_15px_rgba(34,197,94,0.15)]'
    },
    {
      title: 'Total Comprobantes',
      value: stats?.totalCount?.toLocaleString() ?? '0',
      icon: <FileText className="h-6 w-6" />,
      color: 'bg-outline-variant/20',
      iconColor: 'text-on-surface',
      border: 'border-outline-variant/20',
      glow: ''
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards Premium Light */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {loadingStats
          ? Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)
          : kpis.map((kpi) => (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-white border border-outline-variant shadow-sm p-6 rounded-xl flex flex-col justify-between group transition-all hover:-translate-y-1 hover:shadow-md relative overflow-hidden`}
            >
              <div className={`absolute top-0 left-0 right-0 h-[3px] opacity-80 ${kpi.color}`} />
              <div className="flex justify-between items-start mb-6 mt-2">
                <div className={`p-2 rounded-xl ${kpi.color}`}>
                  <div className={kpi.iconColor}>{kpi.icon}</div>
                </div>
              </div>
              <div className="font-label-md text-xs text-on-surface-variant uppercase tracking-widest mb-1.5 font-bold">{kpi.title}</div>
              <div className="font-headline-md text-2xl md:text-3xl font-extrabold text-primary tracking-tight">{kpi.value}</div>
            </motion.div>
          ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-outline-variant shadow-sm p-4 flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        <div className="flex flex-col md:flex-row flex-wrap gap-3 items-stretch md:items-center flex-1">
          <div className="min-w-[200px] flex-1">
            <SearchBar
              placeholder="Buscar por NCF o RNC..."
              value={filters.q}
              onChange={(val) => { setFilters((f) => ({ ...f, q: val })); setPage(1); }}
            />
          </div>
          <select
            value={filters.ecfType}
            onChange={(e) => { setFilters((f) => ({ ...f, ecfType: e.target.value })); setPage(1); }}
            className="rounded-lg border border-outline-variant bg-white text-on-surface px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all appearance-none cursor-pointer"
          >
            <option value="">Todos los tipos</option>
            <option value="31">e-31 Crédito Fiscal</option>
            <option value="32">e-32 Consumo</option>
            <option value="33">e-33 Nota Débito</option>
            <option value="34">e-34 Nota Crédito</option>
            <option value="41">e-41 Compras</option>
            <option value="43">e-43 Gastos Menores</option>
            <option value="44">e-44 Regímenes Especiales</option>
            <option value="45">e-45 Gubernamental</option>
            <option value="46">e-46 Pagos al Exterior</option>
            <option value="47">e-47 Exportación</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
            className="rounded-lg border border-outline-variant bg-white text-on-surface px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all appearance-none cursor-pointer"
          >
            <option value="">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="submitted">Enviado</option>
            <option value="accepted">Aceptado</option>
            <option value="rejected">Rechazado</option>
            <option value="failed">Fallido</option>
          </select>
          <DateRangePicker
            from={filters.from}
            to={filters.to}
            onChange={(range) => {
              setFilters((f) => ({ ...f, from: range.from, to: range.to }));
              setPage(1);
            }}
          />
          {(filters.q || filters.ecfType || filters.status || filters.from || filters.to) && (
            <button
              onClick={() => { setFilters({ status: '', ecfType: '', from: '', to: '', q: '' }); setPage(1); }}
              className="flex items-center justify-center gap-1 px-3 py-2.5 rounded-lg bg-white border border-outline-variant text-on-surface-variant text-sm hover:bg-surface-container hover:text-on-surface transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" /> Limpiar
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 min-w-[200px] justify-center">
          <button
            onClick={handleSyncFilteredStatus}
            disabled={syncingBatch || invoiceList.length === 0}
            className="flex items-center justify-center gap-2 bg-primary text-on-primary px-6 py-2.5 rounded-lg font-bold text-sm hover:brightness-110 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
          >
            {syncingBatch ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span>SINCRONIZAR DGII</span>
          </button>
          <button
            onClick={fetchInvoices}
            className="flex items-center justify-center gap-2 bg-white border border-outline-variant text-on-surface-variant hover:bg-surface-container hover:text-on-surface px-6 py-2.5 rounded-lg font-bold text-sm transition-all shadow-sm active:scale-95 group whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loadingList ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
            <span>ACTUALIZAR DATOS</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          {loadingList ? (
            <div className="p-6"><TableSkeleton /></div>
          ) : invoiceList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-on-surface-variant">
              <FileText className="h-8 w-8 opacity-20" />
              <p className="text-sm font-medium">No se encontraron comprobantes</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead className="bg-white border-b border-outline-variant">
                <tr>
                  <th className="py-4 px-6 w-12 text-center">
                    <input
                      type="checkbox"
                      className="rounded border-outline-variant text-primary focus:ring-primary/20 cursor-pointer h-4 w-4"
                      checked={invoiceList.length > 0 && selectedIds.length === invoiceList.length}
                      onChange={handleToggleSelectAll}
                    />
                  </th>
                  <th className="py-4 px-6 font-bold text-primary text-[12px] uppercase tracking-wider">Fecha</th>
                  <th className="py-4 px-6 font-bold text-primary text-[12px] uppercase tracking-wider">NCF</th>
                  <th className="py-4 px-6 font-bold text-primary text-[12px] uppercase tracking-wider">Tipo</th>
                  <th className="py-4 px-6 font-bold text-primary text-[12px] uppercase tracking-wider">Monto Total</th>
                  <th className="py-4 px-6 font-bold text-primary text-[12px] uppercase tracking-wider text-center">Estado DGII</th>
                  <th className="py-4 px-6 font-bold text-primary text-[12px] uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {invoiceList.map((inv) => (
                  <tr key={inv.id} className={`hover:bg-white/50 transition-colors group ${selectedIds.includes(inv.id) ? 'bg-primary/5 hover:bg-primary/10' : ''}`}>
                    <td className="py-4 px-6 text-center w-12">
                      <input
                        type="checkbox"
                        className="rounded border-outline-variant text-primary focus:ring-primary/20 cursor-pointer h-4 w-4"
                        checked={selectedIds.includes(inv.id)}
                        onChange={() => handleToggleSelectOne(inv.id)}
                      />
                    </td>
                    <td className="py-4 px-6 font-body-sm text-on-surface-variant">{formatDate(inv.createdAt)}</td>
                    <td className="py-4 px-6 font-body-sm text-primary font-medium">{inv.ncf}</td>
                    <td className="py-4 px-6"><ECFTypeBadge type={inv.ecfType} /></td>
                    <td className="py-4 px-6 font-body-sm text-on-surface font-bold">{formatCurrency(inv.total)}</td>
                    <td className="py-4 px-6 text-center flex flex-col items-center gap-1">
                      <StatusBadge status={inv.status} />
                      {inv.dgiiMessage && (
                        <span className="text-[10px] text-on-surface-variant max-w-[120px] truncate" title={inv.dgiiMessage}>
                          {inv.dgiiMessage}
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex justify-end gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                        <button title="Ver detalle" onClick={() => window.open(`/dashboard/invoices/${inv.id}`, '_blank')} className="p-1.5 hover:bg-surface-container rounded transition-colors text-primary"><Eye className="h-4 w-4" /></button>
                        {(inv.msellerXmlPath || inv.signedXmlPath || inv.xmlPath) && (
                          <button title="Descargar XML" onClick={() => window.open(`/api/v1/invoices/${inv.id}/xml`, '_blank')} className="p-1.5 hover:bg-surface-container rounded transition-colors text-primary"><FileCode className="h-4 w-4" /></button>
                        )}
                        <button title="Consultar estado DGII" onClick={() => handleRefreshStatus(inv)} disabled={refreshingId === inv.id} className="p-1.5 hover:bg-surface-container rounded transition-colors text-primary">{refreshingId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button>
                        {['rejected', 'failed'].includes(inv.status) && (
                          <button title="Reenviar a DGII" onClick={() => handleResubmit(inv)} disabled={resubmittingId === inv.id} className="p-1.5 hover:bg-error-container text-error rounded transition-colors"><ArrowRight className="h-4 w-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {meta.total_pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-outline-variant bg-whiteest">
            <span className="text-xs text-on-surface-variant font-medium">Página {meta.page} de {meta.total_pages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 text-xs font-bold border border-outline-variant rounded hover:bg-white transition-colors disabled:opacity-50">Anterior</button>
              <button onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))} disabled={page >= meta.total_pages} className="px-3 py-1 text-xs font-bold border border-outline-variant rounded hover:bg-white transition-colors disabled:opacity-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-primary text-white border border-outline-variant shadow-xl p-4 rounded-xl flex items-center gap-6"
          >
            <span className="text-sm font-bold text-secondary">
              {selectedIds.length} seleccionado(s)
            </span>
            <button
              onClick={handleBatchSyncStatus}
              disabled={syncingBatch}
              className="flex items-center gap-2 bg-secondary text-white px-4 py-2 rounded-lg font-bold text-xs hover:brightness-110 active:scale-95 transition-all"
            >
              {syncingBatch ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Sincronizar Lote DGII
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="p-1 hover:bg-white/10 rounded-lg text-white/70 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Tab 2: Cola DGII
function ColaTab() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingAll, setRetryingAll] = useState(false);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/ecf/queue');
      const data = await res.json();
      if (data.success) setSubmissions(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  const failedSubmissions = submissions.filter((s) => s.status === 'failed');

  const handleRetryAll = async () => {
    setRetryingAll(true);
    try {
      let count = 0;
      for (const sub of failedSubmissions) {
        const res = await fetch(`/api/v1/ecf/${sub.invoiceId}/resubmit`, { method: 'POST' });
        const data = await res.json();
        if (data.success) count++;
      }
      toast.success(`${count} facturas reenviadas a la cola DGII`);
      fetchSubmissions();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRetryingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {submissions.filter((s) => s.status === 'processing').length} procesando
            </span>
          </div>
          <span className="text-gray-300 dark:text-gray-700">|</span>
          <span className="text-sm text-red-500">{failedSubmissions.length} fallidos</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchSubmissions}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#003366] hover:bg-[#002244] text-white text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Actualizar
          </button>
          {failedSubmissions.length > 0 && (
            <button
              onClick={handleRetryAll}
              disabled={retryingAll}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-on-secondary text-sm font-semibold hover:bg-secondary/90 transition-colors disabled:opacity-60"
            >
              {retryingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              Reintentar todos ({failedSubmissions.length})
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-6"><TableSkeleton rows={5} /></div>
        ) : submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400 bg-white">
            <Activity className="h-12 w-12 opacity-30" />
            <p className="text-sm font-medium">Cola vacía</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">NCF</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reintentos</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mensaje / Error</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {submissions.map((sub) => (
                <tr key={sub.id} className="hover:bg-white dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">
                      {(sub as any).ncf || sub.invoiceId.substring(0, 8) + '…'}
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={sub.status} /></td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-sm font-bold ${sub.retryCount > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                      {sub.retryCount}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-xs max-w-[240px] truncate ${
                    sub.status === 'accepted'
                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                      : sub.status === 'rejected' || sub.status === 'error'
                        ? 'text-red-500 font-medium'
                        : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {sub.responseMessage || '–'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatDate(sub.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Tab 3: Secuencias SACF
function SecuenciasTab() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [selectedSequence, setSelectedSequence] = useState<Sequence | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchSequences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/ecf/sequences');
      const data = await res.json();
      if (data.success) setSequences(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSequences();
    const fetchUserRole = async () => {
      try {
        const res = await fetch('/api/v1/auth/me');
        const data = await res.json();
        if (data.success && data.data?.user?.role) {
          setUserRole(data.data.user.role);
        }
      } catch (err) {
        console.error('Error fetching user role:', err);
      }
    };
    fetchUserRole();
  }, [fetchSequences]);

  const handleToggleStatus = async (seq: Sequence) => {
    const newStatus = seq.status === 'active' ? 'inactive' : 'active';
    setTogglingId(seq.id);
    try {
      const res = await fetch(`/api/v1/ecf/sequences/${seq.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Secuencia ${newStatus === 'active' ? 'activada' : 'desactivada'}`);
        fetchSequences();
      } else {
        toast.error(data.error?.message || 'Error al actualizar');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTogglingId(null);
    }
  };

  const getUsagePercent = (seq: Sequence) => {
    if (seq.maxSequence <= 0) return 0;
    return Math.min(100, Math.round((seq.usedCount / seq.maxSequence) * 100));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {sequences.length} secuencia{sequences.length !== 1 ? 's' : ''} configurada{sequences.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" /> Nueva Autorización
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : sequences.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400 bg-white rounded-2xl border border-gray-200">
          <Database className="h-12 w-12 opacity-30" />
          <p className="text-sm font-medium">No hay secuencias SACF configuradas</p>
          <button onClick={() => setShowModal(true)} className="text-primary text-sm font-semibold hover:underline">
            Crear primera secuencia
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sequences.map((seq) => {
            const usedPct = getUsagePercent(seq);
            const isNearLimit = usedPct >= 90;
            const expiry = seq.sequenceExpiry || (seq.expiryDate ? seq.expiryDate : '');
            const isExpiringSoon = expiry && (() => {
              const [dd, mm, yyyy] = expiry.split('-');
              const expDate = new Date(`${yyyy}-${mm}-${dd}`);
              return (expDate.getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000;
            })();

            return (
              <motion.div
                key={seq.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border p-5 bg-white shadow-sm ${isNearLimit
                  ? 'border-orange-300'
                  : 'border-outline-variant'
                  }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <ECFTypeBadge type={seq.ecfType} />
                    <span className="font-semibold text-[#003366] group-hover:text-primary transition-colors">
                      {seq.prefix}-{seq.ecfType}
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-primary">
                      {ECF_TYPE_LABELS[seq.ecfType] || `Tipo ${seq.ecfType}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {userRole === 'sistemas' && (
                      <button
                        onClick={() => {
                          setSelectedSequence(seq);
                          setShowEditModal(true);
                        }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-primary transition-colors"
                        title="Editar secuencia"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleStatus(seq)}
                      disabled={togglingId === seq.id}
                      className={`text-xs font-bold px-3 py-1 rounded-full transition-colors border ${seq.status === 'active'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                    >
                      {togglingId === seq.id ? '...' : seq.status === 'active' ? 'Activo' : 'Inactivo'}
                    </button>
                  </div>
                </div>

                <div className="text-xs text-gray-500 dark:text-gray-400 mb-3 space-y-1">
                  <div className="flex justify-between">
                    <span>Rango:</span>
                    <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">
                      {seq.prefix}{seq.ecfType}00000001 – {seq.prefix}{seq.ecfType}{seq.maxSequence.toString().padStart(8, '0')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Usados:</span>
                    <span className={`font-semibold ${isNearLimit ? 'text-orange-600' : 'text-gray-700 dark:text-gray-300'}`}>
                      {seq.usedCount} / {seq.maxSequence}
                    </span>
                  </div>
                  {expiry && (
                    <div className="flex justify-between">
                      <span>Vencimiento:</span>
                      <span className={`font-semibold ${isExpiringSoon ? 'text-orange-600' : 'text-gray-700 dark:text-gray-300'}`}>
                        {expiry}
                      </span>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${usedPct >= 90 ? 'bg-rose-600' : usedPct >= 70 ? 'bg-amber-500' : 'bg-emerald-600'
                      }`}
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-400">{usedPct}% usado</span>
                  <span className="text-xs text-gray-400">{seq.maxSequence - seq.usedCount} disponibles</span>
                </div>

                {isNearLimit && (
                  <div className="mt-3 flex items-center gap-2 text-orange-600 dark:text-orange-400 text-xs font-semibold bg-orange-50 dark:bg-orange-900/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    Secuencia al {usedPct}% — Solicita nueva autorización pronto
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <NewSequenceModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={fetchSequences}
      />

      {userRole === 'sistemas' && (
        <EditSequenceModal
          open={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedSequence(null);
          }}
          onSuccess={fetchSequences}
          sequence={selectedSequence}
        />
      )}
    </div>
  );
}

// Tab 4: Notas Crédito/Débito
function NotasTab() {
  const [notes, setNotes] = useState<CreditDebitNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      try {
        // Notes endpoint not yet built; use invoice list filtered by type 33/34
        const params = new URLSearchParams({ per_page: '50' });
        const types = filterType ? [filterType] : ['33', '34'];
        // Fetch both types
        const results = await Promise.all(
          types.map((t) =>
            fetch(`/api/v1/ecf?ecfType=${t}${filterStatus ? `&status=${filterStatus}` : ''}&per_page=50`)
              .then((r) => r.json())
              .then((d) => d.data || [])
          )
        );
        const combined = results.flat().sort(
          (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setNotes(combined as any);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchNotes();
  }, [filterType, filterStatus]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todos los tipos</option>
          <option value="33">e-33 Nota Débito</option>
          <option value="34">e-34 Nota Crédito</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="accepted">Aceptado</option>
          <option value="rejected">Rechazado</option>
        </select>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-6"><TableSkeleton rows={5} /></div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400 bg-white">
            <CreditCard className="h-12 w-12 opacity-30" />
            <p className="text-sm font-medium">No hay notas de crédito o débito</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">NCF Nota</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Monto</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {notes.map((note: any) => (
                <tr key={note.id} className="hover:bg-white dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">{note.ncf}</span>
                  </td>
                  <td className="px-4 py-3"><ECFTypeBadge type={note.ecfType} /></td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">
                    {formatCurrency(note.total)}
                  </td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={note.status} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatDate(note.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'comprobantes', label: 'Comprobantes', icon: <FileText className="h-4 w-4" /> },
  { id: 'cola', label: 'Cola DGII', icon: <Activity className="h-4 w-4" /> },
  { id: 'secuencias', label: 'Secuencias SACF', icon: <Database className="h-4 w-4" /> },
  { id: 'notas', label: 'Notas Crédito/Débito', icon: <CreditCard className="h-4 w-4" /> },
];

export default function ECFPage() {
  const router = useRouter();
  const { user, loading: rbacLoading } = useRbac();
  const [activeTab, setActiveTab] = useState('comprobantes');
  const [entorno, setEntorno] = useState<'TEST' | 'CERT' | 'PROD'>('TEST');

  useEffect(() => {
    if (!rbacLoading && user) {
      const role = (user.role || '').toLowerCase();
      if (role === 'facturacion') {
        toast.error('Acceso denegado. Redireccionando a Facturación.');
        router.replace('/dashboard/invoices');
      }
    }
  }, [user, rbacLoading, router]);

  useEffect(() => {
    if (rbacLoading || !user) return;
    const role = (user.role || '').toLowerCase();
    if (role === 'facturacion') return;

    // Detect entorno from company settings
    const fetchEntorno = async () => {
      try {
        const res = await fetch('/api/v1/company/settings');
        const data = await res.json();
        if (data.success) {
          const env = data.data?.msellerEntorno || data.data?.dgiiEnv;
          if (env === 'production') setEntorno('PROD');
          else if (env === 'cert') setEntorno('CERT');
          else setEntorno('TEST');
        }
      } catch (err) {
        // silently fail
      }
    };
    fetchEntorno();
  }, [user, rbacLoading]);

  const entornoConfig = {
    TEST: { label: 'ENTORNO DE PRUEBA', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700' },
    CERT: { label: 'CERTIFICACIÓN', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300 dark:border-blue-700' },
    PROD: { label: 'PRODUCCIÓN', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-300 dark:border-green-700' },
  };

  return (
    <div className="space-y-6">
      {/* Header Premium Light */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-4 border-b border-outline-variant"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-outline-variant shadow-sm relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-secondary/5 to-transparent" />
            <ShieldCheck className="h-6 w-6 text-primary relative z-10" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-primary tracking-tight font-display-lg">Central e-CF</h1>
            <p className="text-sm text-on-surface-variant mt-1">Gestión integral de facturación electrónica DGII</p>
          </div>
        </div>
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border shadow-sm transition-all ${entorno === 'TEST'
          ? 'bg-error-container text-on-error-container border-error/30 animate-pulse'
          : 'bg-white text-primary border-outline-variant'
          }`}>
          <ShieldCheck className="h-4 w-4" />
          <span className="tracking-wider uppercase">{entornoConfig[entorno].label}</span>
        </div>
      </motion.div>

      {/* Tabs Premium Light */}
      <div className="flex gap-2 border-b border-outline-variant px-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold transition-all ${activeTab === tab.id
              ? 'text-primary'
              : 'text-on-surface-variant hover:text-primary hover:bg-white/50 rounded-t-xl'
              }`}
          >
            {tab.icon}
            <span className="hidden sm:inline tracking-wide">{tab.label}</span>
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTabIndicator"
                className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-t-sm"
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.15 }}
          className="mt-6"
        >
          {activeTab === 'comprobantes' && <ComprobantesTab />}
          {activeTab === 'cola' && <ColaTab />}
          {activeTab === 'secuencias' && <SecuenciasTab />}
          {activeTab === 'notas' && <NotasTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
