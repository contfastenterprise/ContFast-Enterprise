'use client';

import { useState, useEffect } from 'react';
import { 
  HandCoins, Search, Calendar, Filter, FileText, ArrowDownToLine, 
  Printer, ArrowUpRight, ArrowDownLeft, AlertCircle, RefreshCw, X
} from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip 
} from 'recharts';

import DashboardLayout from '@/app/dashboard/layout';
import Loading from '../../accounting/loading';

interface Customer {
  id: string;
  name: string;
  rncCedula: string | null;
}

interface StatementData {
  customer: Customer;
  summary: {
    creditLimit: number;
    creditAvailable: number;
    currentBalance: number;
    totalInvoiced: number;
    totalPaid: number;
    totalPending: number;
    totalOverdue: number;
    totalCreditNotes: number;
    totalDebitNotes: number;
    totalRetentions: number;
    totalAdvances: number;
    lastPurchaseDate: string | null;
    lastPaymentDate: string | null;
    avgPaymentDays: number;
    customerAgeDays: number;
    invoiceCount: number;
    avgInvoiceAmount: number;
  };
  aging: {
    notExpired: number;
    overdue1to30: number;
    overdue31to60: number;
    overdue61to90: number;
    overdueOver90: number;
  };
  movements: any[];
  pendingInvoices: any[];
}

const fmt = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);
};

