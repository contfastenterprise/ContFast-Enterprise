'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Shield, PanelLeftClose, PanelLeftOpen, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import clsx from 'clsx';
import NewAppSidebar from '@/components/ui/new-app-sidebar';
import Avatar from '@/components/ui/Avatar';
import { RbacProvider } from '@/components/providers/rbacContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Load sidebar collapsed state preference from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('sidebarCollapsed');
    if (stored !== null) {
      setSidebarCollapsed(JSON.parse(stored));
    }
  }, []);
  const [user, setUser] = useState<any>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const [entorno, setEntorno] = useState<'TEST' | 'CERT' | 'PROD'>('TEST');
  const [activeEnvironment, setActiveEnvironment] = useState<'PRODUCCION' | 'PRUEBA'>('PRODUCCION');
  const [companies, setCompanies] = useState<any[]>([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    const checkSetupAndFetchUser = async () => {
      try {
        const setupRes = await fetch('/api/v1/setup/status');
        const setupData = await setupRes.json();
        if (setupData.success && !setupData.data.initialized) {
          router.push('/setup');
          return;
        }

        const res = await fetch('/api/v1/auth/me');
        const data = await res.json();
        if (data.success && data.data?.user) {
          setUser(data.data.user);
        } else {
          router.push('/auth/login');
        }
      } catch (err) {
        console.error('Error in init sequence', err);
      }
    };
    checkSetupAndFetchUser();

    window.addEventListener('user-profile-updated', checkSetupAndFetchUser);

    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/v1/company/settings');
        const data = await res.json();
        if (data.success) {
          if (data.data?.logoUrl) setLogoUrl(data.data.logoUrl);
          if (data.data?.companyName) setCompanyName(data.data.companyName);
          const env = data.data?.dgiiEnv || data.data?.msellerEntorno;
          if (env === 'production') setEntorno('PROD');
          else if (env === 'cert') setEntorno('CERT');
          else setEntorno('TEST');

          // Auto-sync working environment with company settings
          const targetEnv = env === 'production' ? 'PRODUCCION' : 'PRUEBA';
          const getCookie = (name: string) => {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop()?.split(';').shift();
            return null;
          };
          const savedEnv = getCookie('cf_environment');
          if (savedEnv !== targetEnv) {
            document.cookie = `cf_environment=${targetEnv}; path=/; max-age=31536000; SameSite=Strict`;
            setActiveEnvironment(targetEnv);
            // Refresh to apply new RLS mode globally in Next.js
            window.location.reload();
          } else {
            setActiveEnvironment(targetEnv);
          }
        }
      } catch (err) {
        console.error('Error fetching company settings', err);
      }
    };
    fetchSettings();

    window.addEventListener('company-settings-updated', fetchSettings);

    return () => {
      window.removeEventListener('user-profile-updated', checkSetupAndFetchUser);
      window.removeEventListener('company-settings-updated', fetchSettings);
    };
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

  // Inactividad / Auto-logout automático al expirar el tiempo de inactividad
  useEffect(() => {
    // Configuración del tiempo máximo de inactividad (15 minutos)
    const TIEMPO_INACTIVIDAD_MS = 15 * 60 * 1000;
    let ultimoAcceso = Date.now();
    let timerId: NodeJS.Timeout;

    const verificarInactividad = () => {
      const tiempoTranscurrido = Date.now() - ultimoAcceso;
      if (tiempoTranscurrido >= TIEMPO_INACTIVIDAD_MS) {
        toast.warning('Su sesión ha expirado por inactividad.');
        fetch('/api/v1/auth/logout', { method: 'POST' }).finally(() => {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('cf_user');
          }
          router.push('/auth/login');
        });
      } else {
        clearTimeout(timerId);
        timerId = setTimeout(verificarInactividad, TIEMPO_INACTIVIDAD_MS - tiempoTranscurrido);
      }
    };

    const registrarActividad = () => {
      ultimoAcceso = Date.now();
      clearTimeout(timerId);
      timerId = setTimeout(verificarInactividad, TIEMPO_INACTIVIDAD_MS);
    };

    const manejarEnfoquePestana = () => {
      if (document.visibilityState === 'visible') {
        verificarInactividad();
      }
    };

    const eventos = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'];
    eventos.forEach((evento) => {
      window.addEventListener(evento, registrarActividad);
    });

    window.addEventListener('visibilitychange', manejarEnfoquePestana);
    window.addEventListener('focus', manejarEnfoquePestana);

    registrarActividad();

    return () => {
      clearTimeout(timerId);
      eventos.forEach((evento) => {
        window.removeEventListener(evento, registrarActividad);
      });
      window.removeEventListener('visibilitychange', manejarEnfoquePestana);
      window.removeEventListener('focus', manejarEnfoquePestana);
    };
  }, [router]);

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
    <RbacProvider initialUser={user}>
      <div className="font-body-md text-on-surface custom-scrollbar overflow-x-hidden min-h-screen bg-background">
        <Toaster position="top-right" richColors />
  
        {/* Environment Stripe */}
        {activeEnvironment === 'PRUEBA' && (
          <div className="w-full h-11 bg-[repeating-linear-gradient(45deg,#ef4444,#ef4444_15px,#f97316_15px,#f97316_30px)] text-white flex items-center justify-center fixed top-0 left-0 z-[60] shadow-md border-b-2 border-red-700 select-none">
            <span className="font-label-md text-sm font-black flex items-center gap-2 uppercase tracking-widest text-white drop-shadow-md">
              <Shield className="h-5 w-5 animate-pulse text-white" />
              MODO PRUEBA (SANDBOX) - OPERACIONES FISCALMENTE NULAS
            </span>
          </div>
        )}
  
        {/* TopNavBar */}
        <nav className={clsx(
          "backdrop-blur-md flex justify-between items-center w-full px-4 md:px-6 h-14 fixed left-0 z-50 border-b transition-all duration-300",
          activeEnvironment === 'PRUEBA'
            ? 'top-11 bg-zinc-950 text-white border-red-500/20 shadow-md'
            : 'top-0 bg-[radial-gradient(ellipse_at_center,#003e80_0%,#001e40_80%,#00142b_100%)] text-white border-white/10 shadow-lg'
        )}>
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-lg transition-all hover:bg-white/10 text-white"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" strokeWidth={1.5} />
            </button>
  
            <button
              onClick={() => setSidebarCollapsed(prev => {
                const next = !prev;
                localStorage.setItem('sidebarCollapsed', JSON.stringify(next));
                return next;
                })}
              className="hidden md:flex p-2 rounded-lg transition-all hover:bg-white/10 text-white"
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
              className="font-display-lg text-xl font-extrabold tracking-tight min-w-[80px] text-white"
            >
              {switching ? '' : companyName}
            </span>
          </div>
  
          <div className="flex items-center gap-4">
            {/* Environment Indicator Badge */}
            {activeEnvironment === 'PRUEBA' && (
              <div 
                onClick={() => toast.info('El ambiente está enlazado a la configuración de la empresa. Cámbielo en Ajustes.')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black tracking-wider border mr-2 select-none cursor-pointer transition-all duration-200 active:scale-95 bg-red-950/60 text-red-400 border-red-500/30 hover:bg-red-900/60"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                SANDBOX
              </div>
            )}

            {/* User name, role & avatar */}
            <div className="flex items-center gap-2.5 select-none">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-[13px] font-semibold tracking-wide leading-tight text-white">
                  {user?.name || 'Usuario'}
                </span>
                <span className="text-[10px] font-medium leading-none mt-0.5 text-blue-200/80">
                  {user?.role || ''}
                </span>
              </div>
              <Avatar 
                src={user?.avatarUrl} 
                name={user?.name || 'CF'} 
                size={36} 
                className="border-2 shadow-inner hover:scale-105 transition-transform cursor-pointer border-white/20"
              />
            </div>
            {/* ContFast logo */}
            <div className="flex items-center gap-2 pl-3 border-l border-white/20">
              <img
                src="/contfast-logo.png"
                alt="ContFast Enterprise"
                className="h-9 w-9 rounded-xl object-cover shadow-md shadow-black/30 ring-1 ring-white/20 hover:scale-105 transition-transform"
              />
              <span className="hidden lg:block text-xs font-bold leading-tight text-white/80">
                ContFast<br />
                <span className="font-extrabold text-amber-400">Enterprise</span>
              </span>
            </div>
          </div>
        </nav>
  
        {/* AppSidebar */}
        <NewAppSidebar
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
            'flex flex-col min-h-screen transition-[padding] duration-300 ease-in-out',
            activeEnvironment === 'PRUEBA' ? 'pt-24' : 'pt-14',
            sidebarCollapsed ? 'md:ml-[70px]' : 'md:ml-[260px]'
          )}
        >
          <main className="flex-1 p-4 md:p-8 w-full min-w-0 dashboard-main-content">
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
    </RbacProvider>
  );
}
