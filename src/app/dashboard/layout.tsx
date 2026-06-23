'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Shield, PanelLeftClose, PanelLeftOpen, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import clsx from 'clsx';
import AppSidebar from '@/components/ui/app-sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const [entorno, setEntorno] = useState<'TEST' | 'CERT' | 'PROD'>('TEST');
  const [companies, setCompanies] = useState<any[]>([]);
  const [switching, setSwitching] = useState(false);

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
          if (data.data?.companyName) setCompanyName(data.data.companyName);
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

  useEffect(() => {
    if (user?.role === 'sistemas') {
      fetch('/api/v1/admin/companies')
        .then(res => res.json())
        .then(data => { if (data.success) setCompanies(data.data); })
        .catch(console.error);
    }
  }, [user]);

  // Role-based redirect from /dashboard root
  useEffect(() => {
    if (user && pathname === '/dashboard') {
      const normalized = (user.role || '').toLowerCase();
      const isAdminOrSys = normalized.includes('admin') || normalized.includes('sistema');
      if (!isAdminOrSys) {
        const roleRedirectMap: Record<string, string> = {
          factura: '/dashboard/invoices',
          cajero: '/dashboard/cash',
          contab: '/dashboard/accounting',
          banco: '/dashboard/bank',
        };
        const match = Object.entries(roleRedirectMap).find(([r]) => normalized.includes(r));
        if (match) {
          router.replace(match[1]);
        } else {
          router.replace('/auth/login');
        }
      }
    }
  }, [user, pathname, router]);

  const handleSwitchCompany = async (newCompanyId: string) => {
    if (newCompanyId === user.companyId) return;
    setSwitching(true);
    try {
      const res = await fetch('/api/v1/auth/switch-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newCompanyId }),
      });
      if (res.ok) {
        toast.success('Cambiando de empresa...');
        setTimeout(() => window.location.reload(), 500);
      } else {
        const data = await res.json();
        toast.error(data.error?.message || 'Error al cambiar de empresa');
        setSwitching(false);
      }
    } catch {
      toast.error('Error de red al cambiar de empresa');
      setSwitching(false);
    }
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/v1/auth/logout', { method: 'POST' });
      if (response.ok) {
        if (typeof window !== 'undefined') localStorage.removeItem('cf_user');
        toast.success('Sesión cerrada correctamente.');
        setTimeout(() => router.push('/auth/login'), 800);
      } else {
        throw new Error('No se pudo cerrar la sesión.');
      }
    } catch (error: any) {
      toast.error('Error al cerrar sesión', { description: error.message });
    }
  };

  return (
    <div className="font-body-md text-on-surface custom-scrollbar overflow-x-hidden min-h-screen bg-background">
      <Toaster position="top-right" richColors />

      {/* Environment Stripe */}
      {entorno !== 'PROD' && (
        <div
          className={`environment-stripe w-full h-10 flex items-center justify-center fixed top-0 left-0 z-[60] shadow-md ${
            entorno === 'TEST'
              ? 'bg-[repeating-linear-gradient(45deg,#fed488,#fed488_20px,#e9c176_20px,#e9c176_40px)]'
              : 'bg-[repeating-linear-gradient(45deg,#bfdbfe,#bfdbfe_20px,#93c5fd_20px,#93c5fd_40px)]'
          }`}
        >
          <span className="font-label-md text-on-secondary-fixed flex items-center gap-2 uppercase tracking-widest font-bold text-gray-800">
            <Shield className="h-4 w-4" />
            {entorno === 'TEST' ? 'ENTORNO DE PRUEBAS - SIN VALOR FISCAL' : 'ENTORNO DE CERTIFICACIÓN'}
          </span>
        </div>
      )}

      {/* TopNavBar */}
      <nav className="bg-primary/95 backdrop-blur-md text-on-primary flex justify-between items-center w-full px-4 md:px-6 h-14 fixed top-10 left-0 z-50 border-b border-white/10">
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 hover:bg-white/10 rounded-lg transition-all"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" strokeWidth={1.5} />
          </button>

          {/* Desktop sidebar toggle */}
          <button
            onClick={() => setSidebarCollapsed(prev => !prev)}
            className="hidden md:flex p-2 hover:bg-white/10 rounded-lg transition-all"
            title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {sidebarCollapsed
              ? <PanelLeftOpen className="h-5 w-5" strokeWidth={1.5} />
              : <PanelLeftClose className="h-5 w-5" strokeWidth={1.5} />
            }
          </button>

          {/* Company name — suppressHydrationWarning allows SSR/client content to differ */}
          <span
            suppressHydrationWarning
            className="font-display-lg text-xl font-extrabold text-secondary-fixed tracking-tight min-w-[80px]"
          >
            {switching ? '' : companyName}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* User avatar */}
          <div className="w-9 h-9 rounded-full bg-surface-variant flex items-center justify-center overflow-hidden border-2 border-white/20 shadow-inner hover:scale-105 transition-transform cursor-pointer text-primary font-bold text-sm">
            {user?.name?.substring(0, 2) || 'CF'}
          </div>
          {/* ContFast logo */}
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

      {/* AppSidebar */}
      <AppSidebar
        user={user}
        companies={companies}
        companyName={companyName}
        entorno={entorno}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onLogout={handleLogout}
        onSwitchCompany={handleSwitchCompany}
        switching={switching}
      />

      {/* Main Content Wrapper */}
      <div
        className={clsx(
          'flex flex-col min-h-screen pt-24 transition-[margin] duration-300 ease-in-out',
          sidebarCollapsed ? 'md:ml-[64px]' : 'md:ml-[260px]'
        )}
      >
        <main className="flex-1 p-4 md:p-8 w-full min-w-0">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-surface-bright/80 backdrop-blur-md border-t border-outline-variant/20 flex flex-col md:flex-row justify-between items-center px-8 py-6 z-40 gap-4 mt-auto">
          <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
            <span className="hidden md:block w-px h-6 bg-outline-variant/30" />
            <span className="font-body-sm text-on-surface-variant/70">© 2026 ContFast Enterprise - Proveedor Autorizado DGII</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
