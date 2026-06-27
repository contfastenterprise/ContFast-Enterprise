'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Shield, Plus, RefreshCw, X, CheckCircle2, Users as UsersIcon, KeyRound, Lock, UserCheck, UserX, UserSquare, CreditCard, Award, Zap, FileText, Layers, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';
import Avatar from '@/components/ui/Avatar';
import AvatarUploader from '@/components/ui/AvatarUploader';

interface User {
  id: string;
  name: string;
  email: string;
  status: string;
  roleName: string;
  roleId?: string;
  avatarUrl?: string | null;
  avatarPath?: string | null;
}

interface Role {
  id: string;
  name: string;
  description: string;
  isFixed: boolean;
}

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: string;
  maxEcfLimit: number;
  maxUsers: number;
  maxWarehouses: number;
  active: boolean;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'plans'>('users');

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<{
    id: string;
    status: string;
    currentPeriodEnd: string;
    planName: string;
    maxEcfLimit: number;
    maxUsers: number;
    maxWarehouses: number;
  } | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Modals
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [showNewRoleModal, setShowNewRoleModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [newUserTempId, setNewUserTempId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    passwordRaw: '',
    roleId: '',
    avatarUrl: '',
    avatarPath: ''
  });

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserForm, setEditUserForm] = useState({
    name: '',
    email: '',
    passwordRaw: '',
    roleId: '',
    avatarUrl: '',
    avatarPath: ''
  });

  const [roleForm, setRoleForm] = useState({
    name: '',
    description: ''
  });

  const [planForm, setPlanForm] = useState({
    name: '',
    description: '',
    price: 0,
    maxEcfLimit: 100,
    maxUsers: 5,
    maxWarehouses: 1,
    active: true
  });

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [meRes, uRes, rRes, pRes, sRes] = await Promise.all([
        fetch('/api/v1/auth/me'),
        activeTab === 'users' ? fetch('/api/v1/admin/users') : Promise.resolve(null),
        activeTab === 'roles' ? fetch('/api/v1/admin/roles') : Promise.resolve(null),
        activeTab === 'plans' ? fetch('/api/v1/admin/plans') : Promise.resolve(null),
        activeTab === 'plans' ? fetch('/api/v1/admin/settings') : Promise.resolve(null)
      ]);

      const meData = await meRes.json();
      if (meData.success && meData.data?.user) {
        setCurrentUserRole(meData.data.user.role || '');
      }

      if (uRes) {
        const uData = await uRes.json();
        if (uData.success) setUsers(uData.data);
      }

      if (rRes) {
        const rData = await rRes.json();
        if (rData.success) setRoles(rData.data);
      }

      if (pRes) {
        const pData = await pRes.json();
        if (pData.success) setPlans(pData.data);
      }

      if (sRes) {
        const sData = await sRes.json();
        if (sData.success) setSubscription(sData.data.subscription || null);
      }
    } catch (err) {
      toast.error('Error al cargar datos administrativos');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userForm)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Usuario creado exitosamente');
        setShowNewUserModal(false);
        fetchData();
        setUserForm({ name: '', email: '', passwordRaw: '', roleId: '', avatarUrl: '', avatarPath: '' });
      } else {
        toast.error(data.error?.message || 'Error al crear usuario');
      }
    } catch (error) {
      toast.error('Error de red al crear usuario');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenNewUser = () => {
    setNewUserTempId(crypto.randomUUID());
    setUserForm({ name: '', email: '', passwordRaw: '', roleId: '', avatarUrl: '', avatarPath: '' });
    setShowNewUserModal(true);
  };

  const handleOpenEditUser = (user: User) => {
    setEditingUserId(user.id);
    setEditUserForm({
      name: user.name,
      email: user.email,
      passwordRaw: '',
      roleId: user.roleId || '',
      avatarUrl: user.avatarUrl || '',
      avatarPath: user.avatarPath || ''
    });
    setShowEditUserModal(true);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/admin/users/${editingUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editUserForm)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Usuario modificado exitosamente');
        setShowEditUserModal(false);
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al modificar usuario');
      }
    } catch (error) {
      toast.error('Error de red al modificar usuario');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roleForm)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Rol creado exitosamente');
        setShowNewRoleModal(false);
        fetchData();
        setRoleForm({ name: '', description: '' });
      } else {
        toast.error(data.error?.message || 'Error al crear rol');
      }
    } catch (error) {
      toast.error('Error de red al crear rol');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPlanModal = (plan: Plan | null = null) => {
    setSelectedPlan(plan);
    if (plan) {
      setPlanForm({
        name: plan.name,
        description: plan.description || '',
        price: parseFloat(plan.price),
        maxEcfLimit: plan.maxEcfLimit,
        maxUsers: plan.maxUsers,
        maxWarehouses: plan.maxWarehouses,
        active: plan.active
      });
    } else {
      setPlanForm({
        name: '',
        description: '',
        price: 0,
        maxEcfLimit: 100,
        maxUsers: 5,
        maxWarehouses: 1,
        active: true
      });
    }
    setShowPlanModal(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let res;
      if (selectedPlan) {
        // Edit Plan
        res = await fetch(`/api/v1/admin/plans/${selectedPlan.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(planForm)
        });
      } else {
        // Create Plan
        res = await fetch('/api/v1/admin/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(planForm)
        });
      }

      const data = await res.json();
      if (data.success) {
        toast.success(selectedPlan ? 'Plan actualizado correctamente' : 'Plan SaaS creado correctamente');
        setShowPlanModal(false);
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al guardar plan');
      }
    } catch (error) {
      toast.error('Error de red al guardar plan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (userId: string) => {
    try {
      const res = await fetch('/api/v1/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Estado actualizado');
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al actualizar estado');
      }
    } catch (error) {
      toast.error('Error de red al actualizar estado');
    }
  };

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20 max-w-7xl mx-auto w-full">
      <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-end items-center shadow-inner">
        <span className="text-white text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
          <Shield className="h-3 w-3" /> Permisos & Administración
        </span>
      </div>

      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-[#003366] flex items-center gap-2">
              Gestión de Acceso y Planes
            </h1>
            <p className="text-on-surface-variant/70 text-sm mt-1">
              Controla los usuarios, roles y planes de suscripción de la plataforma.
            </p>
          </div>
          {activeTab === 'users' && (
            <button onClick={handleOpenNewUser} className="bg-[#C5A059] hover:bg-[#b08c4a] text-primary px-4 py-2.5 rounded-lg text-sm font-bold shadow transition-colors flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nuevo Usuario
            </button>
          )}
          {activeTab === 'roles' && currentUserRole === 'sistemas' && (
            <button onClick={() => setShowNewRoleModal(true)} className="bg-[#C5A059] hover:bg-[#b08c4a] text-primary px-4 py-2.5 rounded-lg text-sm font-bold shadow transition-colors flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nuevo Rol
            </button>
          )}
          {activeTab === 'plans' && currentUserRole === 'sistemas' && (
            <button onClick={() => handleOpenPlanModal(null)} className="bg-[#C5A059] hover:bg-[#b08c4a] text-primary px-4 py-2.5 rounded-lg text-sm font-bold shadow transition-colors flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nuevo Plan SaaS
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('users')}
            className={clsx("px-6 py-3 font-bold text-sm transition-colors border-b-2", activeTab === 'users' ? 'border-[#003366] text-[#003366]' : 'border-transparent text-on-surface-variant/70 hover:text-slate-800')}
          >
            <div className="flex items-center gap-2"><UsersIcon className="w-4 h-4" /> Usuarios</div>
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={clsx("px-6 py-3 font-bold text-sm transition-colors border-b-2", activeTab === 'roles' ? 'border-[#003366] text-[#003366]' : 'border-transparent text-on-surface-variant/70 hover:text-slate-800')}
          >
            <div className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Roles del Sistema</div>
          </button>
          {(currentUserRole === 'sistemas' || currentUserRole === 'administracion' || currentUserRole?.toLowerCase().includes('admin')) && (
            <button
              onClick={() => setActiveTab('plans')}
              className={clsx("px-6 py-3 font-bold text-sm transition-colors border-b-2", activeTab === 'plans' ? 'border-[#003366] text-[#003366]' : 'border-transparent text-on-surface-variant/70 hover:text-slate-800')}
            >
              <div className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> {currentUserRole === 'sistemas' ? 'Planes SaaS' : 'Mi Suscripción'}</div>
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" /></div>
        ) : (
          <div className="mt-6">
            {activeTab === 'users' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[10px] tracking-widest text-on-surface-variant uppercase font-bold">
                    <tr>
                      <th className="px-6 py-4">Usuario</th>
                      <th className="px-6 py-4">Rol Asignado</th>
                      <th className="px-6 py-4 text-center">Estado</th>
                      <th className="px-6 py-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {users.length === 0 ? (
                      <tr><td colSpan={4} className="px-6 py-12 text-center text-on-surface-variant/70">No hay usuarios registrados.</td></tr>
                    ) : (
                      users.map(user => (
                        <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <Avatar
                                src={user.avatarUrl}
                                name={user.name}
                                size={38}
                                className="border border-slate-200"
                              />
                              <div>
                                <p className="font-bold text-[#003366]">{user.name}</p>
                                <p className="text-xs text-on-surface-variant/70">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#003366]/5 text-[#003366] text-xs font-bold capitalize">
                              <Shield className="w-3 h-3" /> {user.roleName}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {user.status === 'active' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700 uppercase">
                                <UserCheck className="w-3 h-3" /> Activo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-700 uppercase">
                                <UserX className="w-3 h-3" /> Inactivo
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-3">
                              <button onClick={() => handleOpenEditUser(user)} className="text-xs font-bold text-[#003366] hover:text-[#C5A059] underline decoration-slate-300 underline-offset-4">
                                Modificar
                              </button>
                              {user.roleName?.toLowerCase().includes('sistema') ? (
                                <span className="text-xs text-slate-400 italic font-semibold">No suspendible</span>
                              ) : (
                                <button onClick={() => handleToggleStatus(user.id)} className="text-xs font-bold text-on-surface-variant/70 hover:text-[#003366] underline decoration-slate-300 underline-offset-4">
                                  {user.status === 'active' ? 'Suspender' : 'Activar'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'roles' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {roles
                  .filter(role => role.name.toLowerCase() !== 'sistemas' && role.name.toLowerCase() !== 'sistema')
                  .map(role => (
                    <div key={role.id} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-[#C5A059]" />
                      <div className="flex items-center gap-3 mb-2">
                        <Lock className="w-5 h-5 text-[#003366]" />
                        <h3 className="font-bold text-lg text-[#003366] capitalize">{role.name}</h3>
                        {role.isFixed && <span className="ml-auto text-[9px] font-bold uppercase tracking-widest bg-slate-100 text-on-surface-variant/70 px-2 py-1 rounded">Sistema</span>}
                      </div>
                      <p className="text-sm text-on-surface-variant/70 mb-4">{role.description || 'Sin descripción'}</p>
                    </div>
                  ))}
              </div>
            )}

            {activeTab === 'plans' && currentUserRole === 'sistemas' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {plans.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-slate-500">No hay planes registrados.</div>
                ) : (
                  plans.map(plan => (
                    <div key={plan.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-bold text-lg text-[#003366]">{plan.name}</h3>
                            <p className="text-xs text-slate-500 mt-1 max-w-[200px]">{plan.description || 'Sin descripción'}</p>
                          </div>
                          <span className={clsx(
                            "px-2.5 py-0.5 rounded text-[10px] uppercase font-bold",
                            plan.active ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                          )}>
                            {plan.active ? 'Activo' : 'Desactivado'}
                          </span>
                        </div>

                        <div className="border-t border-slate-100 pt-4 mb-4">
                          <div className="text-3xl font-extrabold text-slate-900">
                            RD$ {parseFloat(plan.price).toLocaleString('es-DO')}
                            <span className="text-xs text-slate-500 font-normal"> / mes</span>
                          </div>
                        </div>

                        <div className="space-y-2 mb-6">
                          <div className="flex justify-between text-xs text-slate-700">
                            <span>Límite de e-CF:</span>
                            <span className="font-bold">{plan.maxEcfLimit === -1 ? 'Ilimitados' : `${plan.maxEcfLimit} / mes`}</span>
                          </div>
                          <div className="flex justify-between text-xs text-slate-700">
                            <span>Límite de Usuarios:</span>
                            <span className="font-bold">{plan.maxUsers === -1 ? 'Ilimitados' : `${plan.maxUsers}`}</span>
                          </div>
                          <div className="flex justify-between text-xs text-slate-700">
                            <span>Límite de Almacenes:</span>
                            <span className="font-bold">{plan.maxWarehouses === -1 ? 'Ilimitados' : `${plan.maxWarehouses}`}</span>
                          </div>
                        </div>
                      </div>

                      {currentUserRole === 'sistemas' && (
                        <button
                          onClick={() => handleOpenPlanModal(plan)}
                          className="w-full mt-4 bg-[#003366] hover:bg-[#002244] text-white font-bold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                          <Zap className="h-3 w-3 text-[#C5A059]" /> Modificar Plan
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'plans' && currentUserRole !== 'sistemas' && (
              <div className="max-w-3xl">
                {subscription ? (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
                    <div className="bg-[#003366] px-6 py-8 text-white relative">
                      <div className="absolute top-0 right-0 p-8 opacity-10">
                        <Award className="w-32 h-32" />
                      </div>
                      <p className="text-xs uppercase tracking-widest font-bold text-slate-300">Plan de Suscripción Activo</p>
                      <h3 className="text-2xl font-display font-bold mt-2">{subscription.planName}</h3>
                      <div className="mt-4 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          Suscripción Activa
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-6 space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Límite e-CF</p>
                            <p className="text-lg font-bold text-slate-800 mt-1">
                              {subscription.maxEcfLimit === -1 ? 'Ilimitado' : `${subscription.maxEcfLimit} / mes`}
                            </p>
                          </div>
                        </div>

                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <UsersIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Límite de Usuarios</p>
                            <p className="text-lg font-bold text-slate-800 mt-1">
                              {subscription.maxUsers === -1 ? 'Ilimitado' : `${subscription.maxUsers}`}
                            </p>
                          </div>
                        </div>

                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                          <div className="p-2 bg-violet-50 text-violet-600 rounded-lg">
                            <Layers className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Límite de Almacenes</p>
                            <p className="text-lg font-bold text-slate-800 mt-1">
                              {subscription.maxWarehouses === -1 ? 'Ilimitado' : `${subscription.maxWarehouses}`}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <div className="flex items-center gap-2 text-slate-600">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span className="text-xs font-semibold">
                            Vencimiento / Renovación:{' '}
                            <span className="text-slate-800 font-bold">
                              {new Date(subscription.currentPeriodEnd).toLocaleDateString('es-DO', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })}
                            </span>
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium italic">
                          Para modificar su plan o límites, contacte a soporte.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center animate-fade-in">
                    <p className="text-sm text-slate-500 font-medium">No se encontró una suscripción activa para esta empresa.</p>
                    <p className="text-xs text-slate-400 mt-1">Por favor, póngase en contacto con soporte técnico para activar su plan.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: NEW USER */}
      <AnimatePresence>
        {showNewUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-surface-container-low/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 w-full max-w-3xl bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-[#003366] bg-[#001733]">
                <h3 className="text-xl font-display font-bold text-white flex items-center gap-2"><UserSquare className="w-5 h-5 text-[#c5a059]" /> Nuevo Usuario</h3>
                <button onClick={() => setShowNewUserModal(false)} className="text-on-surface-variant hover:text-primary transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleCreateUser} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column: Form Fields */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-semibold text-primary block mb-1">Nombre Completo</label>
                      <input type="text" required value={userForm.name} onChange={e => setUserForm({ ...userForm, name: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors" placeholder="Ej. Juan Pérez" />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-primary block mb-1">Correo Electrónico</label>
                      <input type="email" required value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors" placeholder="usuario@empresa.com" />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-primary block mb-1">Contraseña Inicial</label>
                      <input type="password" required minLength={6} value={userForm.passwordRaw} onChange={e => setUserForm({ ...userForm, passwordRaw: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors" placeholder="Mínimo 6 caracteres" />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-primary block mb-1">Asignar Rol</label>
                      <select required value={userForm.roleId} onChange={e => setUserForm({ ...userForm, roleId: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors capitalize">
                        <option value="">Seleccione un rol...</option>
                        {roles
                          .filter(r => r.name.toLowerCase() !== 'sistemas' && r.name.toLowerCase() !== 'sistema')
                          .map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {/* Right Column: Avatar Uploader */}
                  <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-zinc-900/40 rounded-xl border border-dashed border-outline-variant/30">
                    <label className="text-sm font-semibold text-primary block self-start mb-2">Foto de Perfil (Local)</label>
                    <AvatarUploader
                      currentAvatarUrl={userForm.avatarUrl}
                      currentAvatarPath={userForm.avatarPath}
                      userName={userForm.name || 'CF'}
                      userId={newUserTempId}
                      skipDatabaseUpdate={true}
                      onUploadSuccess={(url, path) => setUserForm({ ...userForm, avatarUrl: url, avatarPath: path })}
                      onDeleteSuccess={() => setUserForm({ ...userForm, avatarUrl: '', avatarPath: '' })}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-[#003366]">
                  <button type="button" onClick={() => setShowNewUserModal(false)} className="px-5 py-2.5 text-on-surface-variant hover:text-primary font-medium transition-colors">Cancelar</button>
                  <button type="submit" disabled={submitting} className="flex items-center gap-2 bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] px-6 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50">
                    {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Crear Usuario
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: EDIT USER */}
      <AnimatePresence>
        {showEditUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-surface-container-low/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 w-full max-w-3xl bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-[#003366] bg-[#001733]">
                <h3 className="text-xl font-display font-bold text-white flex items-center gap-2"><UserSquare className="w-5 h-5 text-[#c5a059]" /> Modificar Usuario</h3>
                <button onClick={() => setShowEditUserModal(false)} className="text-on-surface-variant hover:text-primary transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleEditUser} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column: Form Fields */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-semibold text-primary block mb-1">Nombre Completo</label>
                      <input type="text" required value={editUserForm.name} onChange={e => setEditUserForm({ ...editUserForm, name: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors" placeholder="Ej. Juan Pérez" />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-primary block mb-1">Correo Electrónico</label>
                      <input type="email" required value={editUserForm.email} onChange={e => setEditUserForm({ ...editUserForm, email: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors" placeholder="usuario@empresa.com" />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-primary block mb-1">Contraseña (dejar en blanco para no cambiar)</label>
                      <input type="password" minLength={6} value={editUserForm.passwordRaw} onChange={e => setEditUserForm({ ...editUserForm, passwordRaw: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors" placeholder="Mínimo 6 caracteres" />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-primary block mb-1">Asignar Rol</label>
                      <select required value={editUserForm.roleId} onChange={e => setEditUserForm({ ...editUserForm, roleId: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors capitalize">
                        <option value="">Seleccione un rol...</option>
                        {roles
                          .filter(r => r.name.toLowerCase() !== 'sistemas' && r.name.toLowerCase() !== 'sistema')
                          .map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {/* Right Column: Avatar Uploader */}
                  <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-zinc-900/40 rounded-xl border border-dashed border-outline-variant/30">
                    <label className="text-sm font-semibold text-primary block self-start mb-2">Foto de Perfil (Local)</label>
                    <AvatarUploader
                      currentAvatarUrl={editUserForm.avatarUrl}
                      currentAvatarPath={editUserForm.avatarPath}
                      userName={editUserForm.name || 'CF'}
                      userId={editingUserId || 'edit-user'}
                      skipDatabaseUpdate={true}
                      onUploadSuccess={(url, path) => setEditUserForm({ ...editUserForm, avatarUrl: url, avatarPath: path })}
                      onDeleteSuccess={() => setEditUserForm({ ...editUserForm, avatarUrl: '', avatarPath: '' })}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-[#003366]">
                  <button type="button" onClick={() => setShowEditUserModal(false)} className="px-5 py-2.5 text-on-surface-variant hover:text-primary font-medium transition-colors">Cancelar</button>
                  <button type="submit" disabled={submitting} className="flex items-center gap-2 bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] px-6 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50">
                    {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Guardar Cambios
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: NEW ROLE */}
      <AnimatePresence>
        {showNewRoleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-surface-container-low/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 w-full max-w-md bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-[#003366] bg-[#001733]">
                <h3 className="text-xl font-display font-bold text-white flex items-center gap-2"><KeyRound className="w-5 h-5 text-[#c5a059]" /> Nuevo Rol</h3>
                <button onClick={() => setShowNewRoleModal(false)} className="text-on-surface-variant hover:text-primary transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleCreateRole} className="p-6 space-y-5">
                <div>
                  <label className="text-sm font-semibold text-primary block mb-1">Nombre del Rol</label>
                  <input type="text" required value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors" placeholder="Ej. ventas, soporte, etc." />
                </div>
                <div>
                  <label className="text-sm font-semibold text-primary block mb-1">Descripción</label>
                  <textarea value={roleForm.description} onChange={e => setRoleForm({ ...roleForm, description: e.target.value })} className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none transition-colors" placeholder="Describa las responsabilidades del rol" rows={3} />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-[#003366]">
                  <button type="button" onClick={() => setShowNewRoleModal(false)} className="px-5 py-2.5 text-on-surface-variant hover:text-primary font-medium transition-colors">Cancelar</button>
                  <button type="submit" disabled={submitting} className="flex items-center gap-2 bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] px-6 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50">
                    {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Crear Rol
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: NEW / EDIT PLAN */}
      <AnimatePresence>
        {showPlanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 w-full max-w-md bg-white border border-[#003366] rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-[#003366] bg-[#001733]">
                <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#c5a059]" /> 
                  {selectedPlan ? 'Editar Plan SaaS' : 'Nuevo Plan SaaS'}
                </h3>
                <button onClick={() => setShowPlanModal(false)} className="text-white hover:text-[#c5a059] transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSavePlan} className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Nombre del Plan <span className="text-red-500">*</span></label>
                  <input type="text" required value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:border-[#c5a059] outline-none transition-colors" placeholder="Ej. Básico, Profesional, Ilimitado" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Descripción</label>
                  <textarea value={planForm.description} onChange={e => setPlanForm({ ...planForm, description: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:border-[#c5a059] outline-none transition-colors resize-none" placeholder="Breve resumen del plan..." rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Precio Mensual (RD$) <span className="text-red-500">*</span></label>
                    <input type="number" required min={0} value={planForm.price} onChange={e => setPlanForm({ ...planForm, price: parseFloat(e.target.value) || 0 })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:border-[#c5a059] outline-none transition-colors" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Límite e-CF <span className="text-red-500">*</span></label>
                    <input type="number" required min={-1} value={planForm.maxEcfLimit} onChange={e => setPlanForm({ ...planForm, maxEcfLimit: parseInt(e.target.value) || -1 })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:border-[#c5a059] outline-none transition-colors" placeholder="-1 para Ilimitado" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Límite de Usuarios <span className="text-red-500">*</span></label>
                    <input type="number" required min={-1} value={planForm.maxUsers} onChange={e => setPlanForm({ ...planForm, maxUsers: parseInt(e.target.value) || -1 })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:border-[#c5a059] outline-none transition-colors" placeholder="-1 para Ilimitado" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Límite Almacenes <span className="text-red-500">*</span></label>
                    <input type="number" required min={1} value={planForm.maxWarehouses} onChange={e => setPlanForm({ ...planForm, maxWarehouses: parseInt(e.target.value) || 1 })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:border-[#c5a059] outline-none transition-colors" />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <input type="checkbox" id="planActive" checked={planForm.active} onChange={e => setPlanForm({ ...planForm, active: e.target.checked })} className="h-4 w-4 border-slate-200 rounded text-primary focus:ring-primary" />
                  <label htmlFor="planActive" className="text-xs font-bold text-slate-700 cursor-pointer">Plan Habilitado para Contratación</label>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button type="button" onClick={() => setShowPlanModal(false)} className="px-5 py-2 text-slate-700 hover:text-[#003366] font-medium transition-colors">Cancelar</button>
                  <button type="submit" disabled={submitting} className="flex items-center gap-2 bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] px-6 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50">
                    {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Guardar Plan
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
