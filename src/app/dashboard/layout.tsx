'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Shield, Building, LayoutDashboard, FileText, Wallet, Landmark, BookOpen, Settings, LogOut, Menu, X, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Load user data on mount
  useEffect(() => {
    // We can extract user details from localstorage or a quick token check endpoint.
    // For now, let's load a mock profile or decode cookies if we can, or simply query the auth state.
    // Let's do a fallback and set user data from standard active user session mock or fetch.
    const savedUser = typeof window !== 'undefined' ? localStorage.getItem('cf_user') : null;
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    } else {
      // Set systems engineer default if we are testing locally
      setUser({
        name: 'Administrador ContFast',
        email: 'admin@contfast.com',
        role: 'sistemas',
        companyId: '123',
      });
    }
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

  const navItems = [
    { name: 'Inicio', href: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
    { name: 'Facturación e-CF', href: '/invoices', icon: <FileText className="h-5 w-5" /> },
    { name: 'Módulo de Caja', href: '/cash', icon: <Wallet className="h-5 w-5" /> },
    { name: 'Cuentas Bancarias', href: '/dashboard/bank', icon: <Landmark className="h-5 w-5" /> },
    { name: 'Contabilidad General', href: '/dashboard/accounting', icon: <BookOpen className="h-5 w-5" /> },
    { name: 'Permisos & Admin', href: '/dashboard/admin', icon: <Settings className="h-5 w-5" /> },
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Toaster position="top-right" richColors />

      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col bg-slate-900 border-r border-slate-800">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-slate-800">
          <Shield className="h-6 w-6 text-amber-500" />
          <span className="font-display font-bold text-lg text-white">ContFast <span className="text-amber-500">ENT</span></span>
        </div>

        {/* User Card */}
        <div className="px-4 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-950 border border-blue-900 flex items-center justify-center text-amber-500 font-bold uppercase text-sm">
              {user?.name?.substring(0, 2) || 'CF'}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-white truncate">{user?.name || 'Administrador'}</p>
              <span className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-500 ring-1 ring-inset ring-amber-500/20 uppercase mt-0.5">
                {user?.role || 'Sistemas'}
              </span>
            </div>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <a
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-md transition-all duration-200 ${
                  active
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/10'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.icon}
                {item.name}
              </a>
            );
          })}
        </nav>

        {/* Logout Section */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold rounded-md text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden flex">
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black"
            />

            {/* Sidebar content */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative flex w-64 max-w-xs flex-col bg-slate-900 border-r border-slate-800 z-50"
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Shield className="h-6 w-6 text-amber-500" />
                  <span className="font-display font-bold text-lg text-white">ContFast <span className="text-amber-500">ENT</span></span>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="px-4 py-4 border-b border-slate-800 bg-slate-950/40">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-950 border border-blue-900 flex items-center justify-center text-amber-500 font-bold uppercase text-sm">
                    {user?.name?.substring(0, 2) || 'CF'}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white truncate">{user?.name || 'Administrador'}</p>
                    <span className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-500 ring-1 ring-inset ring-amber-500/20 uppercase mt-0.5">
                      {user?.role || 'Sistemas'}
                    </span>
                  </div>
                </div>
              </div>

              <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
                {navItems.map((item) => {
                  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                  return (
                    <a
                      key={item.name}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-md transition-all duration-200 ${
                        active
                          ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/10'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      {item.icon}
                      {item.name}
                    </a>
                  );
                })}
              </nav>

              <div className="p-4 border-t border-slate-800">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold rounded-md text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  <LogOut className="h-5 w-5" />
                  Cerrar Sesión
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Mobile Header */}
        <header className="flex md:hidden items-center justify-between h-16 px-6 bg-slate-900 border-b border-slate-800">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-white">
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-500" />
            <span className="font-display font-bold text-base text-white">ContFast <span className="text-amber-500">ENT</span></span>
          </div>
          <div className="h-8 w-8 rounded-full bg-blue-950 border border-blue-900 flex items-center justify-center text-amber-500 font-bold text-xs uppercase">
            {user?.name?.substring(0, 2) || 'CF'}
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto bg-slate-950 p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
