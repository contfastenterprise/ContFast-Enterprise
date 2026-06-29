'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useRbac } from '@/components/providers/rbacContext';
import { 
  Loader2, RefreshCw, BarChart2, Calendar, 
  Filter, Layers, User, Briefcase, Tag, AlertTriangle, ShieldCheck, FileText
} from 'lucide-react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import DateRangePicker from '@/components/ui/date-range-picker';

// Dynamically import Recharts-based BI views without SSR
const BIGeneral = dynamic(() => import('@/components/bi/bi-general'), { 
  ssr: false, 
  loading: () => <TabSkeleton /> 
});
const BIProducts = dynamic(() => import('@/components/bi/bi-products'), { 
  ssr: false, 
  loading: () => <TabSkeleton /> 
});
const BIInventory = dynamic(() => import('@/components/bi/bi-inventory'), { 
  ssr: false, 
  loading: () => <TabSkeleton /> 
});
const BICustomers = dynamic(() => import('@/components/bi/bi-customers'), { 
  ssr: false, 
  loading: () => <TabSkeleton /> 
});
const BIInvoices = dynamic(() => import('@/components/bi/bi-invoices'), { 
  ssr: false, 
  loading: () => <TabSkeleton /> 
});
const BIPurchases = dynamic(() => import('@/components/bi/bi-purchases'), { 
  ssr: false, 
  loading: () => <TabSkeleton /> 
});
const BIAlerts = dynamic(() => import('@/components/bi/bi-alerts'), { 
  ssr: false, 
  loading: () => <TabSkeleton /> 
});

function TabSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-slate-100 dark:bg-slate-800 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="h-80 bg-slate-100 dark:bg-slate-800 rounded-3xl" />
        <div className="h-80 bg-slate-100 dark:bg-slate-800 rounded-3xl" />
      </div>
    </div>
  );
}

