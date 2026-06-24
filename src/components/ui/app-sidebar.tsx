'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Shield, ShieldCheck, ShieldAlert, LayoutDashboard, FileText,
  Wallet, Landmark, BookOpen, Settings, LogOut, X, Users, Truck,
  Package, HandCoins, Receipt, PieChart, Building2, ArrowRightLeft,
  History as HistoryIcon, Banknote, PackageMinus, Tag, FileMinus,
  Calculator, Layers, ChevronDown, Search, Command, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

// ─── Types ───────────────────────────────────────────────────────────────────

type Entorno = 'TEST' | 'CERT' | 'PROD';

interface NavItemDef {
  name: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
}

interface NavGroupDef {
  title: string;
  items: NavItemDef[];
  icon: React.ElementType;
}

interface AppSidebarProps {
  user: any;
  companies: any[];
  companyName: string;
  entorno: Entorno;
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onLogout: () => void;
  onSwitchCompany: (companyId: string) => void;
  switching?: boolean;
}

// ─── Navigation Config ───────────────────────────────────────────────────────

export const NAV_GROUPS: NavGroupDef[] = [
  {
    title: 'Principal',
    icon: LayoutDashboard,
    items: [
      { name: 'Inicio', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Contactos',
    icon: Users,
    items: [
      { name: 'Clientes', href: '/dashboard/customers', icon: Users, roles: ['sistema', 'admin', 'factura', 'contab', 'cajero'] },
      { name: 'Suplidores', href: '/dashboard/suppliers', icon: Truck, roles: ['sistema', 'admin', 'contab', 'banco'] },
    ],
  },
  {
    title: 'Inventario',
    icon: Package,
    items: [
      { name: 'Almacenes', href: '/dashboard/warehouses', icon: Building2, roles: ['sistema', 'admin'] },
      { name: 'Categorías', href: '/dashboard/inventory/categories', icon: Tag, roles: ['sistema', 'admin'] },
      { name: 'Productos', href: '/dashboard/products', icon: Package, roles: ['sistema', 'admin', 'cajero'] },
      { name: 'Conduces', href: '/dashboard/delivery-notes', icon: Truck, roles: ['sistema', 'admin'] },
      { name: 'Traslados', href: '/dashboard/inventory/transfer', icon: ArrowRightLeft, roles: ['sistema', 'admin'] },
      { name: 'Ajustes', href: '/dashboard/inventory/adjustments', icon: PackageMinus, roles: ['sistema', 'admin'] },
      { name: 'Movimientos', href: '/dashboard/inventory/movements', icon: HistoryIcon, roles: ['sistema', 'admin'] },
    ],
  },
  {
    title: 'Ingresos',
    icon: HandCoins,
    items: [
      { name: 'Facturación e-CF', href: '/dashboard/invoices', icon: FileText, roles: ['sistema', 'admin', 'factura'] },
      { name: 'Cotizaciones', href: '/dashboard/quotes', icon: FileText, roles: ['sistema', 'admin', 'factura'] },
      { name: 'Crédito / Débito', href: '/dashboard/adjustments', icon: FileMinus, roles: ['sistema', 'admin', 'factura'] },
      { name: 'Módulo de Caja', href: '/dashboard/cash', icon: Wallet, roles: ['sistema', 'admin', 'factura', 'cajero'] },
      { name: 'Pagos y Abonos', href: '/dashboard/receivables', icon: HandCoins, roles: ['sistema', 'admin', 'factura', 'contab'] },
      { name: 'Retenciones', href: '/dashboard/retentions', icon: ShieldAlert, roles: ['sistema', 'admin'] },
    ],
  },
  {
    title: 'Egresos',
    icon: Receipt,
    items: [
      { name: 'Compras y Gastos', href: '/dashboard/purchases', icon: Banknote, roles: ['sistema', 'admin', 'contab'] },
      { name: 'Cuentas por Pagar', href: '/dashboard/ap', icon: Receipt, roles: ['sistema', 'admin', 'contab'] },
    ],
  },
  {
    title: 'Finanzas',
    icon: Landmark,
    items: [
      { name: 'Cuentas Bancarias', href: '/dashboard/bank', icon: Landmark, roles: ['sistema', 'sistemas', 'admin', 'contab', 'banco'] },
      { name: 'Contabilidad', href: '/dashboard/accounting', icon: BookOpen, roles: ['sistema', 'sistemas', 'admin', 'contab'] },
      { name: 'Reportes', href: '/dashboard/reports', icon: PieChart, roles: ['sistema', 'sistemas', 'admin', 'contab', 'banco'] },
    ],
  },
  {
    title: 'Recursos Humanos',
    icon: Users,
    items: [
      { name: 'Dashboard RRHH', href: '/dashboard/hr', icon: LayoutDashboard, roles: ['sistemas', 'administracion', 'recursos_humanos'] },
      { name: 'Empleados', href: '/dashboard/hr/employees', icon: Users, roles: ['sistemas', 'administracion', 'recursos_humanos'] },
      { name: 'Departamentos', href: '/dashboard/hr/departments', icon: Building2, roles: ['sistemas', 'administracion', 'recursos_humanos'] },
      { name: 'Nóminas', href: '/dashboard/hr/payroll', icon: Banknote, roles: ['sistemas', 'administracion', 'recursos_humanos', 'contabilidad'] },
      { name: 'Horas Extras y Adicionales', href: '/dashboard/hr/overtime', icon: Calculator, roles: ['sistemas', 'administracion', 'recursos_humanos'] },
      { name: 'Liquidación y Prestaciones', href: '/dashboard/hr/settlements', icon: ShieldAlert, roles: ['sistemas', 'administracion', 'recursos_humanos'] },
      { name: 'Configuración de Ley', href: '/dashboard/hr/config', icon: Settings, roles: ['sistemas', 'administracion', 'recursos_humanos'] },
    ],
  },
  {
    title: 'Herramientas',
    icon: Calculator,
    items: [
      { name: 'Desglose Ventanas', href: '/dashboard/tools/desglose/ventanas', icon: Calculator, roles: ['sistema', 'admin', 'factura'] },
      { name: 'Corte de Vidrio', href: '/dashboard/tools/glass-cutting', icon: Layers, roles: ['sistema', 'admin', 'factura'] },
    ],
  },
  {
    title: 'Sistema',
    icon: Settings,
    items: [
      { name: 'Ajustes', href: '/dashboard/settings', icon: Settings, roles: ['sistema', 'admin'] },
      { name: 'Comprobantes Fiscales', href: '/dashboard/ecf', icon: ShieldCheck, roles: ['sistema', 'admin'] },
      { name: 'Empresas', href: '/dashboard/admin/companies', icon: Building2, roles: ['sistema'] },
      { name: 'Administración', href: '/dashboard/admin', icon: Shield, roles: ['sistema', 'admin'] },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getVisibleItems(group: NavGroupDef, userRole: string): NavItemDef[] {
  return group.items.filter(item => {
    if (!item.roles) return true;
    return item.roles.some(r => userRole?.toLowerCase().includes(r.toLowerCase()));
  });
}

function getAllSearchableItems(userRole: string): NavItemDef[] {
  return NAV_GROUPS.flatMap(g => getVisibleItems(g, userRole));
}

// ─── WorkspaceSwitcher ───────────────────────────────────────────────────────

function WorkspaceSwitcher({
  user, companies, companyName, onSwitchCompany, switching, collapsed,
}: {
  user: any; companies: any[]; companyName: string;
  onSwitchCompany: (id: string) => void; switching?: boolean; collapsed: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isSistemas = user?.role === 'sistemas';

  if (collapsed) {
    return (
      <div className="flex items-center justify-center py-3">
        <div
          className="w-8 h-8 rounded-[6px] bg-primary text-on-primary flex items-center justify-center font-semibold text-[13px] shadow-sm cursor-default"
          title={companyName}
        >
          {companyName.charAt(0).toUpperCase()}
        </div>
      </div>
    );
  }

  return (
    <div className="relative px-3 pb-2">
      <div
        onClick={() => isSistemas && setIsOpen(o => !o)}
        className={clsx(
          'flex items-center justify-between px-2 py-2 rounded-lg transition-colors select-none group',
          isSistemas
            ? 'hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer'
            : 'cursor-default',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-[6px] bg-primary text-on-primary flex items-center justify-center font-semibold text-[13px] shadow-sm shrink-0">
            {switching
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : companyName.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col overflow-hidden min-w-0">
            <span className="text-[13px] font-semibold leading-none mb-1 text-on-surface truncate">
              {companyName}
            </span>
            <span className="text-[11px] text-on-surface-variant/60 leading-none">
              {isSistemas ? 'Sistemas · cambiar empresa' : 'Empresa activa'}
            </span>
          </div>
        </div>
        {isSistemas && (
          <ChevronDown
            className={clsx(
              'w-4 h-4 text-on-surface-variant/40 group-hover:text-on-surface-variant transition-all duration-200 shrink-0',
              isOpen && 'rotate-180',
            )}
            strokeWidth={1.5}
          />
        )}
      </div>

      {/* Companies Dropdown */}
      {isSistemas && isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-3 right-3 bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-2xl z-50 py-1.5 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-3 py-1.5 mb-1 border-b border-outline-variant/30">
              <span className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-wider">
                Seleccionar Empresa
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {companies.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onSwitchCompany(c.id); setIsOpen(false); }}
                  className={clsx(
                    'w-full text-left px-3 py-2.5 text-[12px] cursor-pointer transition-colors flex flex-col gap-0.5 hover:bg-black/5',
                    user?.companyId === c.id && 'bg-primary/8 text-primary',
                  )}
                >
                  <span className="flex items-center gap-2 font-semibold truncate text-on-surface">
                    {c.name}
                    {user?.companyId === c.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                    )}
                  </span>
                  <span className="text-[10px] text-on-surface-variant/60 font-mono">RNC: {c.rnc}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── NavItem ─────────────────────────────────────────────────────────────────

function NavItem({
  item, pathname, collapsed, onClick, isSubItem,
}: {
  item: NavItemDef; pathname: string; collapsed: boolean; onClick?: () => void; isSubItem?: boolean;
}) {
  const isActive =
    pathname === item.href ||
    (item.href !== '/dashboard' && pathname.startsWith(item.href));

  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? item.name : undefined}
      className={clsx(
        'group flex items-center rounded-[6px] transition-all duration-150 select-none w-full',
        collapsed ? 'justify-center px-2 py-2.5' : clsx('px-2.5 py-[7px]', isSubItem ? 'pl-8 text-[12px] gap-2' : 'gap-2.5 text-[13px]'),
        isActive
          ? 'bg-primary/10 text-primary font-semibold'
          : 'text-on-surface-variant hover:bg-black/5 dark:hover:bg-white/5 hover:text-on-surface',
      )}
    >
      <item.icon
        className={clsx(
          'shrink-0 transition-colors',
          collapsed ? 'w-[20px] h-[20px]' : isSubItem ? 'w-[15px] h-[15px]' : 'w-[17px] h-[17px]',
          isActive
            ? 'text-primary'
            : 'text-on-surface-variant/60 group-hover:text-on-surface',
        )}
        strokeWidth={1.5}
      />
      {!collapsed && (
        <span className="tracking-wide truncate">{item.name}</span>
      )}
    </Link>
  );
}

// ─── SearchModal ─────────────────────────────────────────────────────────────

function SearchModal({ onClose, userRole }: { onClose: () => void; userRole: string }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const allItems = getAllSearchableItems(userRole);
  const results = query.trim()
    ? allItems.filter(i => i.name.toLowerCase().includes(query.toLowerCase()))
    : allItems.slice(0, 7);

  const handleSelect = (href: string) => {
    router.push(href);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-background/40 backdrop-blur-sm px-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center px-4 border-b border-outline-variant/30">
          <Search className="w-[18px] h-[18px] text-on-surface-variant/50 mr-3 shrink-0" strokeWidth={1.5} />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && onClose()}
            className="flex-1 bg-transparent py-4 outline-none text-[14px] text-on-surface placeholder:text-on-surface-variant/40"
            placeholder="Buscar módulo o acción..."
          />
          <kbd
            onClick={onClose}
            className="hidden sm:inline-flex items-center h-5 px-1.5 text-[10px] font-mono text-on-surface-variant/50 bg-surface-container border border-outline-variant/30 rounded cursor-pointer hover:text-on-surface transition-colors"
          >
            ESC
          </kbd>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {results.length > 0 ? (
            <div className="p-2 flex flex-col gap-0.5">
              {results.map(item => (
                <button
                  key={item.href}
                  onClick={() => handleSelect(item.href)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-black/5 transition-colors group"
                >
                  <item.icon
                    className="w-4 h-4 text-on-surface-variant/60 shrink-0 group-hover:text-primary transition-colors"
                    strokeWidth={1.5}
                  />
                  <span className="text-[13px] text-on-surface flex-1">{item.name}</span>
                  <span className="text-[11px] text-on-surface-variant/40 font-mono truncate max-w-[180px]">
                    {item.href}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-10 flex flex-col items-center justify-center gap-2">
              <Command className="w-6 h-6 text-on-surface-variant/30" strokeWidth={1.5} />
              <p className="text-[13px] text-on-surface-variant/60">
                Sin resultados para &quot;{query}&quot;
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SidebarContent (shared between desktop & mobile) ────────────────────────

function SidebarContent({
  user, companies, companyName, entorno, onSwitchCompany, switching,
  collapsed, onLogout, onItemClick,
}: {
  user: any; companies: any[]; companyName: string; entorno: Entorno;
  onSwitchCompany: (id: string) => void; switching?: boolean;
  collapsed: boolean; onLogout: () => void; onItemClick?: () => void;
}) {
  const pathname = usePathname();
  const userRole = (user?.role || '').toLowerCase();
  
  // Track open/collapsed state of groups
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAV_GROUPS.forEach(g => {
      const active = g.items.some(item => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)));
      if (active) {
        initial[g.title] = true;
      }
    });
    return initial;
  });

  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);

  // Auto-expand group when path changes
  useEffect(() => {
    NAV_GROUPS.forEach(g => {
      const active = g.items.some(item => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)));
      if (active) {
        setExpandedGroups(prev => ({ ...prev, [g.title]: true }));
      }
    });
  }, [pathname]);

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <>
      {/* Workspace Switcher */}
      <WorkspaceSwitcher
        user={user}
        companies={companies}
        companyName={companyName}
        onSwitchCompany={onSwitchCompany}
        switching={switching}
        collapsed={collapsed}
      />

      <div className="h-px bg-outline-variant/20 mx-3 mb-2" />

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] px-2 pb-4 flex flex-col gap-1.5 mt-1 relative">
        {NAV_GROUPS.map(group => {
          const visible = getVisibleItems(group, userRole);
          if (visible.length === 0) return null;

          const isPrincipal = group.title === 'Principal';
          const hasSubmenu = !isPrincipal && visible.length > 1;

          if (!hasSubmenu) {
            return (
              <div key={group.title} className="flex flex-col gap-0.5">
                {visible.map(item => (
                  <NavItem
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    collapsed={collapsed}
                    onClick={onItemClick}
                  />
                ))}
              </div>
            );
          }

          const isExpanded = !!expandedGroups[group.title];
          const isGroupActive = visible.some(item => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)));

          return (
            <div
              key={group.title}
              className="flex flex-col gap-0.5 relative"
              onMouseEnter={() => setHoveredGroup(group.title)}
              onMouseLeave={() => setHoveredGroup(null)}
            >
              {collapsed ? (
                <div className="relative">
                  <button
                    title={group.title}
                    className={clsx(
                      'group flex items-center justify-center rounded-[6px] w-full px-2 py-2.5 transition-all duration-150 select-none cursor-pointer',
                      isGroupActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-on-surface-variant hover:bg-black/5 dark:hover:bg-white/5 hover:text-on-surface'
                    )}
                  >
                    <group.icon
                      className={clsx(
                        'shrink-0 transition-colors w-[20px] h-[20px]',
                        isGroupActive ? 'text-primary' : 'text-on-surface-variant/60 group-hover:text-on-surface'
                      )}
                      strokeWidth={1.5}
                    />
                  </button>

                  {/* Popover Submenu */}
                  <AnimatePresence>
                    {hoveredGroup === group.title && (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-[54px] top-0 bg-white dark:bg-zinc-950 border border-outline-variant shadow-lg rounded-lg py-2 z-[70] min-w-[180px] flex flex-col gap-0.5"
                      >
                        <div className="px-3 py-1 text-[10px] font-bold text-on-surface-variant/40 border-b border-outline-variant/10 uppercase mb-1">
                          {group.title}
                        </div>
                        {visible.map(item => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={onItemClick}
                            className={clsx(
                              'flex items-center gap-2.5 px-3 py-2 text-[12px] text-on-surface-variant hover:bg-black/5 dark:hover:bg-white/5 hover:text-on-surface transition-colors',
                              pathname === item.href && 'bg-primary/5 text-primary font-semibold'
                            )}
                          >
                            <item.icon className="w-4 h-4 text-on-surface-variant/60" strokeWidth={1.5} />
                            {item.name}
                          </Link>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => toggleGroup(group.title)}
                    className={clsx(
                      'group flex items-center justify-between rounded-[6px] px-2.5 py-[7px] text-[13px] text-on-surface-variant hover:bg-black/5 dark:hover:bg-white/5 hover:text-on-surface transition-colors w-full cursor-pointer select-none font-semibold',
                      isGroupActive && 'text-primary font-bold'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <group.icon
                        className={clsx(
                          'w-[17px] h-[17px] shrink-0 text-on-surface-variant/60 group-hover:text-on-surface transition-colors',
                          isGroupActive && 'text-primary'
                        )}
                        strokeWidth={1.5}
                      />
                      <span className="tracking-wide">{group.title}</span>
                    </div>
                    <ChevronDown
                      className={clsx(
                        'w-3.5 h-3.5 transition-transform duration-200 text-on-surface-variant/50 group-hover:text-on-surface',
                        isExpanded && 'rotate-180'
                      )}
                      strokeWidth={1.5}
                    />
                  </button>

                  {/* Sub-items list with expansion animation */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden flex flex-col gap-0.5 pl-2 border-l border-outline-variant/20 ml-[18px] my-0.5"
                      >
                        {visible.map(item => (
                          <NavItem
                            key={item.href}
                            item={item}
                            pathname={pathname}
                            collapsed={collapsed}
                            onClick={onItemClick}
                            isSubItem={true}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom: entorno indicator + logout */}
      <div className={clsx(
        'border-t border-outline-variant/20 flex flex-col gap-1 py-3 px-2',
        collapsed && 'items-center',
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2 px-2.5 py-1">
            <span className={clsx('h-2 w-2 rounded-full shrink-0', {
              'bg-green-500': entorno === 'PROD',
              'bg-blue-500': entorno === 'CERT',
              'bg-yellow-400': entorno === 'TEST',
            })} />
            <span className="text-[11px] text-on-surface-variant/50 font-semibold">
              {entorno === 'PROD' ? 'Producción' : entorno === 'CERT' ? 'Certificación' : 'Pruebas'}
            </span>
          </div>
        )}
        <button
          onClick={onLogout}
          title={collapsed ? 'Cerrar Sesión' : undefined}
          className={clsx(
            'flex items-center gap-2.5 rounded-[6px] px-2.5 py-[7px] text-error/70 hover:bg-error/5 hover:text-error transition-colors w-full',
            collapsed && 'justify-center',
          )}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" strokeWidth={1.5} />
          {!collapsed && <span className="text-[13px]">Cerrar Sesión</span>}
        </button>
      </div>
    </>
  );
}

// ─── AppSidebar (main export) ─────────────────────────────────────────────────

export default function AppSidebar({
  user, companies, companyName, entorno,
  collapsed, mobileOpen, onMobileClose,
  onLogout, onSwitchCompany, switching,
}: AppSidebarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const userRole = (user?.role || '').toLowerCase();

  // ⌘K global shortcut
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Offset for topbar (env stripe h-10 + nav h-14 = pt-24)
  const topOffset = entorno !== 'PROD' ? 'pt-24' : 'pt-14';

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <aside
        className={clsx(
          'hidden md:flex flex-col fixed left-0 top-0 h-full z-40',
          'border-r border-outline-variant/30 bg-surface-bright/70 backdrop-blur-xl',
          'transition-[width] duration-300 ease-in-out overflow-hidden',
          topOffset,
          collapsed ? 'w-[64px]' : 'w-[260px]',
        )}
      >
        {/* Search button */}
        <div className={clsx('px-2 pt-2 pb-2', !collapsed && 'px-3')}>
          <button
            id="sidebar-search-btn"
            onClick={() => setSearchOpen(true)}
            className={clsx(
              'w-full flex items-center rounded-[6px] px-2.5 py-[7px]',
              'text-on-surface-variant hover:bg-black/5 hover:text-on-surface transition-colors',
              collapsed ? 'justify-center' : 'gap-2.5',
            )}
            title={collapsed ? 'Buscar (⌘K)' : undefined}
          >
            <Search className="w-[17px] h-[17px] shrink-0" strokeWidth={1.5} />
            {!collapsed && (
              <>
                <span className="text-[13px] tracking-wide flex-1 text-left">Buscar</span>
                <kbd className="text-[10px] font-mono text-on-surface-variant/40 bg-surface-container border border-outline-variant/30 rounded px-1">
                  ⌘K
                </kbd>
              </>
            )}
          </button>
        </div>

        <SidebarContent
          user={user}
          companies={companies}
          companyName={companyName}
          entorno={entorno}
          onSwitchCompany={onSwitchCompany}
          switching={switching}
          collapsed={collapsed}
          onLogout={onLogout}
        />
      </aside>

      {/* ── Mobile Drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-[70] md:hidden flex">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={onMobileClose}
              className="fixed inset-0 bg-black"
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative bg-surface-bright/95 backdrop-blur-xl h-full w-[260px] flex flex-col pt-6 z-[80] border-r border-outline-variant/30 shadow-2xl"
            >
              {/* Close button */}
              <button
                onClick={onMobileClose}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-on-surface-variant hover:bg-black/5 transition-colors"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>

              {/* Search */}
              <div className="px-3 pt-2 pb-2">
                <button
                  onClick={() => { setSearchOpen(true); onMobileClose(); }}
                  className="w-full flex items-center gap-2.5 rounded-[6px] px-2.5 py-[7px] text-on-surface-variant hover:bg-black/5 hover:text-on-surface transition-colors"
                >
                  <Search className="w-[17px] h-[17px] shrink-0" strokeWidth={1.5} />
                  <span className="text-[13px] tracking-wide flex-1 text-left">Buscar</span>
                </button>
              </div>

              <SidebarContent
                user={user}
                companies={companies}
                companyName={companyName}
                entorno={entorno}
                onSwitchCompany={(id) => { onSwitchCompany(id); onMobileClose(); }}
                switching={switching}
                collapsed={false}
                onLogout={onLogout}
                onItemClick={onMobileClose}
              />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* ── Search Modal ── */}
      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          userRole={userRole}
        />
      )}
    </>
  );
}