export default function CustomerStatementPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [type, setType] = useState('all'); // all, credit, cash
  const [searchText, setSearchText] = useState('');

  // Data
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [statementData, setStatementData] = useState<StatementData | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoadingCustomers(true);
        const res = await fetch('/api/v1/customers?limit=200');
        const json = await res.json();
        if (res.ok) {
          setCustomers(json.data || []);
        } else {
          throw new Error(json.error?.message || 'Error al obtener clientes');
        }
      } catch (err: any) {
        console.error(err);
        toast.error(err.message);
      } finally {
        setLoadingCustomers(false);
      }
    };
    fetchCustomers();
  }, []);

  const fetchStatement = async (id: string = selectedCustomerId) => {
    if (!id) return;
    try {
      setLoadingStatement(true);
      const queryParams = new URLSearchParams();
      if (startDate) queryParams.append('startDate', startDate);
      if (endDate) queryParams.append('endDate', endDate);
      if (type !== 'all') queryParams.append('type', type);
      if (searchText) queryParams.append('search', searchText);

      const res = await fetch(`/api/v1/financial/statements/customers/${id}?${queryParams.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setStatementData(json.data);
      } else {
        throw new Error(json.error?.message || 'Error al cargar estado de cuenta');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message);
    } finally {
      setLoadingStatement(false);
    }
  };

  const handleCustomerSelect = (cust: Customer) => {
    setSelectedCustomerId(cust.id);
    setCustomerSearchQuery(cust.name);
    setIsDropdownOpen(false);
    fetchStatement(cust.id);
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setType('all');
    setSearchText('');
    setTimeout(() => fetchStatement(), 50);
  };

  const handlePrint = async () => {
    if (!selectedCustomerId) return;
    try {
      setPrinting(true);
      const res = await fetch(`/api/v1/financial/statements/customers/${selectedCustomerId}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, type, search: searchText }),
      });
      const json = await res.json();
      if (res.ok && json.url) {
        window.open(json.url, '_blank');
      } else {
        throw new Error(json.error?.message || 'Error al generar PDF');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message);
    } finally {
      setPrinting(false);
    }
  };

  const handleExportCSV = () => {
    if (!statementData || statementData.movements.length === 0) return;
    
    // Header Row
    const headers = ['Fecha', 'Documento', 'Tipo', 'Descripción', 'Débito', 'Crédito', 'Balance', 'Estado'];
    
    // Rows
    const rows = statementData.movements.map(m => [
      m.date,
      m.documentNumber,
      m.movementType,
      m.notes || '',
      m.debit,
      m.credit,
      m.balance,
      m.status
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Estado_Cuenta_${statementData.customer.name.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) || 
    (c.rncCedula && c.rncCedula.includes(customerSearchQuery))
  );

  // Aging Chart Data
  const agingData = statementData ? [
    { name: 'Corriente', Monto: statementData.aging.notExpired },
    { name: '1-30 días', Monto: statementData.aging.overdue1to30 },
    { name: '31-60 días', Monto: statementData.aging.overdue31to60 },
    { name: '61-90 días', Monto: statementData.aging.overdue61to90 },
    { name: '90+ días', Monto: statementData.aging.overdueOver90 },
  ] : [];

  return (
    <DashboardLayout>
      <div className="w-full space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-outline-variant/10 pb-5 gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <HandCoins className="text-primary-container w-7 h-7" /> Estado de Cuenta de Clientes (CxC)
            </h1>
            <p className="text-sm text-neutral-500">
              Visualice la ficha financiera, antigüedad de saldos y el libro auxiliar de movimientos de un cliente.
            </p>
          </div>
        </div>

        {/* Customer Select dropdown */}
        <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl p-5 space-y-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 block">Seleccione el Cliente</label>
          <div className="relative max-w-md">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  placeholder={loadingCustomers ? "Cargando clientes..." : "Buscar por nombre o RNC/Cédula..."}
                  disabled={loadingCustomers}
                  value={customerSearchQuery}
                  onChange={(e) => {
                    setCustomerSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  className="w-full pl-9 pr-4 py-2 border border-outline-variant/20 rounded-xl bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                />
                {customerSearchQuery && (
                  <button 
                    onClick={() => {
                      setCustomerSearchQuery('');
                      setSelectedCustomerId('');
                      setStatementData(null);
                      setIsDropdownOpen(true);
                    }}
                    className="absolute right-3 top-3 hover:text-neutral-700"
                  >
                    <X className="w-4 h-4 text-neutral-400" />
                  </button>
                )}
              </div>
            </div>

            {/* Dropdown list */}
            {isDropdownOpen && filteredCustomers.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-surface-bright border border-outline-variant/20 rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-outline-variant/10">
                {filteredCustomers.map((cust) => (
                  <div
                    key={cust.id}
                    onClick={() => handleCustomerSelect(cust)}
                    className="px-4 py-3 text-sm hover:bg-surface-container-low cursor-pointer flex justify-between"
                  >
                    <span className="font-semibold">{cust.name}</span>
                    <span className="text-xs text-neutral-500">{cust.rncCedula || 'Sin RNC'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Ficha Financiera & Statement Content */}
        {loadingStatement ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            <span className="text-sm text-neutral-500">Cargando Ficha Financiera del Cliente...</span>
          </div>
        ) : statementData ? (
          <div className="space-y-6">
            {/* Top Summary Blocks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Balance Card */}
              <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Saldo Pendiente Actual</div>
                <div className="text-2xl font-bold text-primary">{fmt(statementData.summary.currentBalance)}</div>
                <div className="text-xs text-neutral-500">
                  {fmt(statementData.summary.totalOverdue)} vencido
                </div>
              </div>

              {/* Credit Limit Card */}
              <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Límite de Crédito</div>
                <div className="text-2xl font-bold">{fmt(statementData.summary.creditLimit)}</div>
                <div className="text-xs text-neutral-500">
                  Crédito disponible: <span className="font-semibold text-emerald-600">{fmt(statementData.summary.creditAvailable)}</span>
                </div>
              </div>

              {/* Invoiced vs Paid Card */}
              <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Facturación Acumulada</div>
                <div className="text-2xl font-bold">{fmt(statementData.summary.totalInvoiced)}</div>
                <div className="text-xs text-neutral-500">
                  Cobrado: <span className="font-semibold text-emerald-600">{fmt(statementData.summary.totalPaid)}</span>
                </div>
              </div>

              {/* Average Collection Period Card */}
              <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Periodo Promedio de Cobro</div>
                <div className="text-2xl font-bold">{statementData.summary.avgPaymentDays} días</div>
                <div className="text-xs text-neutral-500">
                  {statementData.summary.invoiceCount} facturas cobradas en promedio
                </div>
              </div>
            </div>

            {/* Middle Row: Aging of Balances Chart & Additional Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Aging Chart */}
              <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl p-5 lg:col-span-2 space-y-4">
                <h3 className="font-semibold text-sm flex items-center gap-2 text-neutral-700">
                  Antigüedad de Saldos Vencidos (CxC)
                </h3>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agingData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="name" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                      <Tooltip formatter={(value) => fmt(value as number)} />
                      <Bar dataKey="Monto" fill="#ba841b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Financial Stats */}
              <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl p-5 space-y-4">
                <h3 className="font-semibold text-sm flex items-center gap-2 text-neutral-700">
                  Estadísticas de Cuenta
                </h3>
                <div className="space-y-3 divide-y divide-outline-variant/10 text-xs">
                  <div className="flex justify-between py-2">
                    <span className="text-neutral-500">Última Venta:</span>
                    <span className="font-semibold">{statementData.summary.lastPurchaseDate ? new Date(statementData.summary.lastPurchaseDate + 'T00:00:00').toLocaleDateString('es-DO') : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-neutral-500">Último Pago:</span>
                    <span className="font-semibold">{statementData.summary.lastPaymentDate ? new Date(statementData.summary.lastPaymentDate + 'T00:00:00').toLocaleDateString('es-DO') : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-neutral-500">Notas de Crédito Recibidas:</span>
                    <span className="font-semibold text-rose-600">{fmt(statementData.summary.totalCreditNotes)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-neutral-500">Retenciones Fiscales (ITBIS/ISR):</span>
                    <span className="font-semibold text-primary">{fmt(statementData.summary.totalRetentions)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-neutral-500">Antigüedad del Cliente:</span>
                    <span className="font-semibold">{statementData.summary.customerAgeDays} días de registro</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Transactions Ledger Movements Table */}
            <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-outline-variant/10 pb-4">
                <h3 className="font-semibold text-sm flex items-center gap-2 text-neutral-700">
                  Libro Auxiliar de Movimientos Financieros
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button 
                    onClick={handlePrint}
                    disabled={printing}
                    className="flex items-center gap-2 px-3 py-1.5 border border-outline-variant/20 rounded-xl text-xs hover:bg-surface-container-low transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" /> {printing ? 'Generando PDF...' : 'Imprimir PDF'}
                  </button>
                  <button 
                    onClick={handleExportCSV}
                    className="flex items-center gap-2 px-3 py-1.5 border border-outline-variant/20 rounded-xl text-xs hover:bg-surface-container-low transition-colors"
                  >
                    <ArrowDownToLine className="w-3.5 h-3.5" /> Exportar CSV
                  </button>
                </div>
              </div>

              {/* Filters Block */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-surface-container-low/40 p-4 rounded-xl text-xs">
                <div className="space-y-1">
                  <label className="text-neutral-500 font-semibold block">Fecha Inicio</label>
                  <input 
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full p-2 border border-outline-variant/20 rounded-lg bg-surface-bright focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-neutral-500 font-semibold block">Fecha Fin</label>
                  <input 
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full p-2 border border-outline-variant/20 rounded-lg bg-surface-bright focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-neutral-500 font-semibold block">Tipo de Venta</label>
                  <select 
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full p-2 border border-outline-variant/20 rounded-lg bg-surface-bright focus:outline-none"
                  >
                    <option value="all">Todas las ventas (Contado y Crédito)</option>
                    <option value="credit">Ventas a Crédito</option>
                    <option value="cash">Ventas al Contado</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-neutral-500 font-semibold block">Buscar en Movimiento</label>
                  <input 
                    type="text"
                    placeholder="Buscar NCF, recibo..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="w-full p-2 border border-outline-variant/20 rounded-lg bg-surface-bright focus:outline-none"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button 
                    onClick={() => fetchStatement()}
                    className="flex-1 py-2 bg-primary text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Filtrar
                  </button>
                  <button 
                    onClick={clearFilters}
                    className="py-2 px-3 border border-outline-variant/20 rounded-lg hover:bg-surface-bright"
                    title="Limpiar filtros"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              {/* Movements Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/10 text-xs text-neutral-500 uppercase">
                      <th className="py-2">Fecha</th>
                      <th className="py-2">Nº Doc / Ref</th>
                      <th className="py-2">Tipo</th>
                      <th className="py-2">Detalles / Notas</th>
                      <th className="py-2 text-right text-indigo-700">Débito (+)</th>
                      <th className="py-2 text-right text-emerald-700">Crédito (-)</th>
                      <th className="py-2 text-right">Balance</th>
                      <th className="py-2 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/5 text-sm">
                    {statementData.movements.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-neutral-500">No hay movimientos financieros para este cliente con los filtros aplicados.</td>
                      </tr>
                    ) : (
                      statementData.movements.map((m) => {
                        const isInvoice = m.movementType === 'invoice' || m.movementType === 'debit_note';
                        return (
                          <tr key={m.id} className="hover:bg-surface-container-low/30">
                            <td className="py-3 text-xs">{new Date(m.date + 'T00:00:00').toLocaleDateString('es-DO')}</td>
                            <td className="py-3 font-mono text-xs font-semibold">{m.documentNumber}</td>
                            <td className="py-3 text-xs">
                              <span className={clsx(
                                "px-2 py-0.5 rounded-full font-bold text-[10px]",
                                m.movementType === 'invoice' && "bg-blue-500/10 text-blue-700",
                                m.movementType === 'receipt' && "bg-emerald-500/10 text-emerald-700",
                                m.movementType === 'credit_note' && "bg-red-500/10 text-red-700",
                                m.movementType === 'debit_note' && "bg-indigo-500/10 text-indigo-700",
                                m.movementType === 'retention' && "bg-amber-500/10 text-amber-700"
                              )}>
                                {m.movementType.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-3 text-xs text-neutral-500 max-w-xs truncate" title={m.notes}>{m.notes}</td>
                            <td className="py-3 text-right font-mono font-bold text-indigo-700">
                              {m.debit > 0 ? `+${fmt(m.debit)}` : '-'}
                            </td>
                            <td className="py-3 text-right font-mono font-bold text-emerald-700">
                              {m.credit > 0 ? `-${fmt(m.credit)}` : '-'}
                            </td>
                            <td className="py-3 text-right font-mono font-bold text-neutral-800 dark:text-neutral-200">
                              {fmt(m.balance)}
                            </td>
                            <td className="py-3 text-center">
                              <span className={clsx(
                                "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                                m.status === 'active' ? "bg-emerald-500/10 text-emerald-700" : "bg-neutral-500/10 text-neutral-600"
                              )}>
                                {m.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-surface-bright/70 border border-outline-variant/20 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4">
            <AlertCircle className="w-12 h-12 text-neutral-400" />
            <h3 className="text-base font-bold">Sin cliente seleccionado</h3>
            <p className="text-xs text-neutral-500 max-w-sm">
              Seleccione un cliente del buscador superior para poder visualizar su estado de cuenta e historial financiero.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
