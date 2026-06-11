'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/app/dashboard/layout';
import { ArrowLeft, Building2, Mail, Phone, ShieldCheck, FileText, CreditCard, DollarSign, RefreshCw, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface CustomerHistory {
  customer: {
    id: string;
    rncCedula: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  metrics: {
    totalInvoiced: number;
    currentBalance: number;
    totalPaid: number;
  };
  recentInvoices: any[];
  recentPayments: any[];
}

export default function CustomerHistoryPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<CustomerHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'facturas' | 'pagos'>('facturas');

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch(`/api/v1/customers/${id}/history`);
        const result = await res.json();
        
        if (result.success) {
          setData(result.data);
        } else {
          toast.error(result.error?.message || 'Error al cargar historial');
          router.push('/dashboard/customers');
        }
      } catch (error) {
        toast.error('Error de red');
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [id, router]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP'
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-500 text-xs font-semibold border border-emerald-500/20"><CheckCircle2 className="h-3 w-3" /> ACEPTADO</span>;
      case 'submitted': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-500/10 text-blue-500 text-xs font-semibold border border-blue-500/20"><Clock className="h-3 w-3" /> ENVIADO</span>;
      case 'rejected': return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-500/10 text-rose-500 text-xs font-semibold border border-rose-500/20"><AlertCircle className="h-3 w-3" /> RECHAZADO</span>;
      default: return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-500/10 text-on-surface-variant text-xs font-semibold border border-slate-500/20">{status.toUpperCase()}</span>;
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-[80vh] items-center justify-center max-w-7xl mx-auto w-full">
          <RefreshCw className="h-8 w-8 text-amber-500 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) return null;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 font-sans">
        
        {/* Navigation & Header */}
        <button 
          onClick={() => router.push('/dashboard/customers')}
          className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors text-sm font-semibold mb-2"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al Directorio
        </button>

        {/* Deep Navy Corporate Profile Header */}
        <div className="bg-[#001e40] rounded-2xl p-6 md:p-8 border border-[#003366] shadow-2xl relative overflow-hidden">
          {/* Gold Accent Glow */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#c5a059] rounded-full blur-[100px] opacity-20 pointer-events-none"></div>
          
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center relative z-10">
            <div className="h-20 w-20 rounded-2xl bg-[#003366] flex items-center justify-center border border-[#004883] shadow-inner text-[#c5a059]">
              <Building2 className="h-10 w-10" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-bold text-primary font-display mb-2">{data.customer.name}</h1>
              <div className="flex flex-wrap gap-4 text-sm text-[#a7c8ff]">
                <div className="flex items-center gap-1.5 bg-[#001122] px-3 py-1.5 rounded-lg border border-[#003366]">
                  <ShieldCheck className="h-4 w-4 text-[#c5a059]" />
                  <span className="font-mono">{data.customer.rncCedula}</span>
                </div>
                {data.customer.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-4 w-4 opacity-70" /> {data.customer.email}
                  </div>
                )}
                {data.customer.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-4 w-4 opacity-70" /> {data.customer.phone}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30">
            <div className="flex items-center gap-3 text-on-surface-variant mb-2">
              <div className="p-2 bg-surface-container-high/50 rounded-lg"><FileText className="h-5 w-5 text-blue-400" /></div>
              <h3 className="font-semibold text-sm">Total Facturado</h3>
            </div>
            <p className="text-2xl font-bold text-primary font-display">{formatCurrency(data.metrics.totalInvoiced)}</p>
          </motion.div>

          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30 relative overflow-hidden">
            {data.metrics.currentBalance > 0 && <div className="absolute top-0 right-0 w-2 h-full bg-amber-500"></div>}
            <div className="flex items-center gap-3 text-on-surface-variant mb-2">
              <div className="p-2 bg-amber-500/10 rounded-lg"><AlertCircle className="h-5 w-5 text-amber-500" /></div>
              <h3 className="font-semibold text-sm">Balance Actual</h3>
            </div>
            <p className={`text-2xl font-bold font-display ${data.metrics.currentBalance > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
              {formatCurrency(data.metrics.currentBalance)}
            </p>
          </motion.div>

          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/30">
            <div className="flex items-center gap-3 text-on-surface-variant mb-2">
              <div className="p-2 bg-emerald-500/10 rounded-lg"><DollarSign className="h-5 w-5 text-emerald-500" /></div>
              <h3 className="font-semibold text-sm">Total Pagado</h3>
            </div>
            <p className="text-2xl font-bold text-primary font-display">{formatCurrency(data.metrics.totalPaid)}</p>
          </motion.div>
        </div>

        {/* Content Tabs */}
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl overflow-hidden shadow-xl mt-6">
          <div className="flex border-b border-outline-variant/30">
            <button
              onClick={() => setActiveTab('facturas')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 font-semibold text-sm transition-colors relative ${activeTab === 'facturas' ? 'text-amber-500 bg-surface-container-high/50' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-high/30'}`}
            >
              <FileText className="h-4 w-4" /> Facturas e-CF
              {activeTab === 'facturas' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-amber-500"></div>}
            </button>
            <button
              onClick={() => setActiveTab('pagos')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 font-semibold text-sm transition-colors relative ${activeTab === 'pagos' ? 'text-amber-500 bg-surface-container-high/50' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-high/30'}`}
            >
              <CreditCard className="h-4 w-4" /> Historial de Pagos
              {activeTab === 'pagos' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-amber-500"></div>}
            </button>
          </div>

          <div className="p-0">
            {activeTab === 'facturas' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-background/50 border-b border-outline-variant/30 text-on-surface-variant text-xs uppercase tracking-wider">
                      <th className="p-4 font-semibold">Comprobante (e-NCF)</th>
                      <th className="p-4 font-semibold">Fecha</th>
                      <th className="p-4 font-semibold text-right">Monto</th>
                      <th className="p-4 font-semibold text-center">Estado DGII</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20/50">
                    {data.recentInvoices.length === 0 ? (
                      <tr><td colSpan={4} className="p-8 text-center text-on-surface-variant/70">No hay facturas registradas.</td></tr>
                    ) : (
                      data.recentInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-surface-container-high/30 transition-colors">
                          <td className="p-4 font-mono text-sm text-primary font-medium">{inv.ncf}</td>
                          <td className="p-4 text-sm text-on-surface-variant">{new Date(inv.date).toLocaleDateString('es-DO')}</td>
                          <td className="p-4 text-sm font-semibold text-primary text-right">{formatCurrency(inv.amount)}</td>
                          <td className="p-4 text-center">{getStatusBadge(inv.status)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'pagos' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-background/50 border-b border-outline-variant/30 text-on-surface-variant text-xs uppercase tracking-wider">
                      <th className="p-4 font-semibold">Referencia / Recibo</th>
                      <th className="p-4 font-semibold">Fecha</th>
                      <th className="p-4 font-semibold">Método</th>
                      <th className="p-4 font-semibold text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20/50">
                    {data.recentPayments.length === 0 ? (
                      <tr><td colSpan={4} className="p-8 text-center text-on-surface-variant/70">No hay pagos registrados.</td></tr>
                    ) : (
                      data.recentPayments.map((pay) => (
                        <tr key={pay.id} className="hover:bg-surface-container-high/30 transition-colors">
                          <td className="p-4 font-mono text-sm text-primary">{pay.reference || 'N/A'}</td>
                          <td className="p-4 text-sm text-on-surface-variant">{new Date(pay.date).toLocaleDateString('es-DO')}</td>
                          <td className="p-4 text-sm text-on-surface-variant uppercase">{pay.method}</td>
                          <td className="p-4 text-sm font-semibold text-emerald-400 text-right">+{formatCurrency(pay.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
