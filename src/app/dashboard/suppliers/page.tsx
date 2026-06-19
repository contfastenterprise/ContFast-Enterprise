'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Truck, Search, Plus, Edit2, Trash2, X, RefreshCw, AlertTriangle, Building2, MapPin, Mail, Phone, FileCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface Supplier {
  id: string;
  rnc: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  status: string;
  createdAt: string;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchingDGII, setSearchingDGII] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    rnc: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    status: 'active'
  });

  useEffect(() => {
    fetchSuppliers();
  }, [search]);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const url = `/api/v1/suppliers?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setSuppliers(data.data || []);
      }
    } catch (error) {
      toast.error('Error al cargar proveedores');
    } finally {
      setLoading(false);
    }
  };

  const openNewModal = () => {
    setEditId(null);
    setFormData({ rnc: '', name: '', email: '', phone: '', address: '', status: 'active' });
    setShowModal(true);
  };

  const openEditModal = (supplier: Supplier) => {
    setEditId(supplier.id);
    setFormData({
      rnc: supplier.rnc,
      name: supplier.name,
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      status: supplier.status
    });
    setShowModal(true);
  };

  const handleSearchDGII = async () => {
    const rnc = formData.rnc.trim();
    if (!rnc || rnc.length < 9) {
      toast.error('Ingrese un RNC o Cédula válido de al menos 9 dígitos');
      return;
    }

    setSearchingDGII(true);
    try {
      const res = await fetch(`/api/v1/dgii/rnc/${rnc}`);
      const data = await res.json();

      if (data.success && data.data) {
        setFormData(prev => ({
          ...prev,
          name: data.data.name,
          status: 'active'
        }));
        toast.success('Proveedor validado por DGII');
      } else {
        toast.warning(data.message || 'No encontrado en DGII. Puede ingresarlo manual.');
      }
    } catch (error) {
      toast.warning('Servicio DGII inactivo. Ingrese el nombre manualmente.');
    } finally {
      setSearchingDGII(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro que deseas eliminar al proveedor ${name}?`)) return;

    try {
      const res = await fetch(`/api/v1/suppliers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Proveedor eliminado');
        fetchSuppliers();
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
      const url = editId ? `/api/v1/suppliers/${editId}` : '/api/v1/suppliers';
      const method = editId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (data.success) {
        toast.success(editId ? 'Proveedor actualizado' : 'Proveedor registrado exitosamente');
        setShowModal(false);
        fetchSuppliers();
      } else {
        toast.error(data.error?.message || 'Error al guardar proveedor');
      }
    } catch (error) {
      toast.error('Error de red al guardar proveedor');
    } finally {
      setSubmitting(false);
    }
  };

  return (

    <div className="min-h-full bg-slate-50 text-slate-900 font-sans max-w-7xl mx-auto w-full">
      {/* Environment Indicator Placeholder (Corporate Modern Style) */}
      <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-end items-center">
        <span className="text-white text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
          <FileCheck className="h-3 w-3" /> Entorno Seguro
        </span>
      </div>

      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-[#003366] flex items-center gap-2">
              <Truck className="h-7 w-7 text-[#C5A059]" />
              Gestión de Suplidores
            </h1>
            <p className="text-on-surface-variant/70 text-sm mt-1">
              Administre sus suplidores para el registro de compras y gastos fiscales.
            </p>
          </div>
          <button
            onClick={openNewModal}
            className="bg-[#C5A059] hover:bg-[#b08c4a] text-primary font-bold py-2 px-5 rounded flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            <Plus className="h-5 w-5" />
            Nuevo Suplidor
          </button>
        </div>

        {/* SEARCH BAR */}
        <div className="bg-white border border-slate-200 rounded-md p-1.5 flex items-center shadow-sm">
          <div className="pl-3 pr-2 text-on-surface-variant">
            <Search className="h-5 w-5" />
          </div>
          <input
            type="text"
            placeholder="Buscar por nombre, RNC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent border-none text-slate-800 focus:ring-0 text-sm py-2 px-2 outline-none placeholder:text-on-surface-variant"
          />
          {loading && search && (
            <div className="pr-3 text-[#C5A059]">
              <RefreshCw className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>

        {/* SUPPLIERS LIST */}
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-on-surface-variant/70 text-xs uppercase tracking-wider font-semibold">
                  <th className="p-4">Suplidor / Empresa</th>
                  <th className="p-4">RNC</th>
                  <th className="p-4 hidden md:table-cell">Contacto</th>
                  <th className="p-4 hidden lg:table-cell">Dirección</th>
                  <th className="p-4 text-center">Estado</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-on-surface-variant/70">
                      No se encontraron proveedores.
                    </td>
                  </tr>
                ) : (
                  suppliers.map((s) => (
                    <motion.tr
                      key={s.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-[#FFFBEB] transition-colors group"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded bg-[#003366]/10 flex items-center justify-center text-[#003366] font-bold flex-shrink-0">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{s.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex font-mono text-sm text-slate-700">
                          {s.rnc}
                        </span>
                      </td>
                      <td className="p-4 hidden md:table-cell text-sm text-on-surface-variant/80">
                        {s.email && <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-on-surface-variant" /> {s.email}</div>}
                        {s.phone && <div className="flex items-center gap-1.5 mt-1"><Phone className="h-3.5 w-3.5 text-on-surface-variant" /> {s.phone}</div>}
                        {(!s.email && !s.phone) && <span className="text-on-surface-variant">-</span>}
                      </td>
                      <td className="p-4 hidden lg:table-cell text-sm text-on-surface-variant/80 max-w-[200px] truncate">
                        {s.address ? (
                          <span className="flex items-center gap-1.5" title={s.address}>
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-on-surface-variant" />
                            <span className="truncate">{s.address}</span>
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                          {s.status === 'active' ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEditModal(s)} className="p-1.5 text-on-surface-variant hover:text-[#003366] rounded transition-colors">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(s.id, s.name)} className="p-1.5 text-on-surface-variant hover:text-red-600 rounded transition-colors">
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
              className="absolute inset-0 bg-surface-container-low/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden z-10"
            >
              <div className="flex items-center justify-between p-6 border-b border-[#003366] bg-[#001733]">
                <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-[#C5A059]" />
                  {editId ? 'Editar Suplidor' : 'Registrar Nuevo Suplidor'}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-primary transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-primary">RNC / Cédula <span className="text-[#C5A059]">*</span></label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={formData.rnc}
                        onChange={(e) => setFormData({ ...formData, rnc: e.target.value })}
                        className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#C5A059] outline-none transition-colors font-mono"
                        placeholder="Ej. 130123456"
                      />
                      <button
                        type="button"
                        onClick={handleSearchDGII}
                        disabled={searchingDGII || formData.rnc.length < 9}
                        className="bg-[#C5A059] hover:bg-[#d4b069] text-[#001e40] px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                        {searchingDGII ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        DGII
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-primary">Razón Social <span className="text-[#C5A059]">*</span></label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#C5A059] outline-none transition-colors"
                      placeholder="Nombre de la empresa"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-primary">Correo Electrónico</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#C5A059] outline-none transition-colors"
                      placeholder="contacto@proveedor.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-primary">Teléfono</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#C5A059] outline-none transition-colors"
                      placeholder="(809) 000-0000"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-semibold text-primary">Dirección</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#C5A059] outline-none transition-colors"
                      placeholder="Calle, Número, Sector, Ciudad..."
                    />
                  </div>

                  {editId && (
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-semibold text-primary">Estado</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full bg-surface-container-highest border border-outline rounded-lg px-3 py-2 text-xs text-primary focus:border-[#C5A059] outline-none transition-colors"
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
                    Este RNC se utilizará para registrar gastos y reportar a la DGII mediante el formato 606 y facturación electrónica (e-CF). Valide que sea correcto.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-[#003366]">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-5 py-2.5 text-on-surface-variant hover:text-primary font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 bg-[#C5A059] hover:bg-[#d4b069] text-[#001e40] px-6 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50"
                  >
                    {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                    {editId ? 'Guardar Cambios' : 'Registrar Suplidor'}
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
