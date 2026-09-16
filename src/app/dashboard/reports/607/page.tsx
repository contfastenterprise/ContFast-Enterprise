'use client';

import { useState, useEffect } from 'react';

interface InvoiceSale {
  id: string;
  ncf: string;
  ecfType: string;
  status: string;
  subtotal: number;
  discount: number;
  totalTaxes: number;
  total: number;
  createdAt: string;
  customerName?: string;
  customerRnc?: string;
}

import { FileText, Download, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { motivoDeCarga } from '@/components/ui/estado-carga';
import { formatDateDisplay, ultimoDiaDelMes } from '@/utils/fechasLocales';
import { vaEnElDetalle607, UMBRAL_FACTURA_CONSUMO_607, type ResumenFacturasConsumo607 } from '@/services/dgii/formato607';

const RESUMEN_VACIO: ResumenFacturasConsumo607 = { cantidad: 0, montoFacturado: 0, itbisFacturado: 0, total: 0 };

export default function Report607() {
  const [period, setPeriod] = useState<string>(() => {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${month}`;
  });
  const [invoices, setInvoices] = useState<InvoiceSale[]>([]);
  const [totals, setTotals] = useState({ subtotal: 0, itbis: 0, total: 0 });
  const [resumenConsumo, setResumenConsumo] = useState<ResumenFacturasConsumo607>(RESUMEN_VACIO);

  const fetchSales = async () => {
    try {
      // El fin de mes se armaba con `new Date(anio, mes, 0).toISOString()`, que
      // es el ultimo dia en hora LOCAL pasado a UTC: al este de Greenwich se
      // corre un dia y el 607 perdia el ultimo dia del mes. Aqui no hay husos.
      const end = ultimoDiaDelMes(period);
      if (!end) return;
      const start = `${end.slice(0, 8)}01`;

      const res = await fetch(`/api/v1/reports/sales-book?start_date=${start}&end_date=${end}`);
      const data = await res.json();
      if (data.success && data.data) {
        setInvoices(data.data.invoices || []);
        setTotals({
          subtotal: data.data.summary.subtotal || 0,
          itbis: data.data.summary.itbis || 0,
          total: data.data.summary.total || 0,
        });
        setResumenConsumo(data.data.resumenFacturasConsumo || RESUMEN_VACIO);
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [period]);

  const exportTxt = async () => {
    try {
      // Antes preguntaba a `auth/me` de que empresa era, para devolverselo a
      // una ruta que ya lo sabia. Ese rodeo era ademas un punto de fallo
      // silencioso: si `auth/me` no traia `companyId`, la excepcion se iba a
      // la consola y el boton no hacia nada visible.
      //
      // Y `res.blob()` no mira el estado: un 403 o un 500 se descargaban como
      // si fueran el fichero, con el error dentro. Un TXT del 607 con una
      // pagina de error dentro es lo que se le remite a la DGII.
      const res = await fetch(`/api/v1/reports/607/txt?period=${period}`);
      if (!res.ok) {
        const detalle = await res.json().catch(() => null);
        toast.error(motivoDeCarga(null, detalle?.error?.message) || 'No se pudo generar el TXT del 607');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // El nombre lo pone el servidor (lote 142): el de la herramienta de la
      // DGII, DGII_F_607_<RNC>_<AAAAMM>.TXT. Aqui se pisaba con uno propio.
      const disposicion = res.headers.get('Content-Disposition') || '';
      a.download = /filename="([^"]+)"/.exec(disposicion)?.[1] || `607_${period}.txt`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(motivoDeCarga(error));
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 font-sans">
      
      {/* Header section with title and CTA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary font-display flex items-center gap-2">
            <FileText className="h-8 w-8 text-[#c5a059]" />
            Reporte ITBIS 607 - Ventas
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">Libro de ventas e ingresos para la DGII.</p>
        </div>
      </div>

      {/* Global Filter */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-end gap-4">
        <div>
          <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3" /> Periodo</label>
          <input
            type="month"
            value={period}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPeriod(e.target.value)}
            className="w-full md:w-48 border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] text-sm"
          />
        </div>
        <button
          onClick={exportTxt}
          className="flex items-center justify-center gap-2 bg-[#10b981] hover:bg-[#059669] text-white px-5 py-2 rounded-lg font-bold text-sm transition shadow-md"
        >
          <Download className="h-4 w-4" /> Exportar TXT 607
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-slate-500 text-sm font-semibold mb-1">Subtotal (Gravado + Exento)</p>
          <p className="text-3xl font-bold text-[#003366] font-display">{(totals?.subtotal || 0).toFixed(2)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-slate-500 text-sm font-semibold mb-1">ITBIS Facturado</p>
          <p className="text-3xl font-bold text-[#003366] font-display">{(totals?.itbis || 0).toFixed(2)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-slate-500 text-sm font-semibold mb-1">Monto Total</p>
          <p className="text-3xl font-bold text-[#003366] font-display">{(totals?.total || 0).toFixed(2)}</p>
        </div>
      </div>

      {/* Resumen General de Facturas de Consumo (lote 143). NG 07-2018, art. 4:
          las de consumo por debajo del umbral NO van en el TXT; su total se
          declara en este modulo de la Oficina Virtual, y sin estas cifras esas
          ventas desaparecian de la declaracion. */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <p className="text-[#003366] font-bold">Resumen General de Facturas de Consumo (Oficina Virtual)</p>
        <p className="text-slate-500 text-xs mt-1 mb-4">
          Las facturas de consumo de menos de RD$ {UMBRAL_FACTURA_CONSUMO_607.toLocaleString('es-DO')} no van en el TXT del 607.
          Al remitirlo, complete este módulo con estas cifras (incluyen todas las facturas de consumo del período).
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><p className="text-slate-500 text-xs font-semibold">Cantidad de NCF</p><p className="text-xl font-bold text-[#003366] font-mono">{resumenConsumo.cantidad}</p></div>
          <div><p className="text-slate-500 text-xs font-semibold">Monto facturado</p><p className="text-xl font-bold text-[#003366] font-mono">{resumenConsumo.montoFacturado.toFixed(2)}</p></div>
          <div><p className="text-slate-500 text-xs font-semibold">ITBIS facturado</p><p className="text-xl font-bold text-[#003366] font-mono">{resumenConsumo.itbisFacturado.toFixed(2)}</p></div>
          <div><p className="text-slate-500 text-xs font-semibold">Total</p><p className="text-xl font-bold text-[#003366] font-mono">{resumenConsumo.total.toFixed(2)}</p></div>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[#003366] text-xs uppercase font-bold border-b border-slate-200">
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">NCF</th>
                <th className="px-6 py-4">Cliente (RNC)</th>
                <th className="px-6 py-4 text-right">Subtotal</th>
                <th className="px-6 py-4 text-right">ITBIS</th>
                <th className="px-6 py-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="text-sm text-slate-700 divide-y divide-slate-100">
              {!invoices || invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No hay ventas registradas para este periodo.
                  </td>
                </tr>
              ) : (
                invoices.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">{formatDateDisplay(e.createdAt)}</td>
                    <td className="px-6 py-4 font-mono">
                      {e.ncf}
                      {!vaEnElDetalle607(e) && <span className="block text-[10px] font-sans text-slate-400">Solo en el resumen de consumo</span>}
                    </td>
                    <td className="px-6 py-4">
                      {e.customerName || 'Consumidor Final'} {e.customerRnc ? <span className="text-xs text-slate-400 block">{e.customerRnc}</span> : ''}
                    </td>
                    <td className="px-6 py-4 text-right font-mono">{Number(e.subtotal || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-mono">{Number(e.totalTaxes || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-mono">{Number(e.total || 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
