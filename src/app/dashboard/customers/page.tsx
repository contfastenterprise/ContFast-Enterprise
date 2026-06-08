'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Users, Search, Plus, Edit2, Trash2, X, RefreshCw, AlertTriangle, Building2, MapPin, Mail, Phone, ShieldCheck, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import Link from 'next/link';

interface Customer {
  id: string;
  rncCedula: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  status: string;
  createdAt: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  
  // DGII State
  const [isSearchingRnc, setIsSearchingRnc] = useState(false);
  const [rncVerified, setRncVerified] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    rncCedula: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    status: 'active'
  });

  useEffect(() => {
    fetchCustomers();
  }, [search]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const url = `/api/v1/customers?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setCustomers(data.data || []);
      }
    } catch (error) {
      toast.error('Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  };

  const openNewModal = () => {
    setEditId(null);
    setFormData({ rncCedula: '', name: '', email: '', phone: '', address: '', status: 'active' });
    setRncVerified(false);
    setShowModal(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditId(customer.id);
    setFormData({
      rncCedula: customer.rncCedula,
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      status: customer.status
    });
    setRncVerified(false);
    setShowModal(true);
  };

  const handleSearchDGII = async () => {
    const rnc = formData.rncCedula.replace(/\D/g, '');
    if (rnc.length !== 9 && rnc.length !== 11) {
      toast.error('El RNC/Cédula debe tener 9 u 11 dígitos');
      return;
    }
    
    setIsSearchingRnc(true);
    setRncVerified(false);
    
    try {
      const res = await fetch(`/api/v1/dgii/rnc/${rnc}`);
      const data = await res.json();
      
      if (data.success && data.name) {
        setFormData(prev => ({ ...prev, name: data.name }));
        setRncVerified(true);
        toast.success('Contribuyente validado por DGII');
      } else {
        toast.error(data.message || 'No encontrado en DGII. Puede ingresarlo manual.');
      }
    } catch (error) {
      toast.error('Error de red al consultar DGII');
    } finally {
      setIsSearchingRnc(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro que deseas eliminar al cliente ${name}?`)) return;

    try {
      const res = await fetch(`/api/v1/customers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Cliente eliminado');
        fetchCustomers();
      } else {
        toast.error(data.error?.message || 'Error al eliminar');
      }
    } catch (error) {
      toast.error('Error de red al eliminar');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const url = editId ? `/api/v1/customers/${editId}` : '/api/v1/customers';
      const method = editId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const data = await res.json();
      
      if (data.success) {
        toast.success(editId ? 'Cliente actualizado' : 'Cliente registrado exitosamente');
        setShowModal(false);
        fetchCustomers();
      } else {
        toast.error(data.error?.message || 'Error al guardar cliente');
      }
    } catch (error) {
      toast.error('Error de red al guardar cliente');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-white flex items-center gap-2">
              <Users className="h-7 w-7 text-amber-500" />
              Directorio de Clientes
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Gestiona los datos de facturación y contacto de todos tus clientes.
            </p>
          </div>
          <button
            onClick={openNewModal}
            className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-2.5 px-5 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20"
          >
            <Plus className="h-5 w-5" />
            Nuevo Cliente
          </button>
        </div>

        {/* SEARCH BAR */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 flex items-center">
          <div className="pl-3 pr-2 text-slate-500">
            <Search className="h-5 w-5" />
          </div>
          <input
            type="text"
            placeholder="Buscar por nombre, RNC o Cédula..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent border-none text-white focus:ring-0 text-sm py-2 px-2 outline-none"
          />
          {loading && search && (
            <div className="pr-3 text-amber-500">
              <RefreshCw className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>

        {/* CUSTOMERS LIST */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="p-4 font-semibold">Cliente / Empresa</th>
                  <th className="p-4 font-semibold">RNC/Cédula</th>
                  <th className="p-4 font-semibold hidden md:table-cell">Contacto</th>
                  <th className="p-4 font-semibold hidden lg:table-cell">Dirección</th>
                  <th className="p-4 font-semibold text-center">Estado</th>
                  <th className="p-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {customers.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      No se encontraron clientes. Haz clic en "Nuevo Cliente" para empezar.
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <motion.tr 
                      key={c.id} 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-amber-500 flex-shrink-0">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-white text-sm">{c.name}</p>
                            <p className="text-xs text-slate-500 hidden sm:block">Creado: {new Date(c.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300">
                          <ShieldCheck className="h-3 w-3 text-emerald-500" />
                          {c.rncCedula}
                        </span>
                      </td>
                      <td className="p-4 hidden md:table-cell text-sm text-slate-400">
                        {c.email && <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {c.email}</div>}
                        {c.phone && <div className="flex items-center gap-1.5 mt-1"><Phone className="h-3 w-3" /> {c.phone}</div>}
                        {(!c.email && !c.phone) && <span className="text-slate-600">-</span>}
                      </td>
                      <td className="p-4 hidden lg:table-cell text-sm text-slate-400 max-w-[200px] truncate">
                        {c.address ? (
                          <span className="flex items-center gap-1.5" title={c.address}>
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{c.address}</span>
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          c.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                        }`}>
                          {c.status === 'active' ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/dashboard/customers/${c.id}`} className="p-2 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors" title="Ver Historial">
                            <Eye className="h-4 w-4" />
                          </Link>
                          <button onClick={() => openEditModal(c)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors" title="Editar">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(c.id, c.name)} className="p-2 text-rose-500 hover:bg-rose-500/20 rounded-lg transition-colors" title="Eliminar">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* MODAL */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden relative z-10 shadow-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-800">
                <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-amber-500" />
                  {editId ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-300 flex justify-between">
                      <span>RNC o Cédula <span className="text-slate-500 font-normal text-xs">(Opcional para Consumidor Final)</span></span>
                      {rncVerified && <span className="text-emerald-500 text-xs flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Validado</span>}
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={formData.rncCedula}
                        onChange={(e) => {
                          setFormData({ ...formData, rncCedula: e.target.value });
                          setRncVerified(false);
                        }}
                        className={`w-full bg-slate-950 border ${rncVerified ? 'border-emerald-500/50' : 'border-slate-700'} rounded-lg pl-4 pr-24 py-2.5 text-white focus:border-amber-500 outline-none transition-colors`}
                        placeholder="Ej. 130123456"
                      />
                      <button
                        type="button"
                        onClick={handleSearchDGII}
                        disabled={isSearchingRnc || !formData.rncCedula}
                        className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-900 font-bold text-xs rounded-md flex items-center gap-1.5 transition-colors"
                      >
                        {isSearchingRnc ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                        DGII
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-300">Nombre o Razón Social <span className="text-amber-500">*</span></label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:border-amber-500 outline-none transition-colors"
                      placeholder="Nombre de la empresa o persona"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-300">Correo Electrónico</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:border-amber-500 outline-none transition-colors"
                      placeholder="contacto@empresa.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-300">Teléfono</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:border-amber-500 outline-none transition-colors"
                      placeholder="(809) 000-0000"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-semibold text-slate-300">Dirección</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:border-amber-500 outline-none transition-colors"
                      placeholder="Calle, Número, Sector, Ciudad..."
                    />
                  </div>

                  {editId && (
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-semibold text-slate-300">Estado</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:border-amber-500 outline-none transition-colors"
                      >
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-500/90 leading-relaxed">
                    Verifique que el RNC o Cédula sea correcto. Este dato se usará para la emisión de comprobantes fiscales (e-CF) enviados a la DGII.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-5 py-2.5 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-2.5 px-6 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
                  >
                    {submitting ? <RefreshCw className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                    {editId ? 'Guardar Cambios' : 'Registrar Cliente'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </DashboardLayout>
  );
}
