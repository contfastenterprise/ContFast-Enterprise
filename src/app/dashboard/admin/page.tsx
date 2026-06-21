'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Shield, Plus, RefreshCw, X, CheckCircle2, Users as UsersIcon, KeyRound, Lock, UserCheck, UserX, UserSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';

interface User {
  id: string;
  name: string;
  email: string;
  status: string;
  roleName: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  isFixed: boolean;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    passwordRaw: '',
    roleId: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [uRes, rRes] = await Promise.all([
        fetch('/api/v1/admin/users'),
        fetch('/api/v1/admin/roles')
      ]);
      const uData = await uRes.json();
      const rData = await rRes.json();

      if (uData.success) setUsers(uData.data);
      if (rData.success) setRoles(rData.data);
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
        setUserForm({ name: '', email: '', passwordRaw: '', roleId: '' });
      } else {
        toast.error(data.error?.message || 'Error al crear usuario');
      }
    } catch (error) {
      toast.error('Error de red al crear usuario');
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
              Gestión de Acceso
            </h1>
            <p className="text-on-surface-variant/70 text-sm mt-1">
              Controla los usuarios y roles que tienen acceso al ERP.
            </p>
          </div>
          {activeTab === 'users' && (
            <button onClick={() => setShowNewUserModal(true)} className="bg-[#C5A059] hover:bg-[#b08c4a] text-primary px-4 py-2.5 rounded-lg text-sm font-bold shadow transition-colors flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nuevo Usuario
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
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" /></div>
        ) : (
          <div className="mt-6">
            {activeTab === 'users' ? (
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
                              <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-[#003366] font-bold">
                                {user.name.charAt(0).toUpperCase()}
                              </div>
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
                            {user.roleName?.toLowerCase().includes('sistema') ? (
                              <span className="text-xs text-slate-400 italic font-semibold">No suspendible</span>
                            ) : (
                              <button onClick={() => handleToggleStatus(user.id)} className="text-xs font-bold text-on-surface-variant/70 hover:text-[#003366] underline decoration-slate-300 underline-offset-4">
                                {user.status === 'active' ? 'Suspender' : 'Activar'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
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
          </div>
        )}
      </div>

      {/* MODAL: NEW USER */}
      <AnimatePresence>
        {showNewUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-surface-container-low/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative z-10 w-full max-w-md bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-[#003366] bg-[#001733]">
                <h3 className="text-xl font-display font-bold text-white flex items-center gap-2"><UserSquare className="w-5 h-5 text-[#c5a059]" /> Nuevo Usuario</h3>
                <button onClick={() => setShowNewUserModal(false)} className="text-on-surface-variant hover:text-primary transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleCreateUser} className="p-6 space-y-5">
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

    </div>
  );
}
