'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Shield, ShieldCheck, LayoutDashboard, FileText, Wallet, Landmark, BookOpen, Settings, LogOut, Menu, X, Users, Truck, Package, HandCoins, Receipt, PieChart, Building2, ArrowRightLeft, History as HistoryIcon, Banknote, PackageMinus, Tag, ShoppingCart, FileMinus, Calculator, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [entorno, setEntorno] = useState<'TEST' | 'CERT' | 'PROD'>('TEST');

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/v1/auth/me');
        const data = await res.json();
        if (data.success && data.data?.user) {
          setUser(data.data.user);
        } else {
          router.push('/auth/login');
        }
      } catch (err) {
        console.error('Error fetching user profile', err);
      }
    };
    fetchUser();

    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/v1/company/settings');
        const data = await res.json();
        if (data.success) {
          if (data.data?.logoUrl) setLogoUrl(data.data.logoUrl);
          
          const env = data.data?.msellerEntorno || data.data?.dgiiEnv;
          if (env === 'production') setEntorno('PROD');
          else if (env === 'cert') setEntorno('CERT');
          else setEntorno('TEST');
        }
      } catch (err) {
        console.error('Error fetching company settings', err);
      }
    };
    fetchSettings();
  }, []);

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/v1/auth/logout', { method: 'POST' });
      if (response.ok) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('cf_user');
        }
        toast.success('Sesión cerrada correctamente.');
        setTimeout(() => {
          router.push('/auth/login');
        }, 800);
      } else {
        throw new Error('No se pudo cerrar la sesión.');
      }
    } catch (error: any) {
      toast.error('Error al cerrar sesión', { description: error.message });
    }
  };

  const navGroups = [
    {
      title: 'Principal',
      items: [
        { name: 'Inicio', href: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
        { name: 'Módulo de Caja', href: '/dashboard/cash', icon: <Wallet className="h-5 w-5" /> },
      ]
    },
    {
      title: 'Contactos',
      items: [
        { name: 'Clientes', href: '/dashboard/customers', icon: <Users className="h-5 w-5" /> },
        { name: 'Suplidores', href: '/dashboard/suppliers', icon: <Truck className="h-5 w-5" /> },
      ]
    },
    {
      title: 'Inventario',
      items: [
        { name: 'Productos', href: '/dashboard/products', icon: <Package className="h-5 w-5" /> },
        { name: 'Categorías', href: '/dashboard/inventory/categories', icon: <Tag className="h-5 w-5" /> },
        { name: 'Almacenes', href: '/dashboard/warehouses', icon: <Building2 className="h-5 w-5" /> },
        { name: 'Conduces', href: '/dashboard/delivery-notes', icon: <Truck className="h-5 w-5" /> },
        { name: 'Traslados', href: '/dashboard/inventory/transfer', icon: <ArrowRightLeft className="h-5 w-5" /> },
        { name: 'Ajustes', href: '/dashboard/inventory/adjustments', icon: <PackageMinus className="h-5 w-5" /> },
        { name: 'Movimientos', href: '/dashboard/inventory/movements', icon: <HistoryIcon className="h-5 w-5" /> },
      ]
    },
    {
      title: 'Ingresos',
      items: [
        { name: 'Facturación e-CF', href: '/dashboard/invoices', icon: <FileText className="h-5 w-5" /> },
        { name: 'Cotizaciones', href: '/dashboard/quotes', icon: <FileText className="h-5 w-5" /> },
        { name: 'Crédito / Débito', href: '/dashboard/adjustments', icon: <FileMinus className="h-5 w-5" /> },
        { name: 'Cobros y Abonos', href: '/dashboard/receivables', icon: <HandCoins className="h-5 w-5" /> },
      ]
    },
    {
      title: 'Egresos',
      items: [
        { name: 'Compras y Gastos', href: '/dashboard/purchases', icon: <Banknote className="h-5 w-5" /> },
        { name: 'Cuentas por Pagar', href: '/dashboard/ap', icon: <Receipt className="h-5 w-5" /> },
      ]
    },
    {
      title: 'Finanzas Y Reportes',
      items: [
        { name: 'Cuentas Bancarias', href: '/dashboard/bank', icon: <Landmark className="h-5 w-5" /> },
        { name: 'Contabilidad General', href: '/dashboard/accounting', icon: <BookOpen className="h-5 w-5" /> },
        { name: 'Reportes', href: '/dashboard/reports', icon: <PieChart className="h-5 w-5" /> },
      ]
    },
    {
      title: 'Herramientas',
      items: [
        { name: 'Desglose Ventanas', href: '/dashboard/tools/desglose/ventanas', icon: <Calculator className="h-5 w-5" /> },
        { name: 'Corte de Vidrio', href: '/dashboard/tools/glass-cutting', icon: <Layers className="h-5 w-5" /> },
      ]
    },
    {
      title: 'Sistemas',
      items: [
        { name: 'Ajustes del Sistema', href: '/dashboard/settings', icon: <Settings className="h-5 w-5" /> },
        { name: 'Comprobantes Fiscales', href: '/dashboard/ecf', icon: <ShieldCheck className="h-5 w-5" /> },
        { name: 'Administración', href: '/dashboard/admin', icon: <Shield className="h-5 w-5" /> },
      ]
    }
  ];

  return (
    <div className="font-body-md text-on-surface custom-scrollbar overflow-x-hidden min-h-screen bg-background">
      <Toaster position="top-right" richColors />

      {/* Environment Indicator */}
      {entorno !== 'PROD' && (
        <div className={`environment-stripe w-full h-10 flex items-center justify-center fixed top-0 left-0 z-[60] shadow-md ${entorno === 'TEST' ? 'bg-[repeating-linear-gradient(45deg,#fed488,#fed488_20px,#e9c176_20px,#e9c176_40px)]' : 'bg-[repeating-linear-gradient(45deg,#bfdbfe,#bfdbfe_20px,#93c5fd_20px,#93c5fd_40px)]'}`}>
          <span className="font-label-md text-on-secondary-fixed flex items-center gap-2 uppercase tracking-widest font-bold text-gray-800">
            <Shield className="h-4 w-4" />
            {entorno === 'TEST' ? 'ENTORNO DE PRUEBAS - SIN VALOR FISCAL' : 'ENTORNO DE CERTIFICACIÓN'}
          </span>
        </div>
      )}

      {/* TopNavBar Shell */}
      <nav className="bg-primary/95 backdrop-blur-md text-on-primary flex justify-between items-center w-full px-8 h-14 fixed top-10 left-0 z-50 border-b border-white/10">
        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-white/10 rounded-full transition-all md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-display-lg text-xl font-extrabold text-secondary-fixed tracking-tight flex items-center h-full py-1">
            {logoUrl ? <img src={logoUrl} alt="Logo Empresa" className="h-10 w-auto md:h-12 rounded-lg object-contain" /> : 'Latin Doors e-CF'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-full bg-surface-variant flex items-center justify-center overflow-hidden border-2 border-white/20 shadow-inner hover:scale-105 transition-transform cursor-pointer text-primary font-bold text-sm">
            {user?.name?.substring(0, 2) || 'CF'}
          </div>
          {/* ContFast System Logo - Top Right */}
          <div className="flex items-center gap-2 pl-3 border-l border-white/20">
            <img
              src="/contfast-logo.png"
              alt="ContFast Enterprise"
              className="h-9 w-9 rounded-xl object-cover shadow-md shadow-black/30 ring-1 ring-white/20 hover:scale-105 transition-transform"
            />
            <span className="hidden lg:block text-xs font-bold text-white/80 leading-tight">
              ContFast<br />
              <span className="text-amber-400 font-extrabold">Enterprise</span>
            </span>
          </div>
        </div>
      </nav>

      <div className="flex min-h-screen pt-24">
        {/* SideNavBar Shell (Desktop) */}
        <aside className="hidden md:flex bg-surface-bright/50 backdrop-blur-xl fixed left-0 top-0 h-full w-72 flex-col pt-28 z-40 border-r border-outline-variant/30">
          <div className="px-4 mb-8">
            <div className="flex items-center gap-4 p-4 glass-card rounded-2xl bg-white/70 shadow-sm border border-white/40 backdrop-blur-md">
              <div className="w-10 h-10 bg-primary-container rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                <Shield className="text-secondary-fixed h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 title={user?.name} className="font-headline-xs text-base font-bold text-primary leading-tight truncate w-full">{user?.name || 'Latin Doors'}</h3>
                <p title={user?.email} className="font-body-xs text-on-surface-variant/80 truncate w-full">{user?.email || 'RNC: 131-XXXXX-X'}</p>
              </div>
            </div>

          </div>
          <nav className="flex-1 px-4 pb-6 overflow-y-auto custom-scrollbar">
            {navGroups.map((group, gIdx) => (
              <div key={group.title} className={gIdx > 0 ? "mt-6" : ""}>
                <div className="px-4 mb-2 text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">
                  {group.title}
                </div>
                <div className="space-y-1.5">
                  {group.items.map((item) => {
                    const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                    return (
                      <a
                        key={item.name}
                        href={item.href}
                        className={`flex items-center gap-4 rounded-xl px-4 py-3 transition-all group ${active
                          ? 'bg-primary/10 text-primary font-bold shadow-sm'
                          : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-high font-medium'
                          }`}
                      >
                        <div className={`transition-transform ${active ? '' : 'group-hover:scale-110'}`}>
                          {item.icon}
                        </div>
                        <span className="font-label-md">{item.name}</span>
                      </a>
                    );
                  })}
                </div>
                {gIdx < navGroups.length - 1 && (
                  <div className="mt-6 border-b border-outline-variant/30 w-full" />
                )}
              </div>
            ))}
          </nav>
          <div className="p-6 mt-auto border-t border-outline-variant/20 space-y-3">
            <div className="flex items-center gap-3 text-on-surface-variant/70 px-2 py-1 text-xs font-semibold">
              <span className={`h-2 w-2 rounded-full ${entorno === 'PROD' ? 'bg-green-500' : entorno === 'CERT' ? 'bg-blue-500' : 'bg-yellow-500'}`}></span>
              Entorno: {entorno === 'PROD' ? 'Producción' : entorno === 'CERT' ? 'Certificación' : 'Pruebas'}
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 text-error/80 px-2 py-2 hover:bg-error/5 hover:text-error rounded-xl transition-all text-xs font-bold"
            >
              <LogOut className="h-4 w-4" />
              Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* Mobile Drawer */}
        <AnimatePresence>
          {sidebarOpen && (
            <div className="fixed inset-0 z-[70] md:hidden flex">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={() => setSidebarOpen(false)}
                className="fixed inset-0 bg-black/50"
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="relative bg-surface-bright/95 backdrop-blur-xl h-full w-72 flex flex-col pt-6 z-[80] border-r border-outline-variant/30 shadow-2xl"
              >
                <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 p-2 text-on-surface-variant">
                  <X className="h-5 w-5" />
                </button>
                <div className="px-6 mb-8 mt-4">
                  <div className="flex items-center gap-4 p-4 glass-card rounded-2xl bg-white/70 shadow-sm border border-white/40">
                    <div className="w-10 h-10 bg-primary-container rounded-xl flex items-center justify-center flex-shrink-0">
                      <Shield className="text-secondary-fixed h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 title={user?.name} className="font-headline-sm text-sm font-bold text-primary leading-tight truncate w-full">{user?.name || 'Latin Doors'}</h2>
                      <p title={user?.email} className="font-body-xs text-on-surface-variant/80 truncate w-full">{user?.email}</p>
                    </div>
                  </div>
                </div>
                <nav className="flex-1 px-4 pb-6 overflow-y-auto custom-scrollbar">
                  {navGroups.map((group, gIdx) => (
                    <div key={group.title} className={gIdx > 0 ? "mt-6" : ""}>
                      <div className="px-4 mb-2 text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">
                        {group.title}
                      </div>
                      <div className="space-y-1.5">
                        {group.items.map((item) => {
                          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                          return (
                            <a
                              key={item.name}
                              href={item.href}
                              onClick={() => setSidebarOpen(false)}
                              className={`flex items-center gap-4 rounded-xl px-4 py-3 transition-all group ${active
                                ? 'bg-primary/10 text-primary font-bold shadow-sm'
                                : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-high font-medium'
                                }`}
                            >
                              <div className={`transition-transform ${active ? '' : 'group-hover:scale-110'}`}>
                                {item.icon}
                              </div>
                              <span className="font-label-md">{item.name}</span>
                            </a>
                          );
                        })}
                      </div>
                      {gIdx < navGroups.length - 1 && (
                        <div className="mt-6 border-b border-outline-variant/30 w-full" />
                      )}
                    </div>
                  ))}
                </nav>
                <div className="p-6 mt-auto border-t border-outline-variant/20">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 text-error/80 px-2 py-2 hover:bg-error/5 hover:text-error rounded-xl transition-all text-xs font-bold"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar Sesión
                  </button>
                </div>
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        {/* Main Content Area */}
        <main className="flex-1 md:ml-72 p-4 md:p-8 w-full md:w-[calc(100%-18rem)] min-w-0">
          {children}
        </main>
      </div>

      {/* Footer Shell */}
      <footer className="bg-surface-bright/80 backdrop-blur-md border-t border-outline-variant/20 md:ml-72 flex flex-col md:flex-row justify-between items-center px-8 py-6 z-40 gap-4 mt-auto">
        <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
          <span className="hidden md:block w-px h-6 bg-outline-variant/30"></span>
          <span className="font-body-sm text-on-surface-variant/70">© 2026 ContFast Enterprise- Proveedor Autorizado DGII</span>
        </div>
      </footer>
    </div>
  );
}