export default function BIDashboardPage() {
  const router = useRouter();
  const { user, loading: rbacLoading, hasPermission } = useRbac();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'general' | 'products' | 'inventory' | 'customers' | 'billing' | 'purchases' | 'alerts'>('general');
  const [tabLoading, setTabLoading] = useState(true);

  // Stats Data
  const [generalData, setGeneralData] = useState<any>(null);
  const [productsData, setProductsData] = useState<any>(null);
  const [inventoryData, setInventoryData] = useState<any>(null);
  const [customersData, setCustomersData] = useState<any>(null);
  const [billingData, setBillingData] = useState<any>(null);
  const [purchasesData, setPurchasesData] = useState<any>(null);

  // Dropdown Metadata options for Filters
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  const [sellersList, setSellersList] = useState<any[]>([]);

  // Filter States
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // Default: first day of month
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [warehouseId, setWarehouseId] = useState<string>('all');
  const [userId, setUserId] = useState<string>('all');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [customerId, setCustomerId] = useState<string>('all');
  const [supplierId, setSupplierId] = useState<string>('all');
  const [invoiceStatus, setInvoiceStatus] = useState<string>('all');
  const [ecfType, setEcfType] = useState<string>('all');

  // Verify Role Restrictions: Only Systems or Admin
  useEffect(() => {
    if (!rbacLoading && user) {
      const role = (user.role || '').toLowerCase();
      const isAuth = role === 'sistemas' || role.includes('sistema') || role.includes('admin') || role.includes('administraci');
      if (!isAuth) {
        toast.error('Acceso denegado. No tiene permisos para ver Inteligencia de Negocios.');
        router.replace('/dashboard');
      }
    }
  }, [user, rbacLoading, router]);

  // Fetch dropdown filter options
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [whRes, catRes, custRes, suppRes, sellRes] = await Promise.all([
          fetch('/api/v1/warehouses'),
          fetch('/api/v1/categories'),
          fetch('/api/v1/customers?per_page=100'),
          fetch('/api/v1/suppliers?per_page=100'),
          fetch('/api/v1/admin/users').catch(() => null) // Suppress error if user doesn't have full admin user rights yet
        ]);

        if (whRes.ok) {
          const res = await whRes.json();
          if (res.success) setWarehouses(res.data || []);
        }
        if (catRes.ok) {
          const res = await catRes.json();
          if (res.success) setCategories(res.data || []);
        }
        if (custRes.ok) {
          const res = await custRes.json();
          if (res.success) setCustomersList(res.data || []);
        }
        if (suppRes.ok) {
          const res = await suppRes.json();
          if (res.success) setSuppliersList(res.data || []);
        }
        if (sellRes && sellRes.ok) {
          const res = await sellRes.json();
          if (res.success) setSellersList(res.data || []);
        }
      } catch (error) {
        console.error('Error fetching filter options:', error);
      }
    };

    fetchFilterOptions();
  }, []);

  // Main Fetch Data Handler
  const loadTabStats = useCallback(async () => {
    setTabLoading(true);
    try {
      // Build query string
      const params = new URLSearchParams({
        startDate,
        endDate,
        warehouseId,
        userId,
        categoryId,
        customerId,
        supplierId,
        status: invoiceStatus,
        ecfType
      });

      // Special case: General Tab requires loading Billing and Purchases details in parallel to draw charts
      if (activeTab === 'general') {
        const [genRes, billRes, purchRes] = await Promise.all([
          fetch(`/api/v1/bi/stats?tab=general&${params.toString()}`),
          fetch(`/api/v1/bi/stats?tab=billing&${params.toString()}`),
          fetch(`/api/v1/bi/stats?tab=purchases&${params.toString()}`)
        ]);

        const [genData, billData, purchData] = await Promise.all([
          genRes.json(),
          billRes.json(),
          purchRes.json()
        ]);

        if (genData.success) setGeneralData(genData.data);
        if (billData.success) setBillingData(billData.data);
        if (purchData.success) setPurchasesData(purchData.data);
      } 
      
      // Other individual tabs
      else {
        const res = await fetch(`/api/v1/bi/stats?tab=${activeTab}&${params.toString()}`);
        const data = await res.json();

        if (data.success) {
          if (activeTab === 'products') setProductsData(data.data);
          else if (activeTab === 'inventory') setInventoryData(data.data);
          else if (activeTab === 'customers') setCustomersData(data.data);
          else if (activeTab === 'billing') setBillingData(data.data);
          else if (activeTab === 'purchases') setPurchasesData(data.data);
          // Alerts relies on all tabs data. Let's pre-load necessary sets
          else if (activeTab === 'alerts') {
            // Load products, inventory & customers in parallel for comprehensive alert aggregates
            const [pRes, iRes, cRes, gRes] = await Promise.all([
              fetch(`/api/v1/bi/stats?tab=products&${params.toString()}`),
              fetch(`/api/v1/bi/stats?tab=inventory&${params.toString()}`),
              fetch(`/api/v1/bi/stats?tab=customers&${params.toString()}`),
              fetch(`/api/v1/bi/stats?tab=general&${params.toString()}`)
            ]);
            const [pData, iData, cData, gData] = await Promise.all([
              pRes.json(), iRes.json(), cRes.json(), gRes.json()
            ]);
            if (pData.success) setProductsData(pData.data);
            if (iData.success) setInventoryData(iData.data);
            if (cData.success) setCustomersData(cData.data);
            if (gData.success) setGeneralData(gData.data);
          }
        } else {
          toast.error(data.error?.message || 'Error al cargar estadísticas.');
        }
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      toast.error('Error de red al cargar el módulo BI.');
    } finally {
      setTabLoading(false);
    }
  }, [activeTab, startDate, endDate, warehouseId, userId, categoryId, customerId, supplierId, invoiceStatus, ecfType]);

  // Reload trigger
  useEffect(() => {
    if (user) {
      loadTabStats();
    }
  }, [activeTab, user]); // Trigger load on tab click or auth load

  const handleApplyFilters = () => {
    loadTabStats();
    toast.success('Filtros aplicados correctamente.');
  };

  const handleDateChange = (range: { from: string; to: string }) => {
    setStartDate(range.from);
    setEndDate(range.to);
  };

  if (rbacLoading || !user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-on-surface-variant font-medium">Validando credenciales...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* ─── HEADER SECTION ─── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-outline-variant/20 pb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#003366] flex items-center gap-2">
            <BarChart2 className="w-8 h-8 text-primary" />
            Inteligencia de Negocios
          </h1>
          <p className="text-sm text-on-surface-variant font-medium">
            Dashboards BI corporativos y analítica avanzada en tiempo real
          </p>
        </div>
        
        <button 
          onClick={loadTabStats}
          disabled={tabLoading}
          className="flex items-center gap-2 px-4 py-2 border border-outline-variant/30 bg-surface-bright hover:bg-slate-50 rounded-xl text-xs font-bold text-on-surface-variant disabled:opacity-50 cursor-pointer shadow-sm transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${tabLoading ? 'animate-spin' : ''}`} />
          Sincronizar Análisis
        </button>
      </div>

      {/* ─── GLOBAL FILTERS ACCORDION ─── */}
      <div className="bg-surface-bright border border-outline-variant/30 p-6 rounded-3xl space-y-6 shadow-sm">
        <div className="flex items-center gap-2 text-on-surface font-bold text-sm">
          <Filter className="w-4 h-4 text-primary" />
          Filtros de Análisis Corporativo
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {/* Date Picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-wider flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Rango de Fechas
            </label>
            <DateRangePicker from={startDate} to={endDate} onChange={handleDateChange} />
          </div>

          {/* Warehouse Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3 h-3" /> Almacén / Sucursal
            </label>
            <select 
              value={warehouseId}
              onChange={e => setWarehouseId(e.target.value)}
              className="rounded-xl border border-outline-variant bg-surface-bright text-on-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all cursor-pointer h-[38px] shadow-sm"
            >
              <option value="all">Todos los Almacenes</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
          </div>

          {/* User/Seller Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-wider flex items-center gap-1">
              <User className="w-3 h-3" /> Vendedor / Representante
            </label>
            <select 
              value={userId}
              onChange={e => setUserId(e.target.value)}
              className="rounded-xl border border-outline-variant bg-surface-bright text-on-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all cursor-pointer h-[38px] shadow-sm"
            >
              <option value="all">Todos los Vendedores</option>
              {sellersList.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Category Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-wider flex items-center gap-1">
              <Tag className="w-3 h-3" /> Categoría Producto
            </label>
            <select 
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="rounded-xl border border-outline-variant bg-surface-bright text-on-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all cursor-pointer h-[38px] shadow-sm"
            >
              <option value="all">Todas las Categorías</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Customer Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-wider flex items-center gap-1">
              <User className="w-3 h-3" /> Cliente Específico
            </label>
            <select 
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
              className="rounded-xl border border-outline-variant bg-surface-bright text-on-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all cursor-pointer h-[38px] shadow-sm"
            >
              <option value="all">Todos los Clientes</option>
              {customersList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Supplier Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-wider flex items-center gap-1">
              <Briefcase className="w-3 h-3" /> Suplidor / Proveedor
            </label>
            <select 
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              className="rounded-xl border border-outline-variant bg-surface-bright text-on-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all cursor-pointer h-[38px] shadow-sm"
            >
              <option value="all">Todos los Proveedores</option>
              {suppliersList.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Invoice Status Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Estado de Envío e-CF
            </label>
            <select 
              value={invoiceStatus}
              onChange={e => setInvoiceStatus(e.target.value)}
              className="rounded-xl border border-outline-variant bg-surface-bright text-on-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all cursor-pointer h-[38px] shadow-sm"
            >
              <option value="all">Todos los Estados</option>
              <option value="accepted">Aceptado por DGII</option>
              <option value="submitted">Enviado (Procesando)</option>
              <option value="rejected">Rechazado por DGII</option>
              <option value="draft">Borrador</option>
              <option value="void">Anulado</option>
            </select>
          </div>

          {/* e-CF Type Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-wider flex items-center gap-1">
              <FileText className="w-3 h-3" /> Tipo Comprobante (e-CF)
            </label>
            <select 
              value={ecfType}
              onChange={e => setEcfType(e.target.value)}
              className="rounded-xl border border-outline-variant bg-surface-bright text-on-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all cursor-pointer h-[38px] shadow-sm"
            >
              <option value="all">Todos los Comprobantes</option>
              <option value="31">Factura Crédito Fiscal (E31)</option>
              <option value="32">Consumo (E32)</option>
              <option value="33">Nota de Débito (E33)</option>
              <option value="34">Nota de Crédito (E34)</option>
              <option value="41">Gastos del Exterior (E41)</option>
              <option value="43">Gastos Menores (E43)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button 
            onClick={handleApplyFilters}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary hover:bg-[#002244] rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm"
          >
            Aplicar Filtros de Negocios
          </button>
        </div>
      </div>

      {/* ─── TAB NAVIGATION SECTION ─── */}
      <div className="flex overflow-x-auto gap-2 p-1.5 bg-surface-variant/40 rounded-2xl w-fit max-w-full custom-scrollbar">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'general' ? 'bg-surface-bright text-[#003366] shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
        >
          General Ejecutiva
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'products' ? 'bg-surface-bright text-[#003366] shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
        >
          Productos
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'inventory' ? 'bg-surface-bright text-[#003366] shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
        >
          Inventario
        </button>
        <button
          onClick={() => setActiveTab('customers')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'customers' ? 'bg-surface-bright text-[#003366] shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
        >
          Clientes
        </button>
        <button
          onClick={() => setActiveTab('billing')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'billing' ? 'bg-surface-bright text-[#003366] shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
        >
          Ventas y e-CF
        </button>
        <button
          onClick={() => setActiveTab('purchases')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'purchases' ? 'bg-surface-bright text-[#003366] shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
        >
          Compras y Egresos
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'alerts' ? 'bg-surface-bright text-[#003366] shadow-xs flex items-center gap-1' : 'text-on-surface-variant hover:text-on-surface flex items-center gap-1'}`}
        >
          Alertas
          {generalData?.productsLowStock > 0 || generalData?.overdueInvoices > 0 ? (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          ) : null}
        </button>
      </div>

      {/* ─── TAB RENDER SECTION ─── */}
      <div className="min-h-[450px]">
        {tabLoading ? (
          <TabSkeleton />
        ) : (
          <>
            {activeTab === 'general' && (
              <BIGeneral 
                generalData={generalData} 
                billingData={billingData} 
                purchasesData={purchasesData} 
              />
            )}
            {activeTab === 'products' && (
              <BIProducts 
                data={productsData} 
                onNavigateToProduct={(id) => router.push('/dashboard/products')}
              />
            )}
            {activeTab === 'inventory' && (
              <BIInventory data={inventoryData} />
            )}
            {activeTab === 'customers' && (
              <BICustomers 
                data={customersData} 
                onNavigateToCustomer={(id) => router.push('/dashboard/customers')}
              />
            )}
            {activeTab === 'billing' && (
              <BIInvoices data={billingData} />
            )}
            {activeTab === 'purchases' && (
              <BIPurchases data={purchasesData} />
            )}
            {activeTab === 'alerts' && (
              <BIAlerts 
                generalData={generalData}
                productsData={productsData}
                inventoryData={inventoryData}
                customersData={customersData}
              />
            )}
          </>
        )}
      </div>

    </div>
  );
}
