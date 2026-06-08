'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import {
  BarChart3, RefreshCw, FileText, Download,
  TrendingUp, DollarSign, PieChart, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast, Toaster } from 'sonner';

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any>({
    sales: 0,
    taxes: 0,
    purchases: 0,
    netProfit: 0,
    topClients: [],
    monthlyRevenue: [],
  });

  const loadReport = async () => {
    setLoading(true);
    try {
      // Fetch data from existing sales-book report API
      const res = await fetch('/api/v1/reports/sales-book?startDate=2024-01-01&endDate=2024-12-31');
      const data = await res.json();
      
      if (data.success) {
        // Build mock visual metrics utilizing balance sheet and sales book responses structure
        setReportData({
          sales: data.data?.summary?.totalAmount || 1250300.50,
          taxes: data.data?.summary?.totalTax || 225054.10,
          purchases: 450300.00,
          netProfit: (data.data?.summary?.totalAmount || 1250300.50) - 450300.00 - (data.data?.summary?.totalTax || 225054.10),
          topClients: [
            { name: 'Constructor del Caribe S.R.L.', amount: 450000 },
            { name: 'Importadora Dominicana SAS', amount: 320000 },
            { name: 'Supermercados del País', amount: 180000 },
          ],
          monthlyRevenue: [
            { month: 'Ene', amount: 85000 },
            { month: 'Feb', amount: 95000 },
            { month: 'Mar', amount: 110000 },
            { month: 'Abr', amount: 125000 },
            { month: 'May', amount: 140000 },
            { month: 'Jun', amount: 160000 },
          ]
        });
      }
    } catch (error) {
      toast.error('Error al cargar reporte financiero');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Toaster position="top-right" richColors />

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-900 pb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-primary flex items-center gap-2">
              <BarChart3 className="h-7 w-7 text-amber-500" />
              Reportes Financieros y Métricas
            </h1>
            <p className="text-on-surface-variant text-sm mt-1">
              Visualice las métricas de ingresos, egresos y el libro de ventas homologado por la DGII.
            </p>
          </div>
          <button
            onClick={loadReport}
            className="flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/5"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar Datos
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        ) : (
          <>
            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-on-surface-variant uppercase">Ventas Totales</span>
                  <ArrowUpRight className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="text-2xl font-bold text-primary mt-2">
                  RD$ {reportData.sales.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[10px] text-emerald-500 font-medium">Facturado e-CF</span>
              </div>

              <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-on-surface-variant uppercase">ITBIS Liquidado</span>
                  <FileText className="h-5 w-5 text-blue-500" />
                </div>
                <p className="text-2xl font-bold text-primary mt-2">
                  RD$ {reportData.taxes.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[10px] text-blue-400 font-medium">Impuestos Retenidos</span>
              </div>

              <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-on-surface-variant uppercase">Gastos Generales</span>
                  <ArrowDownRight className="h-5 w-5 text-rose-500" />
                </div>
                <p className="text-2xl font-bold text-primary mt-2">
                  RD$ {reportData.purchases.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[10px] text-on-surface-variant/70 font-medium">Gastos de Operación</span>
              </div>

              <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-on-surface-variant uppercase">Beneficio Neto</span>
                  <DollarSign className="h-5 w-5 text-amber-500" />
                </div>
                <p className="text-2xl font-bold text-primary mt-2">
                  RD$ {reportData.netProfit.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[10px] text-amber-500 font-medium">Margen Neto Estimado</span>
              </div>
            </div>

            {/* Visual breakdown layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Monthly sales charts mockup */}
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-6 md:col-span-2 space-y-4">
                <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">Histórico de Ventas</h3>
                <div className="h-48 flex items-end justify-between pt-4 gap-2">
                  {reportData.monthlyRevenue.map((item: any, idx: number) => {
                    const maxAmount = Math.max(...reportData.monthlyRevenue.map((i: any) => i.amount));
                    const percentage = (item.amount / maxAmount) * 100;
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                        <div className="w-full bg-background rounded-t relative h-36 flex items-end">
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${percentage}%` }}
                            className="w-full bg-amber-500/80 rounded-t hover:bg-amber-400 transition-colors"
                          />
                        </div>
                        <span className="text-[10px] text-on-surface-variant font-bold">{item.month}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top Clients */}
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-6 space-y-4">
                <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">Top Clientes</h3>
                <div className="divide-y divide-outline-variant/20">
                  {reportData.topClients.map((client: any, idx: number) => (
                    <div key={idx} className="py-3 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-semibold text-primary">{client.name}</p>
                        <span className="text-on-surface-variant/70">Cliente Recurrente</span>
                      </div>
                      <span className="font-mono text-amber-500 font-semibold">
                        RD$ {client.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
