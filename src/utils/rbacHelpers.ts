import { RouteMapping, SidebarGroup, SidebarItem } from '@/types/rbac';
import React from 'react';
import {
  LayoutDashboard,
  Users,
  Truck,
  Building2,
  Tag,
  Package,
  ArrowRightLeft,
  PackageMinus,
  History as HistoryIcon,
  FileText,
  FileMinus,
  Wallet,
  HandCoins,
  ShieldAlert,
  Banknote,
  Receipt,
  Landmark,
  BookOpen,
  PieChart,
  Calculator,
  Layers,
  Settings,
  ShieldCheck,
  Shield,
  HelpCircle,
} from 'lucide-react';

const GROUP_ICONS: Record<string, React.ComponentType<any>> = {
  'Principal': LayoutDashboard,
  'Contactos': Users,
  'Inventario': Package,
  'Ingresos': HandCoins,
  'Egresos': Receipt,
  'Finanzas': Landmark,
  'Recursos Humanos': Users,
  'Herramientas': Calculator,
  'Sistema': Settings,
};

const ICON_COMPONENTS: Record<string, React.ComponentType<any>> = {
  LayoutDashboard,
  Users,
  Truck,
  Building2,
  Tag,
  Package,
  ArrowRightLeft,
  PackageMinus,
  HistoryIcon,
  History: HistoryIcon,
  FileText,
  FileMinus,
  Wallet,
  HandCoins,
  ShieldAlert,
  Banknote,
  Receipt,
  Landmark,
  BookOpen,
  PieChart,
  Calculator,
  Layers,
  Settings,
  ShieldCheck,
  Shield,
  HelpCircle,
};

/**
 * Get group icon component based on string name
 */
export function getGroupIcon(groupTitle: string): React.ComponentType<any> {
  return GROUP_ICONS[groupTitle] || HelpCircle;
}

/**
 * Get individual item icon component dynamically from Lucide library
 */
export function getIconComponent(iconName: string): React.ComponentType<any> {
  const Icon = ICON_COMPONENTS[iconName];
  return Icon || HelpCircle;
}

/**
 * Filtra y construye el árbol de navegación del Sidebar de forma 100% dinámica
 * a partir de los mapeos de ruta registrados en base de datos y los permisos del usuario.
 *
 * IMPORTANTE: buildSidebar usa hasPermission(module, action) directamente a partir del mapeo.
 * NO usa canAccessRoute() porque esa función es para validar rutas reales con paths limpios,
 * no patrones de base de datos que contienen wildcards '%' que causan fallos de regex.
 */
export function buildSidebar(
  routeMappings: RouteMapping[],
  hasPermission: (module: string, action: string) => boolean,
  userRole: string
): SidebarGroup[] {
  const cleanRole = userRole?.toLowerCase().trim() || '';
  const isSistemas = cleanRole === 'sistemas' || cleanRole.includes('sistema');
  const isAdmin = cleanRole.includes('admin') || cleanRole.includes('administraci');

  // 1. Obtener todos los mapeos configurados como elementos de menú
  const menuMappings = routeMappings.filter(m => m.isMenuItem && m.routePattern);

  // 2. Filtrar los mapeos autorizados para el usuario actual
  const authorizedItems: SidebarItem[] = [];

  for (const m of menuMappings) {
    // Usamos hasPermission directamente con el module/action del mapeo de DB.
    // Esto evita el bug de pasar el patrón '/dashboard/X%' a canAccessRoute que usa regex.
    const module = m.module;
    const action = m.action || 'read';
    
    // Bypass inmediato para sistemas y administracion (acceso total a todas las vistas)
    const isAllowed = isSistemas || isAdmin ? true : hasPermission(module, action);

    if (!isAllowed) {
      continue;
    }

    // Restricción de empresas/compañías: solo el rol 'sistemas' tiene acceso
    if ((m.routePattern.toLowerCase().includes('empresa') || m.routePattern.toLowerCase().includes('compan')) && !isSistemas) {
      continue;
    }

    // Restricción admin/companies: solo sistemas y administracion tienen acceso
    if (m.routePattern.includes('/admin/companies') && !isSistemas && !isAdmin) {
      continue;
    }

    authorizedItems.push({
      name: m.displayName || 'Módulo',
      href: m.routePattern.replace(/%/g, ''), // Limpiamos wildcards
      iconName: m.iconName || 'HelpCircle',
      groupName: m.groupName || 'Otros',
      orderIndex: m.orderIndex || 999,
    });
  }

  // 3. Agrupar ítems por su groupName
  const groupsMap = new Map<string, SidebarItem[]>();
  for (const item of authorizedItems) {
    if (!groupsMap.has(item.groupName)) {
      groupsMap.set(item.groupName, []);
    }
    groupsMap.get(item.groupName)!.push(item);
  }

  // Definimos un orden fijo de grupos para una consistencia visual premium
  const groupOrder = ['Principal', 'Contactos', 'Inventario', 'Ingresos', 'Egresos', 'Finanzas', 'Recursos Humanos', 'Herramientas', 'Sistema'];

  // 4. Construir y ordenar los grupos resultantes
  const sidebarGroups: SidebarGroup[] = [];
  
  // Agregamos en el orden preestablecido si tienen elementos autorizados
  for (const title of groupOrder) {
    const items = groupsMap.get(title);
    if (items && items.length > 0) {
      // Ordenamos los ítems dentro de cada grupo por su orderIndex
      items.sort((a, b) => a.orderIndex - b.orderIndex);
      sidebarGroups.push({ title, items });
      groupsMap.delete(title);
    }
  }

  // Agregamos cualquier grupo restante no clasificado en la lista
  for (const [title, items] of groupsMap.entries()) {
    if (items.length > 0) {
      items.sort((a, b) => a.orderIndex - b.orderIndex);
      sidebarGroups.push({ title, items });
    }
  }

  return sidebarGroups;
}
export type { RouteMapping, SidebarGroup, SidebarItem };
