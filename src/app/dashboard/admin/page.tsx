'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Shield, Users, User, ToggleLeft, ToggleRight, Check, AlertTriangle, RefreshCw, X, ShieldAlert, ArrowRight, Save, Lock, Building } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export default function AdminPermissionsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [rolesList, setRolesList] = useState<any[]>([]);
  const [allPermissions, setAllPermissions] = useState<any[]>([]);

  // Selection state
  const [activeTab, setActiveTab] = useState<'roles' | 'users' | 'company'>('roles');
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  
  // Permissions state mapping: permissionId -> boolean
  const [currentGrants, setCurrentGrants] = useState<Record<string, boolean>>({});
  const [modifiedGrants, setModifiedGrants] = useState<Record<string, boolean>>({});

  // Company settings state
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Search filter
  const [userQuery, setUserQuery] = useState('');
  const [roleQuery, setRoleQuery] = useState('');

  // Initial Load
  const loadAdminData = async () => {
    try {
      setLoading(true);
      // Fetch users
      const usersRes = await fetch('/api/v1/admin/users');
      const usersData = await usersRes.json();
      if (usersData.success) {
        setUsersList(usersData.data || []);
      }

      // Fetch roles
      const rolesRes = await fetch('/api/v1/admin/roles');
      const rolesData = await rolesRes.json();
      if (rolesData.success) {
        setRolesList(rolesData.data || []);
        if (rolesData.data?.length > 0) {
          // Select first role by default
          const initialRole = rolesData.data.find((r: any) => !r.isFixed) || rolesData.data[0];
          setSelectedRole(initialRole);
        }
      }

      // Fetch all permission catalog
      const permRes = await fetch('/api/v1/admin/permissions');
      const permData = await permRes.json();
      if (permData.success) {
        setAllPermissions(permData.data || []);
      }

      // Fetch company settings
      const settingsRes = await fetch('/api/v1/company/settings');
      const settingsData = await settingsRes.json();
      if (settingsData.success && settingsData.data?.logoUrl) {
        setLogoUrl(settingsData.data.logoUrl);
      }
    } catch (error) {
      console.error('Failed to load admin data:', error);
      toast.error('Error al cargar datos de administración');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  // Fetch permissions when selected role changes
  useEffect(() => {
    if (activeTab !== 'roles' || !selectedRole) return;
    async function loadRolePermissions() {
      try {
        const res = await fetch(`/api/v1/admin/roles/${selectedRole.id}/permissions`);
        const data = await res.json();
        if (data.success) {
          const grants: Record<string, boolean> = {};
          // Initialize everything as false
          allPermissions.forEach((p) => {
            grants[p.id] = false;
          });
          // Apply active role permissions
          data.data.permissions.forEach((rp: any) => {
            grants[rp.permissionId] = rp.granted;
          });
          setCurrentGrants(grants);
          setModifiedGrants(grants);
        }
      } catch (error) {
        console.error('Failed to load role permissions:', error);
      }
    }
    if (allPermissions.length > 0) {
      loadRolePermissions();
    }
  }, [selectedRole, activeTab, allPermissions]);

  // Fetch permissions when selected user changes
  useEffect(() => {
    if (activeTab !== 'users' || !selectedUser) return;
    async function loadUserPermissions() {
      try {
        const res = await fetch(`/api/v1/admin/users/${selectedUser.id}/permissions`);
        const data = await res.json();
        if (data.success) {
          const grants: Record<string, boolean> = {};
          // Initialize everything as false (by default if no override)
          allPermissions.forEach((p) => {
            grants[p.id] = false;
          });
          // Apply user permission overrides
          data.data.permissions.forEach((up: any) => {
            grants[up.permissionId] = up.granted;
          });
          setCurrentGrants(grants);
          setModifiedGrants(grants);
        }
      } catch (error) {
        console.error('Failed to load user permissions:', error);
      }
    }
    if (allPermissions.length > 0) {
      loadUserPermissions();
    }
  }, [selectedUser, activeTab, allPermissions]);

  const handleTogglePermission = (permissionId: string) => {
    // If selecting a fixed role/user with fixed role, prevent edits
    const isImmutable = activeTab === 'roles' 
      ? selectedRole?.isFixed 
      : (selectedUser?.roleName === 'sistemas' || selectedUser?.roleName === 'administracion');

    if (isImmutable) {
      toast.warning('Los roles fijos del sistema son inmutables y no se pueden modificar');
      return;
    }

    setModifiedGrants(prev => ({
      ...prev,
      [permissionId]: !prev[permissionId]
    }));
  };

  const handleSavePermissions = async () => {
    const isImmutable = activeTab === 'roles' 
      ? selectedRole?.isFixed 
      : (selectedUser?.roleName === 'sistemas' || selectedUser?.roleName === 'administracion');

    if (isImmutable) {
      toast.warning('Los permisos de administrador/sistemas son inmutables');
      return;
    }

    setSaving(true);
    const targetId = activeTab === 'roles' ? selectedRole.id : selectedUser.id;
    const url = activeTab === 'roles' 
      ? `/api/v1/admin/roles/${targetId}/permissions` 
      : `/api/v1/admin/users/${targetId}/permissions`;

    // Construct array of changes
    const payload = Object.keys(modifiedGrants).map(permissionId => ({
      permission_id: permissionId,
      granted: modifiedGrants[permissionId]
    }));

    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al guardar los permisos');
      }

      toast.success('Permisos actualizados con éxito');
      setCurrentGrants({ ...modifiedGrants });
    } catch (error: any) {
      toast.error('Fallo al actualizar', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = JSON.stringify(currentGrants) !== JSON.stringify(modifiedGrants);

  // Logo upload handler
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona un archivo de imagen');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no debe superar los 5MB');
      return;
    }

    try {
      setUploadingLogo(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/v1/company/settings/logo', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al subir logo');
      }

      setLogoUrl(data.data.logoUrl);
      toast.success('Logo actualizado exitosamente', { description: 'Los cambios se reflejarán en toda la aplicación y reportes.' });
    } catch (error: any) {
      toast.error('Fallo al subir logo', { description: error.message });
    } finally {
      setUploadingLogo(false);
      // reset file input
      e.target.value = '';
    }
  };

  // Filter lists
  const filteredUsers = usersList.filter(u => 
    u.name.toLowerCase().includes(userQuery.toLowerCase()) || 
    u.email.toLowerCase().includes(userQuery.toLowerCase()) ||
    u.roleName.toLowerCase().includes(userQuery.toLowerCase())
  );

  const filteredRoles = rolesList.filter(r => 
    r.name.toLowerCase().includes(roleQuery.toLowerCase()) ||
    (r.description && r.description.toLowerCase().includes(roleQuery.toLowerCase()))
  );

  // Group permissions by module
  const groupedPermissions = allPermissions.reduce((acc: Record<string, any[]>, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  const isImmutableActive = activeTab === 'roles' 
    ? selectedRole?.isFixed 
    : (selectedUser?.roleName === 'sistemas' || selectedUser?.roleName === 'administracion');

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-amber-500" />
            <p className="text-slate-400 text-sm">Cargando catálogo de seguridad y permisos...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        
        {/* Title Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-900 pb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-white flex items-center gap-2">
              <Shield className="h-7 w-7 text-amber-500" />
              Gestión y Configuración Administrativa
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Configure accesos por roles, permisos por usuario e identidad de la empresa.
            </p>
          </div>
          {hasChanges && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3"
            >
              <span className="text-xs text-amber-500 font-semibold flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> Cambios pendientes de guardar
              </span>
              <button
                onClick={handleSavePermissions}
                disabled={saving}
                className="flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/5"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar Cambios
              </button>
            </motion.div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => {
              setActiveTab('roles');
              if (rolesList.length > 0 && !selectedRole) setSelectedRole(rolesList[0]);
            }}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'roles'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-slate-400 hover:text-white hover:border-slate-700'
            }`}
          >
            <Shield className="h-4 w-4" />
            Roles del Sistema
          </button>
          <button
            onClick={() => {
              setActiveTab('users');
              if (usersList.length > 0 && !selectedUser) setSelectedUser(usersList[0]);
            }}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'users'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-slate-400 hover:text-white hover:border-slate-700'
            }`}
          >
            <Users className="h-4 w-4" />
            Excepciones por Usuario
          </button>
          <button
            onClick={() => setActiveTab('company')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'company'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-slate-400 hover:text-white hover:border-slate-700'
            }`}
          >
            <Building className="h-4 w-4" />
            Identidad Corporativa
          </button>
        </div>

        {/* Main Grid: Selector sidebar & Grid check list */}
        {activeTab === 'company' ? (
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 md:p-8 max-w-2xl mx-auto shadow-lg space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Logotipo de la Empresa</h2>
              <p className="text-sm text-slate-400 mt-1">
                Sube el logo oficial de tu empresa. Este se mostrará en el menú lateral y en todos los documentos impresos y PDFs generados por ContFast (e.g., Facturas e-CF, Recibos).
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-8 bg-slate-950/50 border border-slate-800 p-6 rounded-xl">
              <div className="flex-shrink-0">
                <div className="h-32 w-32 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900 flex items-center justify-center overflow-hidden relative group">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo actual" className="h-full w-full object-contain p-2" />
                  ) : (
                    <Shield className="h-12 w-12 text-slate-600" />
                  )}
                  {uploadingLogo && (
                    <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center backdrop-blur-sm">
                      <RefreshCw className="h-6 w-6 text-amber-500 animate-spin" />
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex-1 space-y-4 text-center sm:text-left">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">Actualizar Logo</h3>
                  <p className="text-xs text-slate-400">Recomendado: Imagen PNG transparente, al menos 500x500px. Máximo 5MB.</p>
                </div>
                
                <div className="relative inline-block">
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <button
                    disabled={uploadingLogo}
                    className="bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-sm font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {uploadingLogo ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Seleccionar Archivo
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Selector Sidebar */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-6 flex flex-col h-[550px] space-y-4">
            {activeTab === 'roles' ? (
              <>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Listado de Roles</h3>
                <input
                  type="text"
                  placeholder="Buscar rol..."
                  value={roleQuery}
                  onChange={(e) => setRoleQuery(e.target.value)}
                  className="block w-full rounded-md border-0 bg-slate-950 py-2 px-3 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-xs"
                />
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {filteredRoles.map((role) => {
                    const active = selectedRole?.id === role.id;
                    return (
                      <div
                        key={role.id}
                        onClick={() => {
                          if (hasChanges) {
                            if (!confirm('Tiene cambios sin guardar. ¿Desea cambiar de rol y descartar los cambios?')) return;
                          }
                          setSelectedRole(role);
                        }}
                        className={`cursor-pointer p-4 rounded-md border transition-all text-xs flex flex-col justify-between ${
                          active
                            ? 'border-amber-500 bg-amber-500/[0.02]'
                            : 'border-slate-850 bg-slate-950/40 hover:bg-slate-850'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-white capitalize">{role.name}</span>
                          {role.isFixed && (
                            <span className="inline-flex items-center rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 ring-1 ring-inset ring-blue-400/20 uppercase">
                              fijo
                            </span>
                          )}
                        </div>
                        <p className="text-slate-400 mt-1 text-[11px] leading-relaxed">{role.description}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Listado de Usuarios</h3>
                <input
                  type="text"
                  placeholder="Buscar usuario, email o rol..."
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  className="block w-full rounded-md border-0 bg-slate-950 py-2 px-3 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-xs"
                />
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {filteredUsers.map((userItem) => {
                    const active = selectedUser?.id === userItem.id;
                    return (
                      <div
                        key={userItem.id}
                        onClick={() => {
                          if (hasChanges) {
                            if (!confirm('Tiene cambios sin guardar. ¿Desea cambiar de usuario y descartar los cambios?')) return;
                          }
                          setSelectedUser(userItem);
                        }}
                        className={`cursor-pointer p-4 rounded-md border transition-all text-xs flex items-center justify-between ${
                          active
                            ? 'border-amber-500 bg-amber-500/[0.02]'
                            : 'border-slate-850 bg-slate-950/40 hover:bg-slate-850'
                        }`}
                      >
                        <div className="overflow-hidden space-y-0.5">
                          <p className="font-bold text-white truncate">{userItem.name}</p>
                          <p className="text-slate-500 text-[10px] font-mono truncate">{userItem.email}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                          <span className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-500 ring-1 ring-inset ring-amber-500/20 uppercase">
                            {userItem.roleName}
                          </span>
                          <span className={`h-1.5 w-1.5 rounded-full ${userItem.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Permissions Grid */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-6 flex flex-col h-[550px] shadow-lg">
            
            {/* Context Notice */}
            <div className="border-b border-slate-800 pb-4 mb-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">
                  Configurando {activeTab === 'roles' ? 'Rol' : 'Usuario'}
                </span>
                <h2 className="text-lg font-bold text-white capitalize">
                  {activeTab === 'roles' ? selectedRole?.name : selectedUser?.name}
                </h2>
              </div>
              {isImmutableActive && (
                <div className="flex items-center gap-1.5 bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20 rounded px-2.5 py-1 text-xs">
                  <Lock className="h-3.5 w-3.5" />
                  <span>Solo Lectura</span>
                </div>
              )}
            </div>

            {/* Warning alerts for Fixed Roles */}
            {isImmutableActive && (
              <div className="mb-4 bg-slate-950 border border-slate-800 p-4 rounded-lg flex gap-3 text-xs">
                <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-white">Rol del Sistema Protegido</p>
                  <p className="text-slate-400 leading-relaxed">
                    Las cuentas con roles <span className="text-white font-semibold">sistemas</span> o <span className="text-white font-semibold">administración</span> son fijos y gozan de privilegios operacionales implícitos. Drizzle Kit y las reglas RLS protegen estas cuentas de modificaciones accidentales.
                  </p>
                </div>
              </div>
            )}

            {/* Permission modules list */}
            <div className="flex-1 overflow-y-auto space-y-6 pr-1">
              {Object.keys(groupedPermissions).map((moduleName) => (
                <div key={moduleName} className="space-y-3">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800/60 pb-1 capitalize">
                    Módulo: {moduleName}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {groupedPermissions[moduleName].map((perm) => {
                      const granted = modifiedGrants[perm.id] || false;
                      const hasOverride = currentGrants[perm.id] !== undefined;

                      return (
                        <div
                          key={perm.id}
                          onClick={() => handleTogglePermission(perm.id)}
                          className={`flex items-center justify-between p-3 rounded-md border transition-all text-xs ${
                            isImmutableActive 
                              ? 'cursor-not-allowed border-slate-850/60 bg-slate-950/20' 
                              : 'cursor-pointer hover:bg-slate-950/20'
                          } ${
                            granted
                              ? 'border-emerald-500/30 bg-emerald-500/[0.01]'
                              : 'border-slate-850 bg-slate-950/30'
                          }`}
                        >
                          <div className="pr-4 space-y-0.5">
                            <p className="font-bold text-white capitalize">{perm.action}</p>
                            <p className="text-slate-500 text-[10.5px] leading-snug">{perm.description}</p>
                          </div>
                          <button
                            disabled={isImmutableActive}
                            type="button"
                            className={`shrink-0 transition-colors ${granted ? 'text-emerald-500' : 'text-slate-650'}`}
                          >
                            {granted ? (
                              <ToggleRight className="h-7 w-7" />
                            ) : (
                              <ToggleLeft className="h-7 w-7" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

          </div>

        </div>
        )}

      </div>
    </DashboardLayout>
  );
}
