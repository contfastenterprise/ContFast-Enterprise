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
import { useRbac } from '@/components/providers/rbacContext';
import { buildSidebar, getGroupIcon, getIconComponent, RouteMapping } from '@/utils/rbacHelpers';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAllSearchableItems(
  routeMappings: RouteMapping[],
  hasPermission: (module: string, action: string) => boolean,
  userRole: string
): NavItemDef[] {
  return buildSidebar(routeMappings, hasPermission, userRole).flatMap(g =>
    g.items.map(item => ({
      name: item.name,
      href: item.href,
      icon: getIconComponent(item.iconName),
    }))
  );
}

// ─── WorkspaceSwitcher (Light, Beveled, Systems support) ───────────────────────

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
      <div className="flex items-center justify-center py-4">
        <div
          className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-blue-600 text-on-primary flex items-center justify-center font-bold text-sm shadow-md shadow-primary/20 cursor-default transition-all hover:scale-105"
          title={companyName}
        >
          {companyName.charAt(0).toUpperCase()}
        </div>
      </div>
    );
  }

  return (
    <div className="relative px-4 pb-3 pt-1">
      <div
        onClick={() => isSistemas && setIsOpen(o => !o)}
        className={clsx(
          'flex items-center justify-between px-3 py-2.5 rounded-xl border border-[#003366]/20 bg-[#003366]/10 select-none group transition-all duration-300',
          isSistemas
            ? 'hover:bg-[#003366]/15 hover:border-[#003366]/30 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
            : 'cursor-default',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-primary to-blue-600 text-on-primary flex items-center justify-center font-bold text-[14px] shadow-[0_3px_8px_rgba(0,0,0,0.08)] shrink-0">
            {switching
              ? <Loader2 className="w-4 h-4 animate-spin text-on-primary" />
              : companyName.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col overflow-hidden min-w-0">
            <span className="text-[13px] font-bold leading-none mb-1 text-on-surface truncate">
              {companyName}
            </span>
            <span className="text-[11px] text-on-surface-variant/70 leading-none">
              {isSistemas ? 'Sistemas · cambiar' : 'Empresa activa'}
            </span>
          </div>
        </div>
        {isSistemas && (
          <ChevronDown
            className={clsx(
              'w-4 h-4 text-on-surface-variant/40 group-hover:text-on-surface-variant/80 transition-all duration-200 shrink-0',
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
          <div className="absolute top-full left-4 right-4 mt-1.5 bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-2xl z-50 py-2 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="px-3 py-1.5 mb-1.5 border-b border-outline-variant/10">
              <span className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">
                Seleccionar Empresa
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto custom-scrollbar">
              {companies.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onSwitchCompany(c.id); setIsOpen(false); }}
                  className={clsx(
                    'w-full text-left px-3 py-2.5 text-[12px] cursor-pointer transition-colors flex flex-col gap-0.5 hover:bg-surface-container-low text-on-surface-variant hover:text-on-surface',
                    user?.companyId === c.id && 'bg-primary/10 text-primary font-bold border-l-2 border-primary',
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    {c.name}
                    {user?.companyId === c.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
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

// ─── NavItem (Clean, System-token light theme) ─────────────────────────────────

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
        'group flex items-center rounded-xl transition-all duration-300 select-none w-full relative',
        collapsed ? 'justify-center p-3' : clsx('px-3.5 py-2.5', isSubItem ? 'pl-8 text-[12px] gap-2.5' : 'gap-3 text-[13px]'),
        isActive
          ? 'bg-[#003366] text-white font-bold border border-[#003366]/20 shadow-[0_4px_12px_rgba(0,51,102,0.15)]'
          : 'text-on-surface-variant/80 hover:bg-[#003366]/10 hover:text-[#003366] border border-transparent',
      )}
    >
      {/* Active side indicator */}
      {isActive && !collapsed && (
        <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r bg-primary shadow-[0_0_6px_rgba(0,51,102,0.4)]" />
      )}
      <item.icon
        className={clsx(
          'shrink-0 transition-all duration-300',
          collapsed ? 'w-[20px] h-[20px]' : isSubItem ? 'w-[15px] h-[15px]' : 'w-[18px] h-[18px]',
          isActive
            ? 'text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.2)]'
            : 'text-on-surface-variant/50 group-hover:text-on-surface group-hover:scale-105',
        )}
        strokeWidth={isActive ? 2 : 1.5}
      />
      {!collapsed && (
        <span className="tracking-wide truncate">{item.name}</span>
      )}
    </Link>
  );
}

// ─── SearchModal ─────────────────────────────────────────────────────────────

function SearchModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { hasPermission, routeMappings, user } = useRbac();
  const allItems = getAllSearchableItems(routeMappings, hasPermission, user?.role || '');
  const results = query.trim()
    ? allItems.filter(i => i.name.toLowerCase().includes(query.toLowerCase()))
    : allItems.slice(0, 7);

  const handleSelect = (href: string) => {
    router.push(href);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm px-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-surface-container-lowest border border-outline-variant/40 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center px-4 border-b border-outline-variant/20">
          <Search className="w-[18px] h-[18px] text-on-surface-variant/40 mr-3 shrink-0" strokeWidth={1.5} />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && onClose()}
            className="flex-1 bg-transparent py-4.5 outline-none text-[14px] text-on-surface placeholder:text-on-surface-variant/40"
            placeholder="Buscar módulo o acción..."
          />
          <kbd
            onClick={onClose}
            className="hidden sm:inline-flex items-center h-6 px-2 text-[10px] font-mono text-on-surface-variant/50 bg-surface-container border border-outline-variant/30 rounded-lg cursor-pointer hover:text-on-surface transition-colors"
          >
            ESC
          </kbd>
        </div>
        <div className="max-h-72 overflow-y-auto custom-scrollbar">
          {results.length > 0 ? (
            <div className="p-2 flex flex-col gap-0.5">
              {results.map(item => (
                <button
                  key={item.href}
                  onClick={() => handleSelect(item.href)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-surface-container-low transition-colors group text-on-surface-variant hover:text-on-surface"
                >
                  <item.icon
                    className="w-4 h-4 text-on-surface-variant/40 shrink-0 group-hover:text-primary transition-colors"
                    strokeWidth={1.5}
                  />
                  <span className="text-[13px] flex-1">{item.name}</span>
                  <span className="text-[10px] text-on-surface-variant/30 font-mono truncate max-w-[180px]">
                    {item.href}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <Command className="w-8 h-8 text-on-surface-variant/20" strokeWidth={1.5} />
              <p className="text-[13px] text-on-surface-variant/40">
                Sin resultados para &quot;{query}&quot;
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SidebarContent (Glow and Accordion) ────────────────────────────────────────

function SidebarContent({
  user, companies, companyName, entorno, onSwitchCompany, switching,
  collapsed, onLogout, onItemClick,
}: {
  user: any; companies: any[]; companyName: string; entorno: Entorno;
  onSwitchCompany: (id: string) => void; switching?: boolean;
  collapsed: boolean; onLogout: () => void; onItemClick?: () => void;
}) {
  const pathname = usePathname();
  const { hasPermission, routeMappings, user: rbacUser } = useRbac();

  const dynamicGroups: NavGroupDef[] = buildSidebar(routeMappings, hasPermission, rbacUser?.role || '').map(g => {
    const items: { name: string; href: string; icon: any }[] = [];
    g.items.forEach(item => {
      items.push({
        name: item.name,
        href: item.href,
        icon: getIconComponent(item.iconName),
      });
      if (item.name === 'Productos') {
        items.push({
          name: 'Barcode',
          href: '/dashboard/products/barcodes',
          icon: getIconComponent('Printer'),
        });
      }
    });
    return {
      title: g.title,
      icon: getGroupIcon(g.title),
      items
    };
  });

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    dynamicGroups.forEach(g => {
      const active = g.items.some(item => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)));
      if (active) {
        initial[g.title] = true;
      }
    });
    return initial;
  });

  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);

  useEffect(() => {
    dynamicGroups.forEach(g => {
      const active = g.items.some(item => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)));
      if (active) {
        setExpandedGroups(prev => ({ ...prev, [g.title]: true }));
      }
    });
  }, [pathname, routeMappings]);

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

      <div className="h-px bg-outline-variant/20 mx-4 mb-3" />

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] px-3 pb-4 flex flex-col gap-2 mt-1 relative">
        {dynamicGroups.map(group => {
          const visible = group.items;
          if (visible.length === 0) return null;

          const isPrincipal = group.title === 'Principal';
          const hasSubmenu = !isPrincipal && visible.length > 1;

          if (!hasSubmenu) {
            return (
              <div key={group.title} className="flex flex-col gap-1">
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
              className="flex flex-col gap-1 relative"
              onMouseEnter={() => setHoveredGroup(group.title)}
              onMouseLeave={() => setHoveredGroup(null)}
            >
              {collapsed ? (
                <div className="relative">
                  <button
                    title={group.title}
                    className={clsx(
                      'group flex items-center justify-center rounded-xl w-full p-3 transition-all duration-300 select-none cursor-pointer',
                      isGroupActive
                        ? 'bg-primary/10 text-primary font-bold border border-primary/20'
                        : 'text-on-surface-variant/80 hover:bg-surface-container-high hover:text-on-surface border border-transparent'
                    )}
                  >
                    <group.icon
                      className={clsx(
                        'shrink-0 transition-all duration-300 w-[20px] h-[20px]',
                        isGroupActive ? 'text-primary drop-shadow-[0_0_4px_rgba(0,51,102,0.15)]' : 'text-on-surface-variant/50 group-hover:text-on-surface'
                      )}
                      strokeWidth={isGroupActive ? 2 : 1.5}
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
                        className="absolute left-[54px] top-0 bg-surface-container-lowest border border-outline-variant/40 shadow-2xl rounded-xl py-2 z-[70] min-w-[190px] flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100"
                      >
                        <div className="px-3 py-1.5 text-[10px] font-bold text-on-surface-variant/45 border-b border-outline-variant/10 uppercase mb-1.5 tracking-wider">
                          {group.title}
                        </div>
                        {visible.map(item => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={onItemClick}
                            className={clsx(
                              'flex items-center gap-2.5 px-3 py-2.5 text-[12px] text-on-surface-variant hover:bg-[#003366]/10 hover:text-[#003366] transition-colors',
                              pathname === item.href && 'bg-[#003366] text-white font-bold border-l-2 border-[#003366]'
                            )}
                          >
                            <item.icon className="w-4 h-4 text-on-surface-variant/45" strokeWidth={1.5} />
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
                      'group flex items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] text-on-surface-variant/80 hover:bg-[#003366]/10 hover:text-[#003366] transition-all duration-300 w-full cursor-pointer select-none font-semibold border border-transparent',
                      isGroupActive && 'text-primary font-bold'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <group.icon
                        className={clsx(
                          'w-[18px] h-[18px] shrink-0 text-on-surface-variant/50 group-hover:text-on-surface transition-colors',
                          isGroupActive && 'text-primary'
                        )}
                        strokeWidth={isGroupActive ? 2 : 1.5}
                      />
                      <span className="tracking-wide">{group.title}</span>
                    </div>
                    <ChevronDown
                      className={clsx(
                        'w-3.5 h-3.5 transition-transform duration-200 text-on-surface-variant/30 group-hover:text-on-surface-variant/60',
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
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden flex flex-col gap-1 pl-2 border-l border-[#003366]/40 ml-[22px] my-1"
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
        'border-t border-outline-variant/20 flex flex-col gap-1.5 py-4 px-3',
        collapsed && 'items-center',
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-3 py-1.5 bg-surface-container rounded-xl border border-outline-variant/25">
            <span className={clsx('h-2 w-2 rounded-full shrink-0 animate-pulse', {
              'bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]': entorno === 'PROD',
              'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]': entorno === 'CERT',
              'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]': entorno === 'TEST',
            })} />
            <span className="text-[11px] text-on-surface-variant/70 font-bold uppercase tracking-wider">
              {entorno === 'PROD' ? 'Producción' : entorno === 'CERT' ? 'Certificación' : 'Pruebas'}
            </span>
          </div>
        )}
        <button
          onClick={onLogout}
          title={collapsed ? 'Cerrar Sesión' : undefined}
          className={clsx(
            'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600 transition-colors w-full cursor-pointer border border-transparent hover:border-rose-500/20',
            collapsed && 'justify-center',
          )}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" strokeWidth={1.5} />
          {!collapsed && <span className="text-[13px] font-bold">Cerrar Sesión</span>}
        </button>
      </div>
    </>
  );
}

// ─── NewAppSidebar (main export) ───────────────────────────────────────────────

export default function NewAppSidebar({
  user, companies, companyName, entorno,
  collapsed, mobileOpen, onMobileClose,
  onLogout, onSwitchCompany, switching,
}: AppSidebarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [diagExpanded, setDiagExpanded] = useState(false);
  const { hasPermission, routeMappings, user: rbacUser } = useRbac();

  const activeUser = user || rbacUser;
  const auditGroups = buildSidebar(routeMappings, hasPermission, rbacUser?.role || '');

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

  const topOffset = entorno !== 'PROD' ? 'pt-24' : 'pt-14';

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <aside
        className={clsx(
          'hidden md:flex flex-col fixed left-0 top-0 h-full z-40',
          'border-r border-outline-variant/30 bg-slate-50/95 backdrop-blur-2xl shadow-[5px_0_30px_rgba(0,0,0,0.02)]',
          'transition-[width] duration-300 ease-in-out overflow-hidden',
          topOffset,
          collapsed ? 'w-[70px]' : 'w-[260px]',
        )}
      >
        {/* Search button */}
        <div className={clsx('px-3 pt-3 pb-2', !collapsed && 'px-4')}>
          <button
            id="sidebar-search-btn"
            onClick={() => setSearchOpen(true)}
            className={clsx(
              'w-full flex items-center rounded-xl px-3 py-2 border border-outline-variant/20 bg-surface-container-low',
              'text-on-surface-variant/60 hover:bg-surface-container hover:text-on-surface transition-all duration-300 group',
              collapsed ? 'justify-center' : 'gap-3',
            )}
            title={collapsed ? 'Buscar (⌘K)' : undefined}
          >
            <Search className="w-[17px] h-[17px] shrink-0 text-on-surface-variant/40 group-hover:text-on-surface transition-colors" strokeWidth={1.5} />
            {!collapsed && (
              <>
                <span className="text-[13px] tracking-wide flex-1 text-left">Buscar</span>
                <kbd className="text-[10px] font-mono text-on-surface-variant/30 bg-surface-container border border-outline-variant/20 rounded px-1.5">
                  ⌘K
                </kbd>
              </>
            )}
          </button>
        </div>

        <SidebarContent
          user={activeUser}
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
              className="relative bg-slate-50/95 backdrop-blur-2xl h-full w-[260px] flex flex-col pt-6 z-[80] border-r border-outline-variant/30 shadow-2xl"
            >
              {/* Close button */}
              <button
                onClick={onMobileClose}
                className="absolute top-4 right-4 p-2 rounded-xl text-on-surface-variant/50 hover:bg-surface-container hover:text-on-surface transition-colors"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>

              {/* Search */}
              <div className="px-4 pt-2 pb-2">
                <button
                  onClick={() => { setSearchOpen(true); onMobileClose(); }}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2 border border-outline-variant/20 bg-surface-container-low text-on-surface-variant/50 hover:bg-surface-container hover:text-on-surface transition-all duration-300"
                >
                  <Search className="w-[17px] h-[17px] shrink-0 text-on-surface-variant/40" strokeWidth={1.5} />
                  <span className="text-[13px] tracking-wide flex-1 text-left">Buscar</span>
                </button>
              </div>

              <SidebarContent
                user={activeUser}
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
        />
      )}

      {/* ── Diagnostic Panel (RBAC) ── */}
      {rbacUser?.role === 'sistemas' && (
        diagExpanded ? (
          <div className="fixed bottom-4 right-4 z-[9999] bg-[#0c1020]/95 backdrop-blur border border-indigo-500/40 shadow-2xl p-4 rounded-xl max-w-xs text-[11px] font-mono text-slate-200">
            <div 
              onClick={() => setDiagExpanded(false)}
              className="font-bold text-indigo-400 mb-1.5 flex justify-between items-center pb-1 border-b border-white/5 cursor-pointer hover:text-indigo-300 select-none"
              title="Minimizar panel"
            >
              <span>Diagnóstico RBAC</span>
              <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[9px] uppercase">Sys ✕</span>
            </div>
            <div className="space-y-1">
              <div><strong>Rol Client:</strong> {rbacUser?.role || 'null'}</div>
              <div><strong>Rol Prop:</strong> {user?.role || 'null'}</div>
              <div><strong>Permisos:</strong> {rbacUser?.permissions?.length || 0}</div>
              <div><strong>Route Mappings:</strong> {routeMappings?.length || 0}</div>
              <div><strong>Grupos Sidebar:</strong> {auditGroups?.length || 0}</div>
              <div className="mt-1.5 pt-1.5 border-t border-white/5 max-h-32 overflow-y-auto">
                <strong>Compilados:</strong>
                {auditGroups.length === 0 ? (
                  <div className="text-rose-400 mt-0.5">Vacío. Filtros bloqueados.</div>
                ) : (
                  auditGroups.map(g => (
                    <div key={g.title} className="text-emerald-400 text-[10px]">
                      • {g.title} ({g.items.length})
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setDiagExpanded(true)}
            className="fixed bottom-4 right-4 z-[9999] bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-lg border border-indigo-400/30 transition-transform active:scale-95 select-none"
            title="Mostrar panel de diagnóstico"
          >
            Diagnóstico RBAC (Sys)
          </button>
        )
      )}
    </>
  );
}
