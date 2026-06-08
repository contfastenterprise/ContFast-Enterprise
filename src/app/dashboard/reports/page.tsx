'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { PieChart, Download, FileText, Calendar, Building, BookOpen } from 'lucide-react';
import { toast } from 'sonner';

export default function ReportsPage() {
  const [dates, setDates] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const handleGeneratePdf = (type: string) => {
    if (!dates.start || !dates.end) {
      toast.error('Seleccione un rango de fechas válido');
      return;
    }
    
    // Open PDF in new tab
    const url = `/api/v1/reports/pdf?type=${type}&start=${dates.start}&end=${dates.end}`;
    window.open(url, '_blank');
  };

  return (
    <DashboardLayout>
      <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20">
        <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-end items-center shadow-inner">
           <span className="text-primary text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
             <PieChart className="h-3 w-3" /> Reportes Financieros
           </span>
        </div>

        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-[#003366] flex items-center gap-2">
                Reportes y Analíticas
              </h1>
              <p className="text-on-surface-variant/70 text-sm mt-1">
                Genera los estados financieros en formato PDF listo para auditoría.
              </p>
            </div>
          </div>

          {/* Global Date Filter */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-end gap-4">
            <div>
              <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3"/> Fecha Inicio</label>
              <input 
                type="date" 
                value={dates.start}
                onChange={e => setDates({...dates, start: e.target.value})}
                className="w-full md:w-48 border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3"/> Fecha Fin / Corte</label>
              <input 
                type="date" 
                value={dates.end}
                onChange={e => setDates({...dates, end: e.target.value})}
                className="w-full md:w-48 border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] text-sm"
              />
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
                className="w-full bg-[#003366] hover:bg-[#002244] text-primary font-bold py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2"
              >
                <Download className="w-4 h-4" /> Generar PDF
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
                className="w-full bg-[#C5A059] hover:bg-[#b08c4a] text-primary font-bold py-2.5 rounded-lg transition-colors flex justify-center items-center gap-2"
              >
                <Download className="w-4 h-4" /> Generar PDF
              </button>
            </div>

            {/* Upcoming Reports Placeholders */}
            <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center opacity-70">
              <BookOpen className="w-8 h-8 text-on-surface-variant mb-3" />
              <h3 className="font-bold text-on-surface-variant/80">Estado de Cuenta de Cliente</h3>
              <p className="text-xs text-on-surface-variant mt-1">Próximamente</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center opacity-70">
              <Building className="w-8 h-8 text-on-surface-variant mb-3" />
              <h3 className="font-bold text-on-surface-variant/80">Conciliación Bancaria</h3>
              <p className="text-xs text-on-surface-variant mt-1">Próximamente</p>
            </div>

          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}
