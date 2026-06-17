'use client';

import { useState, useEffect } from 'react';
import { PieChart, Download, FileText, Calendar, Building, BookOpen, Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ReportsPage() {
  const [dates, setDates] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [warehouseId, setWarehouseId] = useState('all');
  const [warehouses, setWarehouses] = useState<{id: string, name: string}[]>([]);
  const [customers, setCustomers] = useState<{id: string, name: string, rncCedula: string}[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [loadingType, setLoadingType] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/warehouses').then(res => res.json()).then(data => {
      if (data.success && data.data) setWarehouses(data.data);
    }).catch(() => {});
    
    fetch('/api/v1/customers').then(res => res.json()).then(data => {
      if (data.success && data.data) {
        setCustomers(data.data);
        if (data.data.length > 0) setSelectedCustomerId(data.data[0].id);
      }
    }).catch(() => {});
  }, []);

  const handleGeneratePdf = async (type: string) => {
    if (!dates.start || !dates.end) {
      toast.error('Seleccione un rango de fechas válido');
      return;
    }

    setLoadingType(type);
    try {
      // Usar fetch para que las cookies de sesión (HttpOnly) se envíen correctamente.
      // window.open() en una pestaña nueva NO envía cookies SameSite=Strict.
      let url = `/api/v1/reports/pdf?type=${type}&start=${dates.start}&end=${dates.end}${warehouseId !== 'all' ? `&warehouseId=${warehouseId}` : ''}`;
      
      if (type === 'ar_statement') {
        if (!selectedCustomerId) {
          toast.error('Debe seleccionar un cliente');
          setLoadingType(null);
          return;
        }
        url += `&customerId=${selectedCustomerId}`;
      }

      const res = await fetch(url, { credentials: 'include' });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: 'Error desconocido' } }));
        throw new Error(err?.error?.message || `Error ${res.status}`);
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      // Abrir en nueva pestaña y liberar la URL temporal tras la apertura
      const a = document.createElement('a');
      a.href = objectUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);

      toast.success('PDF generado correctamente');
    } catch (err: any) {
      toast.error('Error al generar PDF', { description: err.message });
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 font-sans">
      {/* Header section with title and CTA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary font-display flex items-center gap-2">
            <PieChart className="h-8 w-8 text-[#c5a059]" />
            Reportes y Analíticas
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Genera los estados financieros en formato PDF listo para auditoría.
          </p>
        </div>
      </div>

        {/* Global Date Filter */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-end gap-4">
          <div>
            <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3" /> Fecha Inicio</label>
            <input
              type="date"
              value={dates.start}
              onChange={e => setDates({ ...dates, start: e.target.value })}
              className="w-full md:w-48 border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3" /> Fecha Fin / Corte</label>
            <input
              type="date"
              value={dates.end}
              onChange={e => setDates({ ...dates, end: e.target.value })}
              className="w-full md:w-48 border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Building2 className="w-3 h-3" /> Almacén</label>
            <select
              value={warehouseId}
              onChange={e => setWarehouseId(e.target.value)}
              className="w-full md:w-48 border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] text-sm"
            >
              <option value="all">Todos los Almacenes</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="ml-auto text-xs text-on-surface-variant font-medium">
            * Estos filtros aplicarán a todos los reportes generados a continuación.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">

          {/* Income Statement Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#003366]" />
            <div className="flex items-center gap-3 mb-2">
              <FileText className="w-6 h-6 text-[#003366]" />
              <h3 className="font-bold text-lg text-[#003366]">Estado de Resultados (P&L)</h3>
            </div>
            <p className="text-sm text-on-surface-variant/70 mb-6 flex-grow">
              Detalle de Ingresos, Costos de Venta y Gastos Operativos. Calcula la Utilidad Bruta y Neta del periodo seleccionado.
            </p>
            <button
              onClick={() => handleGeneratePdf('income_statement')}
              disabled={loadingType !== null}
              className="w-full bg-[#003366] hover:bg-[#002244] text-white font-bold py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingType === 'income_statement' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generando PDF...</>
              ) : (
                <><Download className="w-4 h-4" /> Generar PDF</>
              )}
            </button>
          </div>

          {/* Balance Sheet Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#C5A059]" />
            <div className="flex items-center gap-3 mb-2">
              <Building className="w-6 h-6 text-[#C5A059]" />
              <h3 className="font-bold text-lg text-[#003366]">Balance General</h3>
            </div>
            <p className="text-sm text-on-surface-variant/70 mb-6 flex-grow">
              Estado de la situación financiera. Refleja todos los Activos, Pasivos y el Capital de la empresa a la fecha de corte seleccionada.
            </p>
            <button
              onClick={() => handleGeneratePdf('balance_sheet')}
              disabled={loadingType !== null}
              className="w-full bg-[#C5A059] hover:bg-[#b08c4a] text-primary font-bold py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingType === 'balance_sheet' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generando PDF...</>
              ) : (
                <><Download className="w-4 h-4" /> Generar PDF</>
              )}
            </button>
          </div>
          {/* AR Statement Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#10b981]" />
            <div className="flex items-center gap-3 mb-2">
              <BookOpen className="w-6 h-6 text-[#10b981]" />
              <h3 className="font-bold text-lg text-[#003366]">Estado de Cuentas por Cliente</h3>
            </div>
            <p className="text-sm text-on-surface-variant/70 mb-4 flex-grow">
              Genera un reporte detallado de las facturas pendientes y balances adeudados de un cliente específico.
            </p>
            
            <div className="mb-4">
              <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5 flex items-center gap-1">Cliente</label>
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#10b981] text-sm"
              >
                {customers.length === 0 && <option value="">Cargando clientes...</option>}
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => handleGeneratePdf('ar_statement')}
              disabled={loadingType !== null || !selectedCustomerId}
              className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingType === 'ar_statement' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generando PDF...</>
              ) : (
                <><Download className="w-4 h-4" /> Generar PDF</>
              )}
            </button>
          </div>

          {/* Formato 606 Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-600" />
            <div className="flex items-center gap-3 mb-2">
              <FileText className="w-6 h-6 text-blue-600" />
              <h3 className="font-bold text-lg text-blue-900">Formato 606 (Compras y Gastos)</h3>
            </div>
            <p className="text-sm text-on-surface-variant/70 mb-6 flex-grow">
              Genera y exporta el archivo en formato TXT requerido por la DGII para el reporte mensual de compras y gastos.
            </p>
            <a
              href="/dashboard/reports/606"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2"
            >
              <FileText className="w-4 h-4" /> Ver Reporte 606
            </a>
          </div>
          {/* Formato 607 Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 w-1 h-full bg-green-600" />
            <div className="flex items-center gap-3 mb-2">
              <FileText className="w-6 h-6 text-green-600" />
              <h3 className="font-bold text-lg text-green-900">Formato 607 (Ventas e Ingresos)</h3>
            </div>
            <p className="text-sm text-on-surface-variant/70 mb-6 flex-grow">
              Consulta tu libro de ventas e-CF y exporta el archivo TXT resumen mensual equivalente al formato 607.
            </p>
            <a
              href="/dashboard/reports/607"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2"
            >
              <FileText className="w-4 h-4" /> Ver Reporte 607
            </a>
          </div>

          {/* Conciliación Bancaria Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#3a5f94]" />
            <div className="flex items-center gap-3 mb-2">
              <Building className="w-6 h-6 text-[#3a5f94]" />
              <h3 className="font-bold text-lg text-[#003366]">Conciliación Bancaria</h3>
            </div>
            <p className="text-sm text-on-surface-variant/70 mb-6 flex-grow">
              Compara el saldo de tus extractos bancarios con el balance registrado en libros. Identifica cheques y depósitos en tránsito para asentar periodos conciliados.
            </p>
            <a
              href="/dashboard/reports/bank-reconciliation"
              className="w-full bg-[#3a5f94] hover:bg-[#2c4970] text-white font-bold py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2 text-center text-sm"
            >
              <Building className="w-4 h-4" /> Ir a Conciliación Bancaria
            </a>
          </div>

        </div>

    </div>
  );
}
