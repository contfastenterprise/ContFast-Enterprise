export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  avatarPath: string | null;
  role: string;
  companyId: string;
  permissions: string[];
}

export interface Role {
  id: string;
  companyId: string | null;
  name: string;
  description: string | null;
  isFixed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  module: string;
  action: string;
  description: string | null;
}

export interface RouteMapping {
  id: string;
  routePattern: string;
  module: string;
  action: string | null;
  isMenuItem: boolean;
  displayName: string | null;
  groupName: string | null;
  iconName: string | null;
  orderIndex: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SidebarItem {
  name: string;
  href: string;
  iconName: string;
  groupName: string;
  orderIndex: number;
}

export interface SidebarGroup {
  title: string;
  items: SidebarItem[];
}
