'use client';

import { useState, useEffect } from 'react';
import { 
  RefreshCw, Search, Plus, Save, Trash2, Box, Store, Banknote, Calendar, 
  Tag, FileText, CheckSquare, Square, Filter, ChevronRight, Eye, Info, ListFilter,
  DollarSign, ArrowUpRight, ShoppingCart, Activity, Printer, Clock, AlertTriangle,
  Camera, Scan
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { roundMoney } from '@/utils/calculos';
import InvoiceImageUploader from '@/components/InvoiceImageUploader';
import { OcrInvoiceData } from '@/utils/ocrParser';
import DateRangePicker from '@/components/ui/date-range-picker';

function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFirstDayOfMonthString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

interface Product { id: string; name: string; sku: string; cost: string; }
interface Supplier { id: string; name: string; rnc: string; }
interface Warehouse { id: string; name: string; }
interface Expense {
  id: string;
  companyId: string;
  warehouseId: string | null;
  supplierId: string | null;
  expenseType: string;
  isMinorExpense: boolean;
  ncf: string | null;
  issueDate: string;
  paymentDate: string | null;
  amount: string;
  itbis: string;
  itbisRetained: string;
  isrRetained: string;
  isc: string;
  otherTaxes: string;
  tip: string;
  paymentMethod: string;
  description: string | null;
  createdAt: string;
  supplierName: string | null;
  supplierRnc: string | null;
  warehouseName: string | null;
}
interface ExpenseDetail extends Expense {
  lines: {
    id: string;
    productId: string | null;
    description: string;
    quantity: string;
    unitCost: string;
    subtotal: string;
    itbis: string;
    total: string;
  }[];
}

export default function PurchasesPage() {
  const [activeTab, setActiveTab] = useState<'historial' | 'nuevo' | 'cheques'>('historial');
  const [loading, setLoading] = useState(false);
  const [isMinorExpense, setIsMinorExpense] = useState(false);

  // Guarantee Check Form State
  const [hasGuaranteeCheck, setHasGuaranteeCheck] = useState(false);
  const [gcBankAccountId, setGcBankAccountId] = useState('');
  const [gcCheckNumber, setGcCheckNumber] = useState('');
  const [gcAmount, setGcAmount] = useState<number>(0);
  const [gcPayee, setGcPayee] = useState('');
  const [gcIssueDate, setGcIssueDate] = useState(getLocalDateString());
  const [gcDueDate, setGcDueDate] = useState('');
  const [bankAccountsList, setBankAccountsList] = useState<{ id: string; bankName: string; accountNumber: string; currency: string }[]>([]);

  // Form State
  const [supplierId, setSupplierId] = useState('');
  const [ncf, setNcf] = useState('');
  const [expenseType, setExpenseType] = useState('02'); // Gastos por Trabajos, Suministros y Servicios
  const [issueDate, setIssueDate] = useState(getLocalDateString());
  const [paymentMethod, setPaymentMethod] = useState('01'); // Efectivo
  const [warehouseId, setWarehouseId] = useState('');
  const [description, setDescription] = useState('');
  
  // General Amount mode state
  const [isGeneralAmount, setIsGeneralAmount] = useState(false);
  const [generalTotal, setGeneralTotal] = useState<string>('');
  const [generalSubtotal, setGeneralSubtotal] = useState<number>(0);
  const [generalItbis, setGeneralItbis] = useState<number>(0);
  const [accountsList, setAccountsList] = useState<{ id: string; code: string; name: string; type: string }[]>([]);
  const [debitAccountId, setDebitAccountId] = useState('');
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [noItbis, setNoItbis] = useState(false);

  const handleOcrComplete = (data: OcrInvoiceData) => {
    setIsMinorExpense(false);
    
    if (data.rnc) {
      const matched = suppliers.find(s => s.rnc.replace(/[\s-]/g, '') === data.rnc.replace(/[\s-]/g, ''));
      if (matched) {
        setSupplierId(matched.id);
        toast.success(`Proveedor auto-detectado: ${matched.name}`);
      } else {
        toast.warning(`No se encontró proveedor con RNC: ${data.rnc}`);
      }
    }
    
    if (data.ncf) setNcf(data.ncf);
    if (data.date) setIssueDate(data.date);
    
    setIsGeneralAmount(true);
    setGeneralTotal(data.total.toString());
    setGeneralSubtotal(data.subtotal);
    setGeneralItbis(data.itbis);
    
    if (data.supplier) {
      setDescription(`Compra / Gasto importado automáticamente vía OCR del proveedor: ${data.supplier}`);
    }
    
    setShowOcrModal(false);
    toast.success('Datos cargados al formulario.');
  };
  
  // Lines for creation
  const [lines, setLines] = useState<{ id: string; productId: string; desc: string; quantity: number; unitCost: number; subtotal: number; itbis: number; total: number; }[]>([]);

  // Lookup data
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Filters State
  const [filterStartDate, setFilterStartDate] = useState(getFirstDayOfMonthString());
  const [filterEndDate, setFilterEndDate] = useState(getLocalDateString());
  const [filterType, setFilterType] = useState<'all' | 'purchases' | 'expenses'>('all');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterNcf, setFilterNcf] = useState('');

  // Search results state
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<Expense[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Load metadata and user info
  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data?.user) {
          setUserRole(data.data.user.role);
        }
      })
      .catch(err => console.error('Error fetching user info:', err));

    // Load bank accounts
    fetch('/api/v1/bank/accounts')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setBankAccountsList(data.data || []);
          if (data.data && data.data.length > 0) {
            setGcBankAccountId(data.data[0].id);
          }
        }
      })
      .catch(err => console.error("Error loading bank accounts", err));

    Promise.all([
      fetch('/api/v1/products?limit=1000').then(r => r.json()),
      fetch('/api/v1/suppliers').then(r => r.json()),
      fetch('/api/v1/warehouses').then(r => r.json()),
      fetch('/api/v1/accounting/accounts').then(r => r.json())
    ]).then(([pr, sp, wh, ac]) => {
      if (pr.success) setProducts(pr.data.items || pr.data || []);
      if (sp.success) setSuppliers(sp.data || []);
      if (wh.success || wh.data) {
        const whList = wh.data || [];
        setWarehouses(whList);
        if (whList.length > 0) setWarehouseId(whList[0].id);
      }
      if (ac.success) {
        setAccountsList(ac.data || []);
        const defaultAcc = (ac.data || []).find((a: any) => a.code.startsWith('5.1.01') || a.name.toLowerCase().includes('costo de ventas'));
        if (defaultAcc) {
          setDebitAccountId(defaultAcc.id);
        }
      }
    }).catch(err => console.error("Error loading lookup data", err));
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'cheques') {
        setActiveTab('cheques');
      }
    }
  }, []);

  useEffect(() => {
    if (supplierId && suppliers.length > 0) {
      const selected = suppliers.find(s => s.id === supplierId);
      if (selected) {
        setGcPayee(selected.name);
      }
    }
  }, [supplierId, suppliers]);

  // Filter and search action
  const handleSearch = async () => {
    setSearchLoading(true);
    setHasSearched(true);
    try {
      let url = `/api/v1/expenses?startDate=${filterStartDate}&endDate=${filterEndDate}`;
      if (filterType === 'purchases') {
        url += '&isMinorExpense=false';
      } else if (filterType === 'expenses') {
        url += '&isMinorExpense=true';
      }
      if (filterSupplier) {
        url += `&supplierId=${filterSupplier}`;
      }
      if (filterWarehouse) {
        url += `&warehouseId=${filterWarehouse}`;
      }
      if (filterNcf) {
        url += `&ncf=${encodeURIComponent(filterNcf)}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.data || []);
        toast.success(`Se encontraron ${data.data.length} transacciones`);
      } else {
        toast.error('Error al realizar búsqueda', { description: data.error?.message });
      }
    } catch (err: any) {
      toast.error('Error de red', { description: err.message });
    } finally {
      setSearchLoading(false);
    }
  };

  // Load initial search results automatically on mount
  useEffect(() => {
    handleSearch();
  }, []);

  // Recalculate ITBIS / Subtotal when noItbis changes
  useEffect(() => {
    if (noItbis) {
      if (isGeneralAmount) {
        const val = parseFloat(generalTotal) || 0;
        setGeneralSubtotal(val);
        setGeneralItbis(0);
      } else {
        setLines(prev => prev.map(l => ({
          ...l,
          itbis: 0,
          total: l.subtotal
        })));
      }
    } else {
      if (isGeneralAmount) {
        const val = parseFloat(generalTotal) || 0;
        if (val > 0) {
          const sub = roundMoney(val / 1.18);
          const itb = roundMoney(val - sub);
          setGeneralSubtotal(sub);
          setGeneralItbis(itb);
        }
      } else {
        setLines(prev => prev.map(l => {
          const itb = l.subtotal * 0.18;
          return {
            ...l,
            itbis: itb,
            total: l.subtotal + itb
          };
        }));
      }
    }
  }, [noItbis, isGeneralAmount]);

  // View expense details
  const viewDetails = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/v1/expenses/${id}`);
      const data = await res.json();
      if (data.success) {
        setSelectedExpense(data.data);
      } else {
        toast.error('Error al cargar detalle', { description: data.error?.message });
      }
    } catch (err: any) {
      toast.error('Error de red', { description: err.message });
    } finally {
      setDetailLoading(false);
    }
  };

  // Delete/void expense
  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('¿Está seguro de que desea eliminar permanentemente este registro de compra/gasto? Esta acción no se puede deshacer y revertirá los niveles de stock correspondientes.')) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/expenses/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Compra/Gasto eliminado exitosamente');
        setSelectedExpense(null);
        handleSearch(); // Refresh list
      } else {
        toast.error('Error al eliminar', { description: data.error?.message });
      }
    } catch (err: any) {
      toast.error('Error de red', { description: err.message });
    }
  };

  const addLine = () => {
    setLines([...lines, { id: Math.random().toString(), productId: '', desc: '', quantity: 1, unitCost: 0, subtotal: 0, itbis: 0, total: 0 }]);
  };

  const updateLine = (id: string, field: string, value: any) => {
    setLines(lines.map(l => {
      if (l.id === id) {
        const newLine = { ...l, [field]: value };
        
        if (field === 'productId' && value) {
          const prod = products.find(p => p.id === value);
          if (prod) {
            newLine.desc = prod.name;
            newLine.unitCost = parseFloat(prod.cost) || 0;
          }
        }

        if (field === 'productId' || field === 'quantity' || field === 'unitCost' || field === 'itbis') {
          newLine.subtotal = newLine.quantity * newLine.unitCost;
          if (noItbis) {
            newLine.itbis = 0;
          } else {
            if (field === 'productId' || field === 'quantity' || field === 'unitCost') {
              newLine.itbis = newLine.subtotal * 0.18;
            } else if (field === 'itbis') {
              newLine.itbis = value;
            }
          }
        }
        newLine.total = newLine.subtotal + newLine.itbis;
        return newLine;
      }
      return l;
    }));
  };

  const [globalIsc, setGlobalIsc] = useState(0);
  const [globalOtherTaxes, setGlobalOtherTaxes] = useState(0);

  const removeLine = (id: string) => setLines(lines.filter(l => l.id !== id));

  const totalSubtotal = isGeneralAmount ? generalSubtotal : lines.reduce((acc, l) => acc + l.subtotal, 0);
  const totalItbis = isGeneralAmount ? generalItbis : lines.reduce((acc, l) => acc + l.itbis, 0);
  const grandTotal = totalSubtotal + totalItbis + globalIsc + globalOtherTaxes;

  useEffect(() => {
    setGcAmount(roundMoney(grandTotal));
  }, [grandTotal]);

  const saveExpense = async () => {
    if (!isMinorExpense) {
      if (!supplierId) return toast.error('Selecciona un suplidor');
      if (!ncf) return toast.error('Ingresa el NCF de la factura');
    }
    if (!issueDate) return toast.error('Selecciona fecha de factura');
    
    if (isGeneralAmount) {
      if (generalSubtotal <= 0) return toast.error('El subtotal de la compra debe ser mayor a 0');
      if (!description.trim()) return toast.error('El concepto general (descripción) es obligatorio');
      if (!debitAccountId) return toast.error('Selecciona la cuenta contable de costo/gasto');
    } else {
      if (lines.length === 0) return toast.error('Agrega al menos una línea');
    }

    if (paymentMethod === '04' && hasGuaranteeCheck) {
      if (!gcBankAccountId) return toast.error('Selecciona la cuenta bancaria del cheque');
      if (!gcCheckNumber) return toast.error('Ingresa el número de cheque');
      if (!gcDueDate) return toast.error('Selecciona la fecha de cobro del cheque');
      if (gcAmount <= 0) return toast.error('El monto del cheque debe ser mayor a 0');
    }

    setLoading(true);
    try {
      const payload = {
        supplierId: isMinorExpense ? null : supplierId,
        isMinorExpense,
        expenseType,
        ncf: ncf ? ncf.toUpperCase().trim() : null,
        issueDate,
        paymentMethod,
        warehouseId: isGeneralAmount ? null : (warehouseId || null),
        description,
        amount: isGeneralAmount ? generalSubtotal : totalSubtotal,
        itbis: isGeneralAmount ? generalItbis : totalItbis,
        isc: globalIsc,
        otherTaxes: globalOtherTaxes,
        lines: isGeneralAmount ? [] : lines.map(l => ({
          productId: l.productId || null,
          description: l.desc,
          quantity: l.quantity,
          unitCost: l.unitCost,
          subtotal: l.subtotal,
          itbis: l.itbis,
          total: l.total
        })),
        debitAccountId: isGeneralAmount ? debitAccountId : null,
        guaranteeCheck: (paymentMethod === '04' && hasGuaranteeCheck) ? {
          bankAccountId: gcBankAccountId,
          checkNumber: gcCheckNumber,
          payee: gcPayee,
          amount: gcAmount,
          issueDate: gcIssueDate,
          dueDate: gcDueDate
        } : null
      };

      const res = await fetch('/api/v1/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success('Compra / Gasto guardado exitosamente');
        // Reset
        setLines([]);
        setNcf('');
        setDescription('');
        setGlobalIsc(0);
        setGlobalOtherTaxes(0);
        setHasGuaranteeCheck(false);
        setGcCheckNumber('');
        setGcDueDate('');
        setIsGeneralAmount(false);
        setGeneralTotal('');
        setGeneralSubtotal(0);
        setGeneralItbis(0);
        setNoItbis(false);
        setActiveTab('historial');
        handleSearch(); // Refresh list if searched before
      } else {
        toast.error('Error guardando gasto', { description: data.error?.message });
      }
    } catch (err: any) {
      toast.error('Error de red', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Calculations for dashboard indicators
  const kpis = {
    totalPurchases: searchResults.filter(e => !e.isMinorExpense).reduce((sum, e) => sum + parseFloat(e.amount), 0),
    totalExpenses: searchResults.filter(e => e.isMinorExpense).reduce((sum, e) => sum + parseFloat(e.amount), 0),
    totalItbis: searchResults.reduce((sum, e) => sum + parseFloat(e.itbis), 0),
    totalTransactions: searchResults.length,
  };

  return (
    <div className="space-y-8 animate-fade-in-up pb-10">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          <h1 className="font-display-lg text-3xl md:text-4xl text-primary tracking-tight font-extrabold flex items-center gap-3">
            <Banknote className="h-8 w-8 text-primary" /> Compras y Gastos
          </h1>
          <p className="font-body-lg text-on-surface-variant/80 mt-1">
            Administra facturas de suplidores, compras de inventario y gastos de caja chica.
          </p>
        </div>

        {/* Tab Switcher & Action button */}
        <div className="flex items-center gap-3 self-end md:self-auto">
          <div className="bg-surface-container-high p-1 rounded-2xl flex gap-1 border border-white/20">
            <button
              onClick={() => setActiveTab('historial')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'historial'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-on-surface-variant/70 hover:text-on-surface'
              }`}
            >
              <ListFilter className="h-4 w-4 inline mr-1.5" /> Historial
            </button>
            <button
              onClick={() => setActiveTab('nuevo')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'nuevo'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-on-surface-variant/70 hover:text-on-surface'
              }`}
            >
              <Plus className="h-4 w-4 inline mr-1.5" /> Registrar
            </button>
            <button
              onClick={() => setActiveTab('cheques')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'cheques'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-on-surface-variant/70 hover:text-on-surface'
              }`}
            >
              <Banknote className="h-4 w-4 inline mr-1.5" /> Cheques
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'historial' ? (
        <div className="space-y-8">
          {/* Advanced Filter Panel */}
          <section className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-6">
            <h3 className="font-bold text-primary mb-4 uppercase tracking-wider text-sm flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filtros de Búsqueda
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-on-surface-variant/80 mb-1.5 uppercase">Rango de Fechas</label>
                <div className="w-full [&>div]:w-full [&_button]:w-full">
                  <DateRangePicker
                    from={filterStartDate}
                    to={filterEndDate}
                    onChange={({ from, to }) => {
                      setFilterStartDate(from);
                      setFilterEndDate(to);
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant/80 mb-1.5 uppercase">Tipo de Registro</label>
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value as any)}
                  className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2.5 text-xs font-medium focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="all">Todos</option>
                  <option value="purchases">Solo Compras (Mercancía/Suplidor)</option>
                  <option value="expenses">Solo Gastos (Menores/Caja Chica)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant/80 mb-1.5 uppercase">Suplidor</label>
                <select
                  value={filterSupplier}
                  onChange={e => setFilterSupplier(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2.5 text-xs font-medium focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="">Cualquier Suplidor</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant/80 mb-1.5 uppercase">Almacén</label>
                <select
                  value={filterWarehouse}
                  onChange={e => setFilterWarehouse(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2.5 text-xs font-medium focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="">Cualquier Almacén</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-on-surface-variant/80 mb-1.5 uppercase">NCF</label>
                <input
                  type="text"
                  placeholder="Ej. B01..."
                  value={filterNcf}
                  onChange={e => setFilterNcf(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2.5 text-xs font-medium focus:ring-2 focus:ring-primary outline-none font-mono"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2.5">
              {hasSearched && searchResults.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    let url = `/api/v1/expenses/report?startDate=${filterStartDate}&endDate=${filterEndDate}`;
                    if (filterType === 'purchases') {
                      url += '&isMinorExpense=false';
                    } else if (filterType === 'expenses') {
                      url += '&isMinorExpense=true';
                    }
                    if (filterSupplier) {
                      url += `&supplierId=${filterSupplier}`;
                    }
                    if (filterWarehouse) {
                      url += `&warehouseId=${filterWarehouse}`;
                    }
                    if (filterNcf) {
                      url += `&ncf=${encodeURIComponent(filterNcf)}`;
                    }
                    window.open(url, '_blank');
                  }}
                  className="bg-[#005E63] hover:bg-[#004d51] text-white px-6 py-3 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-teal-500/10 font-bold text-xs animate-fade-in"
                >
                  <Printer className="h-4 w-4" />
                  <span>Imprimir Reporte</span>
                </button>
              )}
              <button
                onClick={handleSearch}
                disabled={searchLoading}
                className="bg-[#005E63] hover:bg-[#004d51] text-white px-8 py-3 rounded-2xl flex items-center justify-center gap-2 hover:shadow-xl hover:shadow-teal-500/25 transition-all active:scale-95 disabled:opacity-50"
              >
                {searchLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="font-bold text-xs">Buscar Registros</span>
              </button>
            </div>
          </section>

          {/* Indicators & Data presentation */}
          {!hasSearched ? (
            <div className="bg-surface-container-low border border-dashed border-on-surface-variant/20 rounded-3xl p-12 text-center">
              <ListFilter className="h-12 w-12 text-primary mx-auto mb-4 opacity-55" />
              <h4 className="text-lg font-extrabold text-primary mb-2">Establece los filtros de búsqueda</h4>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto mb-6">
                No se muestran transacciones hasta que apliques los filtros de fecha/tipo y presiones el botón de **Buscar Registros**.
              </p>
              <button
                onClick={() => setActiveTab('nuevo')}
                className="bg-[#005E63] hover:bg-[#004d51] text-white px-6 py-3 rounded-2xl font-bold text-xs inline-flex items-center gap-2 hover:shadow-lg transition-all active:scale-95"
              >
                <Plus className="h-4 w-4" /> Registrar Compra o Gasto
              </button>
            </div>
          ) : searchLoading ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(n => (
                  <div key={n} className="h-28 bg-surface-container-high animate-pulse rounded-2xl"></div>
                ))}
              </div>
              <div className="h-80 bg-surface-container-high animate-pulse rounded-3xl"></div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* KPI Cards Dashboard */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 p-6 rounded-3xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Compras de Inventario</p>
                    <h3 className="text-2xl font-black text-emerald-950 mt-1 font-mono-data">RD$ {kpis.totalPurchases.toLocaleString(undefined, {minimumFractionDigits: 2})}</h3>
                  </div>
                  <div className="bg-emerald-500/20 p-3 rounded-2xl text-emerald-800">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 p-6 rounded-3xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-blue-800 tracking-wider">Gastos de Operación</p>
                    <h3 className="text-2xl font-black text-blue-950 mt-1 font-mono-data">RD$ {kpis.totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}</h3>
                  </div>
                  <div className="bg-blue-500/20 p-3 rounded-2xl text-blue-800">
                    <Activity className="h-6 w-6" />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 p-6 rounded-3xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-purple-800 tracking-wider">ITBIS Soportado</p>
                    <h3 className="text-2xl font-black text-purple-950 mt-1 font-mono-data">RD$ {kpis.totalItbis.toLocaleString(undefined, {minimumFractionDigits: 2})}</h3>
                  </div>
                  <div className="bg-purple-500/20 p-3 rounded-2xl text-purple-800">
                    <DollarSign className="h-6 w-6" />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 p-6 rounded-3xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Total Transacciones</p>
                    <h3 className="text-2xl font-black text-amber-950 mt-1 font-mono-data">{kpis.totalTransactions}</h3>
                  </div>
                  <div className="bg-amber-500/20 p-3 rounded-2xl text-amber-800">
                    <FileText className="h-6 w-6" />
                  </div>
                </div>
              </div>

              {/* Lists Split Panel (Compras / Gastos por separado) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Compras de Inventario (Comprobantes) */}
                <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-6">
                  <h3 className="font-extrabold text-primary mb-4 flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5" /> 1. Compras (Con Suplidor / Inventario)
                    </span>
                    <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full">
                      {searchResults.filter(e => !e.isMinorExpense).length} Comprobantes
                    </span>
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-surface-container-high text-[11px] font-bold text-on-surface-variant/75 uppercase">
                          <th className="py-3 px-2">Suplidor / RNC</th>
                          <th className="py-3 px-2">NCF</th>
                          <th className="py-3 px-2">Fecha</th>
                          <th className="py-3 px-2 text-right">Total</th>
                          <th className="py-3 px-2 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchResults.filter(e => !e.isMinorExpense).map(e => (
                          <tr key={e.id} className="border-b border-surface-container-low hover:bg-surface-container-low/55 transition-colors">
                            <td className="py-3 px-2">
                              <p className="font-bold text-xs text-primary">{e.supplierName || 'Desconocido'}</p>
                              <p className="text-[10px] text-on-surface-variant">{e.supplierRnc || '-'}</p>
                            </td>
                            <td className="py-3 px-2 font-mono text-xs">{e.ncf || 'Sin NCF'}</td>
                            <td className="py-3 px-2 text-xs">{e.issueDate}</td>
                            <td className="py-3 px-2 text-right font-bold font-mono-data text-xs">
                              RD${parseFloat(e.amount).toFixed(2)}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => viewDetails(e.id)}
                                  className="p-1 text-primary hover:bg-primary/10 rounded-lg"
                                  title="Ver Detalles"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => window.open(`/api/v1/expenses/${e.id}/print`, '_blank')}
                                  className="p-1 text-[#005E63] hover:bg-[#005E63]/10 rounded-lg"
                                  title="Imprimir"
                                >
                                  <Printer className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {searchResults.filter(e => !e.isMinorExpense).length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-xs text-on-surface-variant">
                              No hay compras comerciales en el rango de búsqueda.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Gastos Menores / Caja Chica */}
                <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-6">
                  <h3 className="font-extrabold text-primary mb-4 flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <Activity className="h-5 w-5" /> 2. Gastos Menores / Caja Chica
                    </span>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full">
                      {searchResults.filter(e => e.isMinorExpense).length} Transacciones
                    </span>
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-surface-container-high text-[11px] font-bold text-on-surface-variant/75 uppercase">
                          <th className="py-3 px-2">Concepto / NCF</th>
                          <th className="py-3 px-2">Tipo de Gasto</th>
                          <th className="py-3 px-2">Fecha</th>
                          <th className="py-3 px-2 text-right">Total</th>
                          <th className="py-3 px-2 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchResults.filter(e => e.isMinorExpense).map(e => (
                          <tr key={e.id} className="border-b border-surface-container-low hover:bg-surface-container-low/55 transition-colors">
                            <td className="py-3 px-2">
                              <p className="font-bold text-xs text-primary">{e.description || 'Gasto General'}</p>
                              {e.ncf && <p className="text-[10px] font-mono text-on-surface-variant">{e.ncf}</p>}
                            </td>
                            <td className="py-3 px-2">
                              <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                                {e.expenseType === '01' ? 'Personal' : e.expenseType === '02' ? 'Servicios' : e.expenseType === '09' ? 'Inventario' : 'Otros'}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-xs">{e.issueDate}</td>
                            <td className="py-3 px-2 text-right font-bold font-mono-data text-xs">
                              RD${parseFloat(e.amount).toFixed(2)}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => viewDetails(e.id)}
                                  className="p-1 text-primary hover:bg-primary/10 rounded-lg"
                                  title="Ver Detalles"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => window.open(`/api/v1/expenses/${e.id}/print`, '_blank')}
                                  className="p-1 text-[#005E63] hover:bg-[#005E63]/10 rounded-lg"
                                  title="Imprimir"
                                >
                                  <Printer className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {searchResults.filter(e => e.isMinorExpense).length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-xs text-on-surface-variant">
                              No hay gastos registrados en el rango de búsqueda.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'nuevo' ? (
        /* Create Form (Original register purchase screen) */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cabecera del Gasto */}
          <section className="lg:col-span-2 space-y-6">
            <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-primary uppercase tracking-wider text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Datos del Comprobante
                </h3>
                <button
                  type="button"
                  onClick={() => setShowOcrModal(true)}
                  className="bg-[#005E63] text-white hover:bg-[#004d52] transition-all px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Camera className="w-3.5 h-3.5" /> Lector OCR (Subir Factura)
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div 
                  className="col-span-1 md:col-span-2 flex items-center gap-3 p-4 bg-surface-container-low rounded-2xl cursor-pointer hover:bg-surface-container transition-all"
                  onClick={() => setIsMinorExpense(!isMinorExpense)}
                >
                  {isMinorExpense ? <CheckSquare className="h-6 w-6 text-primary" /> : <Square className="h-6 w-6 text-on-surface-variant/40" />}
                  <div>
                    <p className="font-bold text-primary">Es un Gasto Menor (Caja Chica)</p>
                    <p className="text-xs text-on-surface-variant">No requiere suplidor formal. Útil para compras informales o servicios rápidos.</p>
                  </div>
                </div>

                {!isMinorExpense && (
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">Suplidor (Proveedor)</label>
                    <select 
                      value={supplierId} onChange={e => setSupplierId(e.target.value)}
                      className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary outline-none"
                    >
                      <option value="">Selecciona un suplidor...</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} - {s.rnc}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">NCF (Opcional si es Gasto Menor)</label>
                   <input 
                    type="text" placeholder={isMinorExpense ? "Ej. B13..." : "Ej. B01..."}
                    value={ncf} onChange={e => setNcf(e.target.value)}
                    className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary outline-none font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">Fecha Emisión</label>
                   <input 
                    type="date"
                    value={issueDate} onChange={e => setIssueDate(e.target.value)}
                    className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">Tipo de Gasto (Formato 606)</label>
                   <select 
                    value={expenseType} onChange={e => setExpenseType(e.target.value)}
                    className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="01">01 - Gastos de Personal</option>
                    <option value="02">02 - Trabajos, Suministros y Servicios</option>
                    <option value="09">09 - Compras de Mercancía (Inventario)</option>
                    <option value="11">11 - Gastos Financieros</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">Concepto General</label>
                <textarea 
                  rows={2} placeholder="Descripción de la compra..."
                  value={description} onChange={e => setDescription(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
            </div>

            {/* Checkbox to Exempt ITBIS */}
            <div className="flex items-center gap-2 mt-4 bg-yellow-500/10 border border-yellow-500/20 p-3.5 rounded-2xl max-w-md">
              <input
                type="checkbox"
                id="noItbis"
                checked={noItbis}
                onChange={e => setNoItbis(e.target.checked)}
                className="w-4 h-4 text-primary bg-surface-container-high border-none rounded-xl focus:ring-2 focus:ring-primary cursor-pointer"
              />
              <label htmlFor="noItbis" className="text-xs font-extrabold text-yellow-900 cursor-pointer select-none">
                Gasto Exento de ITBIS (No posee ITBIS)
              </label>
            </div>

            {isGeneralAmount ? (
              <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-6 space-y-5">
                <h3 className="font-bold text-primary uppercase tracking-wider text-sm flex items-center gap-2">
                  <Tag className="h-4 w-4" /> Desglose de Montos Generales
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">
                      Total de la Compra (RD$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ej: 1180.00"
                      value={generalTotal}
                      onChange={e => {
                        const valStr = e.target.value;
                        setGeneralTotal(valStr);
                        const val = parseFloat(valStr) || 0;
                        if (val > 0) {
                          if (noItbis) {
                            setGeneralSubtotal(val);
                            setGeneralItbis(0);
                          } else {
                            const sub = roundMoney(val / 1.18);
                            const itb = roundMoney(val - sub);
                            setGeneralSubtotal(sub);
                            setGeneralItbis(itb);
                          }
                        } else {
                          setGeneralSubtotal(0);
                          setGeneralItbis(0);
                        }
                      }}
                      className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2.5 text-xs font-bold font-mono focus:ring-2 focus:ring-primary outline-none"
                    />
                    <p className="text-[10px] text-on-surface-variant mt-1 ml-1 leading-tight">
                      Ingrese el total para autocalcular el ITBIS y Subtotal.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">
                      Monto sin ITBIS (Subtotal)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={generalSubtotal || ''}
                      onChange={e => setGeneralSubtotal(parseFloat(e.target.value) || 0)}
                      disabled={noItbis}
                      className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2.5 text-xs font-bold font-mono focus:ring-2 focus:ring-primary outline-none disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">
                      ITBIS (18%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={generalItbis || ''}
                      onChange={e => setGeneralItbis(parseFloat(e.target.value) || 0)}
                      disabled={noItbis}
                      className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2.5 text-xs font-bold font-mono focus:ring-2 focus:ring-primary outline-none disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">
                    Cuenta de Costo / Gasto <span className="text-red-500 font-bold">*</span>
                  </label>
                  <select
                    value={debitAccountId}
                    onChange={e => setDebitAccountId(e.target.value)}
                    className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2.5 text-xs font-medium focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">-- Selecciona una cuenta contable --</option>
                    {accountsList
                      .filter(acc => acc.type === 'expense')
                      .map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name} (Gasto/Costo)
                        </option>
                      ))}
                  </select>
                  <p className="text-[10px] text-on-surface-variant mt-1 ml-1 leading-tight">
                    Cuenta contable donde se registrará el gasto en el libro mayor.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-primary uppercase tracking-wider text-sm flex items-center gap-2">
                    <Box className="h-4 w-4" /> Líneas de Compra / Gasto
                  </h3>
                  <button 
                    onClick={addLine}
                    className="bg-primary/10 text-primary px-4 py-2 rounded-xl text-xs font-bold hover:bg-primary/20 flex items-center gap-2 animate-fade-in"
                  >
                    <Plus className="h-4 w-4" /> Añadir Línea
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-surface-container-high text-[10px] font-bold text-on-surface-variant/75 uppercase tracking-wider">
                        <th className="py-3 px-2">Producto / Descripción</th>
                        <th className="py-3 px-2 w-20">Cant.</th>
                        <th className="py-3 px-2 w-32">Costo U.</th>
                        <th className="py-3 px-2 w-28">ITBIS (18%)</th>
                        <th className="py-3 px-2 w-32 text-right">Total Fila</th>
                        <th className="py-3 px-2 w-12 text-center"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map(l => (
                        <tr key={l.id} className="border-b border-surface-container-low align-middle">
                          <td className="py-3 px-2 space-y-1.5 min-w-[200px]">
                            <select 
                              value={l.productId} onChange={e => updateLine(l.id, 'productId', e.target.value)}
                              className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                            >
                              <option value="">-- Servicio o ítem manual --</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <input 
                              type="text" placeholder="Descripción de la línea..."
                              value={l.desc} onChange={e => updateLine(l.id, 'desc', e.target.value)}
                              className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none font-medium text-on-surface"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <input 
                              type="number" min="1" value={l.quantity} onChange={e => updateLine(l.id, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full bg-surface-container-high border-none rounded-xl px-2 py-2 text-xs text-center font-bold focus:ring-1 focus:ring-primary outline-none"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <input 
                              type="number" step="0.01" value={l.unitCost || ''} onChange={e => updateLine(l.id, 'unitCost', parseFloat(e.target.value) || 0)}
                              className="w-full bg-surface-container-high border-none rounded-xl px-2 py-2 text-xs font-semibold focus:ring-1 focus:ring-primary outline-none font-mono-data"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <input 
                              type="number" step="0.01" value={l.itbis || ''} onChange={e => updateLine(l.id, 'itbis', parseFloat(e.target.value) || 0)}
                              disabled={noItbis}
                              className="w-full bg-surface-container-high border-none rounded-xl px-2 py-2 text-xs focus:ring-1 focus:ring-primary outline-none font-mono-data disabled:opacity-50"
                            />
                          </td>
                          <td className="py-3 px-2 text-right">
                            <span className="font-mono-data font-bold text-sm text-primary">RD${l.total.toFixed(2)}</span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <button onClick={() => removeLine(l.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {lines.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-sm font-medium text-on-surface-variant/60">
                            Aún no has agregado productos o servicios a esta compra.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Resumen y Config */}
          <section className="space-y-6">
            <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-6">
              <h3 className="font-bold text-primary mb-4 uppercase tracking-wider text-sm flex items-center gap-2">
                <Store className="h-4 w-4" /> Configuración
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 bg-surface-container-low rounded-2xl border border-outline-variant/15 select-none mb-2">
                  <div>
                    <p className="text-xs font-bold text-primary">Compra por Monto General</p>
                    <p className="text-[10px] text-on-surface-variant leading-normal">Registra un valor único de gasto sin detalle de ítems.</p>
                  </div>
                  <button
                    onClick={() => {
                      setIsGeneralAmount(!isGeneralAmount);
                      if (!isGeneralAmount) {
                        setWarehouseId('');
                      }
                    }}
                    type="button"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isGeneralAmount ? 'bg-primary' : 'bg-on-surface-variant/20'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${isGeneralAmount ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">Almacén Destino (Inventario)</label>
                  <select 
                    value={isGeneralAmount ? "" : warehouseId} onChange={e => setWarehouseId(e.target.value)}
                    disabled={isGeneralAmount}
                    className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">No afecta inventario</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                  <p className="text-[10px] text-on-surface-variant mt-1 ml-1">
                    {isGeneralAmount ? 'Inhabilitado en registro de monto general.' : 'Los productos con registro sumarán stock a este almacén.'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 mb-2">Método de Pago</label>
                  <select 
                    value={paymentMethod} onChange={e => {
                      setPaymentMethod(e.target.value);
                      if (e.target.value !== '04') {
                        setHasGuaranteeCheck(false);
                      }
                    }}
                    className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="01">Efectivo</option>
                    <option value="02">Cheque</option>
                    <option value="03">Transferencia</option>
                    <option value="04">A Crédito (CXP)</option>
                  </select>
                </div>

                {paymentMethod === '04' && (
                  <div className="mt-4 border-t border-dashed border-outline-variant/35 pt-4 space-y-4">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={hasGuaranteeCheck} 
                        onChange={e => setHasGuaranteeCheck(e.target.checked)}
                        className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4"
                      />
                      <span className="text-xs font-bold text-on-surface-variant/80">Dejar Cheque en Garantía</span>
                    </label>

                    {hasGuaranteeCheck && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-4 bg-surface-container-low/50 p-4 rounded-2xl border border-outline-variant/20"
                      >
                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant/70 mb-1">Banco / Cuenta de Origen</label>
                          <select 
                            value={gcBankAccountId} onChange={e => setGcBankAccountId(e.target.value)}
                            className="w-full bg-white border border-outline-variant/20 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                          >
                            <option value="">Selecciona una cuenta</option>
                            {bankAccountsList.map(b => (
                              <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber} ({b.currency})</option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-on-surface-variant/70 mb-1">
                              Número de Cheque <span className="text-red-500 font-bold">* (Obligatorio)</span>
                            </label>
                            <input 
                              type="text" 
                              value={gcCheckNumber} onChange={e => setGcCheckNumber(e.target.value)}
                              className="w-full bg-white border border-outline-variant/35 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                              placeholder="Ej: 10023"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-on-surface-variant/70 mb-1 text-primary">Monto Cheque</label>
                            <input 
                              type="number"
                              step="0.01"
                              value={gcAmount || ''} 
                              onChange={e => setGcAmount(parseFloat(e.target.value) || 0)}
                              onBlur={e => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val)) {
                                  setGcAmount(roundMoney(val));
                                }
                              }}
                              className="w-full bg-white border border-outline-variant/20 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none font-bold font-mono"
                            />
                            {Math.abs(gcAmount - grandTotal) > 0.01 && (
                              <div className="mt-2 p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl text-[10px] text-amber-800 dark:text-amber-300 flex items-start gap-2 leading-relaxed shadow-sm">
                                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-bold block mb-0.5">Monto Modificado</span>
                                  El monto del cheque difiere del total de la compra (RD$ {roundMoney(grandTotal).toLocaleString(undefined, {minimumFractionDigits: 2})}). Asegúrese de que esta diferencia sea intencional.
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-on-surface-variant/70 mb-1">Fecha Emisión</label>
                            <input 
                              type="date" 
                              value={gcIssueDate} onChange={e => setGcIssueDate(e.target.value)}
                              className="w-full bg-white border border-outline-variant/20 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-on-surface-variant/70 mb-1">
                              Fecha de Cobro <span className="text-red-500 font-bold">* (Obligatorio)</span>
                            </label>
                            <input 
                              type="date" 
                              value={gcDueDate} onChange={e => setGcDueDate(e.target.value)}
                              className="w-full bg-white border border-outline-variant/35 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-on-surface-variant/70 mb-1">Beneficiario (Autocompletado)</label>
                          <input 
                            type="text" 
                            value={gcPayee}
                            disabled
                            className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-3 py-2 text-xs text-on-surface-variant/70 outline-none cursor-not-allowed font-medium"
                            placeholder="Selecciona un suplidor para autocompletar"
                          />
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-primary text-on-primary rounded-3xl p-6 shadow-xl shadow-primary/20">
              <h3 className="font-bold uppercase tracking-wider text-sm mb-6 flex items-center gap-2">
                <Tag className="h-4 w-4" /> Resumen Total
              </h3>
              
              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-on-primary/80">Subtotal</span>
                  <span className="font-mono-data font-bold">RD$ {totalSubtotal.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-on-primary/80">ITBIS (18%)</span>
                  <span className="font-mono-data font-bold">RD$ {totalItbis.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-on-primary/80 flex items-center gap-2">ISC <span className="text-[10px] opacity-70">(Combustibles)</span></span>
                   <input 
                    type="number" step="0.01" value={globalIsc || ''} onChange={e => setGlobalIsc(parseFloat(e.target.value) || 0)}
                    className="w-24 bg-white/10 border-none rounded-lg px-2 py-1 text-right text-xs font-mono-data font-bold focus:ring-1 focus:ring-white outline-none"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-on-primary/80">Otros Impuestos</span>
                   <input 
                    type="number" step="0.01" value={globalOtherTaxes || ''} onChange={e => setGlobalOtherTaxes(parseFloat(e.target.value) || 0)}
                    className="w-24 bg-white/10 border-none rounded-lg px-2 py-1 text-right text-xs font-mono-data font-bold focus:ring-1 focus:ring-white outline-none"
                  />
                </div>
              </div>
              
              <div className="pt-4 border-t border-white/20 flex justify-between items-center mb-6">
                <span className="text-sm font-bold">TOTAL NETO</span>
                <span className="font-display-lg text-2xl font-black">RD$ {grandTotal.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
              </div>

              <button
                onClick={saveExpense}
                disabled={loading}
                className="w-full bg-white text-primary py-3.5 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm hover:shadow-lg active:scale-98 transition-all disabled:opacity-50"
              >
                {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                <span>Guardar Compra / Gasto</span>
              </button>
            </div>
            </section>
          </div>
        ) : (
          <GuaranteeChecksView />
        )}

      {/* OCR Lector Modal */}
      {showOcrModal && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative p-6 border border-slate-200">
            <button
              onClick={() => setShowOcrModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-750 text-xs font-bold bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl active:scale-95 z-50 transition-colors"
            >
              Cerrar
            </button>
            <div className="pt-4">
              <InvoiceImageUploader onOcrComplete={handleOcrComplete} />
            </div>
          </div>
        </div>
      )}

      {/* Premium Detail Modal for Expense/Purchase */}
      <AnimatePresence>
        {selectedExpense && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              {/* Modal Header */}
              <div className="bg-primary text-on-primary p-6 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Info className="h-5 w-5" /> Detalle de la Transacción
                  </h3>
                  <p className="text-xs text-on-primary/80 mt-1">
                    ID Transacción: {selectedExpense.id}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedExpense(null)}
                  className="bg-white/10 hover:bg-white/20 text-on-primary p-2 rounded-xl text-sm transition-all"
                >
                  Cerrar Ventana
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="bg-surface-container-low p-4 rounded-2xl">
                    <p className="text-[10px] uppercase font-bold text-on-surface-variant">Tipo y Comprobante</p>
                    <p className="font-bold text-sm text-primary mt-1">
                      {selectedExpense.isMinorExpense ? 'Gastos Menores (Caja Chica)' : 'Compra Comercial (Suplidor)'}
                    </p>
                    <p className="text-xs font-mono text-on-surface-variant/80 mt-0.5">
                      NCF: {selectedExpense.ncf || 'N/A'}
                    </p>
                  </div>

                  <div className="bg-surface-container-low p-4 rounded-2xl">
                    <p className="text-[10px] uppercase font-bold text-on-surface-variant">Suplidor / Proveedor</p>
                    {selectedExpense.isMinorExpense ? (
                      <p className="font-bold text-sm text-primary mt-1">N/A (Informal / Caja Chica)</p>
                    ) : (
                      <>
                        <p className="font-bold text-sm text-primary mt-1">{selectedExpense.supplierName}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">RNC: {selectedExpense.supplierRnc}</p>
                      </>
                    )}
                  </div>

                  <div className="bg-surface-container-low p-4 rounded-2xl">
                    <p className="text-[10px] uppercase font-bold text-on-surface-variant">Fecha y Almacén</p>
                    <p className="font-bold text-sm text-primary mt-1">Emisión: {selectedExpense.issueDate}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Almacén Destino: {selectedExpense.warehouseName || 'No afecta inventario'}
                    </p>
                  </div>
                </div>

                {/* Lines breakdown */}
                <div>
                  <h4 className="font-bold text-sm text-primary mb-3 uppercase tracking-wider flex items-center gap-1.5">
                    <Box className="h-4 w-4" /> Desglose de Líneas de Artículos
                  </h4>
                  <div className="border border-surface-container-high rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-surface-container-low border-b border-surface-container-high font-bold text-on-surface-variant/85 uppercase">
                          <th className="p-3">Descripción</th>
                          <th className="p-3 text-center w-20">Cantidad</th>
                          <th className="p-3 text-right w-28">Costo Unitario</th>
                          <th className="p-3 text-right w-24">ITBIS (18%)</th>
                          <th className="p-3 text-right w-28">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedExpense.lines.length === 0 ? (
                          <tr className="border-b border-surface-container-low">
                            <td className="p-3 font-semibold text-primary">{selectedExpense.description || 'Gasto General / Materia Prima'}</td>
                            <td className="p-3 text-center font-bold">1</td>
                            <td className="p-3 text-right font-mono-data">RD${parseFloat(selectedExpense.amount).toFixed(2)}</td>
                            <td className="p-3 text-right font-mono-data text-emerald-600">RD${parseFloat(selectedExpense.itbis).toFixed(2)}</td>
                            <td className="p-3 text-right font-mono-data font-bold">RD${(parseFloat(selectedExpense.amount) + parseFloat(selectedExpense.itbis)).toFixed(2)}</td>
                          </tr>
                        ) : (
                          selectedExpense.lines.map(line => (
                            <tr key={line.id} className="border-b border-surface-container-low">
                              <td className="p-3 font-semibold text-primary">{line.description}</td>
                              <td className="p-3 text-center font-bold">{parseFloat(line.quantity)}</td>
                              <td className="p-3 text-right font-mono-data">RD${parseFloat(line.unitCost).toFixed(2)}</td>
                              <td className="p-3 text-right font-mono-data text-emerald-600">RD${parseFloat(line.itbis).toFixed(2)}</td>
                              <td className="p-3 text-right font-mono-data font-bold">RD${parseFloat(line.total).toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Summary block */}
                <div className="flex justify-end">
                  <div className="w-full max-w-sm bg-surface-container-low p-5 rounded-2xl space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Subtotal</span>
                      <span className="font-bold font-mono-data">RD$ {parseFloat(selectedExpense.amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">ITBIS Soportado</span>
                      <span className="font-bold font-mono-data text-emerald-600">RD$ {parseFloat(selectedExpense.itbis).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                    {parseFloat(selectedExpense.isc) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-on-surface-variant">ISC (Combustibles)</span>
                        <span className="font-bold font-mono-data">RD$ {parseFloat(selectedExpense.isc).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                      </div>
                    )}
                    {parseFloat(selectedExpense.otherTaxes) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-on-surface-variant">Otros Impuestos</span>
                        <span className="font-bold font-mono-data">RD$ {parseFloat(selectedExpense.otherTaxes).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                      </div>
                    )}
                    <div className="pt-2.5 border-t border-surface-container-high flex justify-between text-sm font-black text-primary">
                      <span>TOTAL GENERAL</span>
                      <span className="font-mono-data">
                        RD$ {(
                          parseFloat(selectedExpense.amount) + 
                          parseFloat(selectedExpense.itbis) + 
                          parseFloat(selectedExpense.isc) + 
                          parseFloat(selectedExpense.otherTaxes)
                        ).toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="bg-surface-container-high p-4 flex justify-between items-center">
                {userRole === 'sistemas' ? (
                  <button
                    onClick={() => handleDeleteExpense(selectedExpense.id)}
                    className="bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 shadow-md shadow-red-500/20"
                  >
                    <Trash2 className="h-4 w-4" /> Eliminar Transacción
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-[11px] font-bold text-amber-600 bg-amber-500/10 px-3 py-2 rounded-xl border border-amber-500/20">
                    <Info className="h-3.5 w-3.5" />
                    <span>Solo usuarios con rol de sistema pueden eliminar transacciones</span>
                  </div>
                )}
                <button
                  onClick={() => window.open(`/api/v1/expenses/${selectedExpense.id}/print`, '_blank')}
                  className="bg-[#005E63] hover:bg-[#004d51] text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 ml-auto mr-2"
                >
                  <Printer className="h-4 w-4" /> Imprimir
                </button>
                <button
                  onClick={() => setSelectedExpense(null)}
                  className="bg-primary text-on-primary px-5 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"
                >
                  Cerrar Detalle
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GuaranteeChecksView() {
  const [loading, setLoading] = useState(true);
  const [paymentsList, setPaymentsList] = useState<any[]>([]);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const fetchChecks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/ap?payments=true');
      const data = await res.json();
      if (data.success) {
        setPaymentsList(data.data || []);
      } else {
        toast.error('Error al obtener cheques en garantía');
      }
    } catch (e) {
      toast.error('Error de red al cargar cheques en garantía');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChecks();
  }, []);

  const handleApplyCheck = async (paymentId: string, checkId: string, checkNumber: string) => {
    if (!confirm(`¿Estás seguro de que deseas aplicar contablemente el cheque #${checkNumber}? Esta operación deducirá el balance de CXP y registrará la salida del banco.`)) return;

    setApplyingId(checkId);
    try {
      const res = await fetch('/api/v1/ap/payments/apply-guarantees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Cheque #${checkNumber} aplicado exitosamente.`);
        fetchChecks();
      } else {
        toast.error(data.error?.message || 'Error al aplicar el cheque');
      }
    } catch (e) {
      toast.error('Error de red al procesar cheque');
    } finally {
      setApplyingId(null);
    }
  };

  // Filter guarantee checks: checkStatus is mapped from r.check?.status, so if it is not undefined/null, it's a guarantee check.
  const guaranteePayments = paymentsList.filter(p => p.checkStatus !== undefined && p.checkStatus !== null);

  const pendingChecks = guaranteePayments.filter(p => p.status === 'pending_guarantee');
  const appliedChecks = guaranteePayments.filter(p => p.status === 'applied');

  return (
    <div className="space-y-6">
      <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-sm rounded-3xl p-6">
        <h3 className="font-bold text-primary mb-4 uppercase tracking-wider text-sm flex items-center gap-2">
          <Banknote className="h-5 w-5 text-amber-500" /> Control de Cheques en Garantía
        </h3>
        <p className="text-xs text-on-surface-variant/80 mb-6">
          Aquí se listan todos los cheques dejados en garantía de compras a crédito. Puedes aplicarlos contablemente de manera manual cuando el suplidor confirme su cobro.
        </p>

        {loading ? (
          <div className="py-12 flex justify-center items-center">
            <RefreshCw className="h-8 w-8 text-primary animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Pendientes */}
            <div>
              <h4 className="font-bold text-primary mb-3 text-xs uppercase tracking-wide flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                Cheques Pendientes por Cobrar ({pendingChecks.length})
              </h4>
              <div className="bg-white/50 border border-outline-variant/20 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant/30 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">
                      <th className="px-6 py-3">Suplidor</th>
                      <th className="px-6 py-3">Cheque #</th>
                      <th className="px-6 py-3">Fecha Emisión</th>
                      <th className="px-6 py-3 text-amber-700">Fecha de Cobro</th>
                      <th className="px-6 py-3 text-right">Monto</th>
                      <th className="px-6 py-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10 text-xs">
                    {pendingChecks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-on-surface-variant/70 italic">
                          No hay cheques en garantía pendientes.
                        </td>
                      </tr>
                    ) : (
                      pendingChecks.map(p => {
                        const isDue = p.dueDate <= getLocalDateString();
                        return (
                          <tr key={p.id} className={isDue ? "bg-amber-50/30" : ""}>
                            <td className="px-6 py-4 font-bold text-primary">{p.supplierName}</td>
                            <td className="px-6 py-4 font-mono font-bold">{p.checkNumber || 'S/N'}</td>
                            <td className="px-6 py-4 font-mono">{p.paymentDate}</td>
                            <td className="px-6 py-4 font-mono font-bold text-amber-600 flex items-center gap-1">
                              {isDue && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-600 animate-ping"></span>}
                              {p.dueDate}
                            </td>
                            <td className="px-6 py-4 text-right font-mono font-bold text-primary">
                              RD$ {parseFloat(p.amount).toLocaleString(undefined, {minimumFractionDigits: 2})}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={() => handleApplyCheck(p.id, p.checkId, p.checkNumber)}
                                disabled={applyingId === p.checkId}
                                className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl transition-all shadow-sm shadow-amber-600/10 hover:shadow-md hover:shadow-amber-600/20 active:scale-95 disabled:opacity-50 cursor-pointer"
                              >
                                {applyingId === p.checkId ? 'Procesando...' : 'Aplicar'}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Aplicados */}
            <div>
              <h4 className="font-bold text-primary mb-3 text-xs uppercase tracking-wide flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                Historial de Cheques Aplicados ({appliedChecks.length})
              </h4>
              <div className="bg-white/50 border border-outline-variant/20 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant/30 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">
                      <th className="px-6 py-3">Suplidor</th>
                      <th className="px-6 py-3">Cheque #</th>
                      <th className="px-6 py-3">Fecha Emisión</th>
                      <th className="px-6 py-3">Fecha Cobrado</th>
                      <th className="px-6 py-3 text-right">Monto</th>
                      <th className="px-6 py-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10 text-xs">
                    {appliedChecks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-on-surface-variant/70 italic">
                          No hay historial de cheques aplicados.
                        </td>
                      </tr>
                    ) : (
                      appliedChecks.map(p => (
                        <tr key={p.id}>
                          <td className="px-6 py-4 font-bold text-on-surface-variant">{p.supplierName}</td>
                          <td className="px-6 py-4 font-mono font-medium">{p.checkNumber || 'S/N'}</td>
                          <td className="px-6 py-4 font-mono text-on-surface-variant/70">{p.paymentDate}</td>
                          <td className="px-6 py-4 font-mono font-medium">{p.dueDate}</td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-on-surface-variant">
                            RD$ {parseFloat(p.amount).toLocaleString(undefined, {minimumFractionDigits: 2})}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-250">
                              ACEPTADO
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
