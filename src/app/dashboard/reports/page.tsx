'use client';

import { useState, useEffect } from 'react';
import { PieChart, Download, FileText, Building, BookOpen, Loader2, Building2, TrendingUp, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import DateRangePicker from '@/components/ui/date-range-picker';
import { CustomerAutocomplete } from '@/components/ui/customer-autocomplete';

export default function ReportsPage() {
  const [dates, setDates] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [warehouseId, setWarehouseId] = useState('all');
  const [warehouses, setWarehouses] = useState<{id: string, name: string}[]>([]);
  const [customers, setCustomers] = useState<{id: string, name: string, rncCedula: string}[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [loadingType, setLoadingType] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/warehouses').then(res => res.json()).then(data => {
      if (data.success && data.data) setWarehouses(data.data);
    }).catch(() => {});
    fetch('/api/v1/customers').then(res => res.json()).then(data => {
      if (data.success && data.data) {
        setCustomers(data.data);
      }
    }).catch(() => {});
  }, []);

  const handleGeneratePdf = async (type: string) => {
    if (!dates.start || !dates.end) { toast.error('Seleccione un rango de fechas válido'); return; }
    setLoadingType(type);
    try {
      let url = `/api/v1/reports/pdf?type=${type}&start=${dates.start}&end=${dates.end}${warehouseId !== 'all' ? `&warehouseId=${warehouseId}` : ''}`;
      if (type === 'ar_statement') {
        if (!selectedCustomerId) { toast.error('Debe seleccionar un cliente'); setLoadingType(null); return; }
        url += `&customerId=${selectedCustomerId}`;
      }
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: 'Error desconocido' } }));
        throw new Error(err?.error?.message || `Error ${res.status}`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      toast.success('PDF generado correctamente');
    } catch (err: any) {
      toast.error('Error al generar PDF', { description: err.message });
    } finally {
      setLoadingType(null);
    }
  };

  const PdfCard = ({ color, icon: Icon, title, description, type }: {
    color: string; icon: any; title: string; description: string; type: string;
  }) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col h-full">
      <div className="w-full h-1 flex-shrink-0" style={{ backgroundColor: color }} />
      <div className="flex flex-col flex-1 gap-2 px-4 pt-3 pb-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 flex-shrink-0" style={{ color }} />
          <p className="text-sm font-bold text-slate-800 leading-tight">{title}</p>
        </div>
        <p className="text-[10px] text-slate-400 leading-snug flex-1">{description}</p>
        <div className="flex justify-end pt-1">
          <button
            onClick={() => handleGeneratePdf(type)}
            disabled={loadingType !== null}
            className="flex items-center gap-2 bg-[#C5A059] hover:bg-[#b08c4a] text-slate-950 px-4 py-2 h-9 rounded-lg font-bold shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
          >
            {loadingType === type ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            PDF
          </button>
        </div>
      </div>
    </div>
  );

  const LinkCard = ({ color, icon: Icon, title, description, href }: {
    color: string; icon: any; title: string; description: string; href: string;
  }) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col h-full">
      <div className="w-full h-1 flex-shrink-0" style={{ backgroundColor: color }} />
      <div className="flex flex-col flex-1 gap-2 px-4 pt-3 pb-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 flex-shrink-0" style={{ color }} />
          <p className="text-sm font-bold text-slate-800 leading-tight">{title}</p>
        </div>
        <p className="text-[10px] text-slate-400 leading-snug flex-1">{description}</p>
        <div className="flex justify-end pt-1">
          <a
            href={href}
            className="h-7 px-3 text-[10px] font-bold rounded-lg text-white transition-colors flex items-center gap-1"
            style={{ backgroundColor: color }}
          >
            <ExternalLink className="w-3 h-3" /> Abrir
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4 font-sans">
      <div className="flex items-center gap-2">
        <PieChart className="h-6 w-6 text-[#c5a059]" />
        <div>
          <h1 className="text-xl font-bold text-slate-800 leading-tight">Reportes y Analiticas</h1>
          <p className="text-[11px] text-slate-400">Genera estados financieros en PDF listos para auditoria.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Periodo</label>
          <div className="w-64">
            <DateRangePicker from={dates.start} to={dates.end} onChange={({ from, to }) => setDates({ start: from, end: to })} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Building2 className="w-3 h-3" /> Almacen
          </label>
          <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="h-8 px-3 text-xs rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#c5a059]">
            <option value="all">Todos</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <p className="text-[10px] text-amber-500 ml-auto italic font-semibold">* Aplica a todos los reportes</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <PdfCard color="#003366" icon={FileText} title="Estado de Resultados (P&L)" description="Ingresos, Costos de Venta y Gastos Operativos. Calcula la Utilidad Bruta y Neta del periodo." type="income_statement" />
        <PdfCard color="#C5A059" icon={Building} title="Balance General" description="Situacion financiera: Activos, Pasivos y Capital a la fecha de corte seleccionada." type="balance_sheet" />
        <PdfCard color="#7c3aed" icon={TrendingUp} title="Compras vs Ventas" description="Reporte comparativo de utilidad bruta: ingresos por ventas menos compras y gastos del periodo." type="sales_vs_purchases" />

        {/* Estado de Cuentas por Cliente */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col h-full">
          <div className="w-full h-1 flex-shrink-0 bg-emerald-500" />
          <div className="flex flex-col flex-1 gap-2 px-4 pt-3 pb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 flex-shrink-0 text-emerald-500" />
              <p className="text-sm font-bold text-slate-800 leading-tight">Estado de Cuentas por Cliente</p>
            </div>
            <p className="text-[10px] text-slate-400 leading-snug">Facturas pendientes y balances adeudados de un cliente.</p>
            <div className="flex-1">
              <CustomerAutocomplete
                dbCustomers={customers}
                customerId={selectedCustomerId}
                customerName={selectedCustomerName}
                onSelect={(c) => {
                  setSelectedCustomerId(c.id);
                  setSelectedCustomerName(c.name);
                }}
                onClear={() => {
                  setSelectedCustomerId('');
                  setSelectedCustomerName('');
                }}
                placeholder="Buscar cliente..."
              />
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={() => handleGeneratePdf('ar_statement')}
                disabled={!selectedCustomerId || loadingType !== null}
                className="flex items-center gap-2 bg-[#C5A059] hover:bg-[#b08c4a] text-slate-950 px-4 py-2 h-9 rounded-lg font-bold shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
              >
                {loadingType === 'ar_statement' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                PDF
              </button>
            </div>
          </div>
        </div>

        <LinkCard color="#2563eb" icon={FileText} title="Formato 606 - Compras y Gastos" description="Archivo TXT para el reporte mensual de compras y gastos ante la DGII." href="/dashboard/reports/606" />
        <LinkCard color="#16a34a" icon={FileText} title="Formato 607 - Ventas e Ingresos" description="Libro de ventas e-CF y exportacion TXT del resumen mensual 607." href="/dashboard/reports/607" />
        <LinkCard color="#3a5f94" icon={Building} title="Conciliacion Bancaria" description="Compara extractos bancarios con el balance en libros. Identifica cheques y depositos en transito." href="/dashboard/reports/bank-reconciliation" />
      </div>
    </div>
  );
}
