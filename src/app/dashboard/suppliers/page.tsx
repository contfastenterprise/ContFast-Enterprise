'use client';

import { useState, useEffect } from 'react';
import { Truck, Search, Plus, Edit2, Trash2, X, RefreshCw, AlertTriangle, Building2, MapPin, Mail, Phone, ShieldCheck, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useConfirm } from '@/providers/confirm-provider';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/ui/search-bar';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import {
  TableContainer, Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';

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
  const confirm = useConfirm();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // DGII State
  const [searchingDGII, setSearchingDGII] = useState(false);
  const [rncVerified, setRncVerified] = useState(false);

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
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.ceil(suppliers.length / pageSize);
  const paginatedSuppliers = suppliers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handlePrintList = async () => {
    const toastId = toast.loading('Preparando plantilla de impresión...');
    try {
      const suppliersUrl = `/api/v1/suppliers?limit=100000${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const [settingsRes, suppliersRes] = await Promise.all([
        fetch('/api/v1/company/settings'),
        fetch(suppliersUrl)
      ]);
      const settingsData = await settingsRes.json();
      const suppliersData = await suppliersRes.json();
      const company = settingsData.data || {};
      const allSuppliers = suppliersData.data || [];
      
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('No se pudo abrir la ventana de impresión. Verifique el bloqueador de ventanas emergentes.', { id: toastId });
        return;
      }

      const logoHtml = company.logoUrl 
        ? `<img src="${company.logoUrl}" style="max-height: 55px; width: auto; object-fit: contain; margin-left: -3ch;" alt="Logo">` 
        : '';
      const companyTitleHtml = logoHtml ? '' : `<div style="font-size: 20px; font-weight: bold; color: #003366;">${company.companyName || 'Empresa sin identificar'}</div>`;

      const htmlContent = `
        <html>
          <head>
            <title>Reporte de Suplidores - ${company.companyName || 'Empresa sin identificar'}</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #333; margin: 30px; line-height: 1.4; font-size: 13px; }
              .header { display: flex; justify-content: space-between; border-bottom: 2px solid #003366; padding-bottom: 15px; margin-bottom: 20px; }
              .company-info { font-size: 12px; color: #555; line-height: 1.4; }
              .doc-info { text-align: right; }
              .subtitle { font-size: 16pt; color: #003366; font-weight: bold; margin-bottom: 5px; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { padding: 9px 10px; font-size: 12px; text-align: left; border-bottom: 1px solid #ddd; }
              th { background-color: #003366; color: white; font-weight: bold; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
              tr:nth-child(even) { background-color: #f8f9fa; }
              .text-center { text-align: center; }
              .font-mono { font-family: monospace; font-size: 12px; }
              .footer { margin-top: 50px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 15px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="company-info">
                ${logoHtml}
                ${companyTitleHtml}
                ${company.rnc ? `<div>RNC: ${company.rnc}</div>` : ''}
                ${company.address ? `<div>${company.address}</div>` : ''}
              </div>
              <div class="doc-info">
                <div class="subtitle">DIRECTORIO DE SUPLIDORES</div>
                <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
                <div><strong>Total Suplidores:</strong> ${allSuppliers.length}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Suplidor / Empresa</th>
                  <th>RNC</th>
                  <th>Email</th>
                  <th>Teléfono</th>
                  <th>Dirección</th>
                  <th class="text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${allSuppliers.map((s: any) => `
                  <tr>
                    <td><strong>${s.name}</strong></td>
                    <td class="font-mono">${s.rnc || '-'}</td>
                    <td>${s.email || '-'}</td>
                    <td>${s.phone || '-'}</td>
                    <td>${s.address || '-'}</td>
                    <td class="text-center">
                      <span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; background-color: ${s.status === 'active' ? '#e6f4ea' : '#f1f3f4'}; color: ${s.status === 'active' ? '#137333' : '#5f6368'};">
                        ${s.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="footer">
              Directorio de Suplidores - Generado por ContFast Enterprise
            </div>
            <script>
              window.onload = function() {
                window.print();
              };
            </script>
          </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      toast.success('Impresión preparada con éxito', { id: toastId });
    } catch (err) {
      toast.error('Error al preparar impresión', { id: toastId });
    }
  };

  async function fetchSuppliers() {
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
  }

  const openNewModal = () => {
    setEditId(null);
    setFormData({ rnc: '', name: '', email: '', phone: '', address: '', status: 'active' });
    setRncVerified(false);
    setShowModal(true);
  };

  const openEditModal = (supplier: Supplier) => {
    setEditId(supplier.id);
    setFormData({
      rnc: supplier.rnc || '',
      name: supplier.name,
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      status: supplier.status
    });
    setRncVerified(false);
    setShowModal(true);
  };

  const handleSearchDGII = async () => {
    const rnc = formData.rnc.trim();
    if (!rnc || rnc.length < 9) {
      toast.error('Ingrese un RNC o Cédula válido de al menos 9 dígitos');
      return;
    }

    setSearchingDGII(true);
    setRncVerified(false);

    try {
      const res = await fetch(`/api/v1/dgii/rnc/${rnc}`);
      const data = await res.json();

      if (data.success && data.name) {
        setFormData(prev => ({
          ...prev,
          name: data.name,
          status: 'active'
        }));
        setRncVerified(true);
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
    await confirm({
      title: 'Confirmar eliminación',
      description: `¿Estás seguro que deseas eliminar al proveedor ${name}? Esta acción no se puede deshacer.`,
      action: async () => {
        const res = await fetch(`/api/v1/suppliers/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error?.message || 'Error al eliminar');
        }
        fetchSuppliers();
      },
      onSuccessMessage: 'Proveedor eliminado correctamente.',
      onErrorMessage: 'No fue posible eliminar el proveedor.',
    });
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
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-slate-800 flex items-center gap-2">
            <Truck className="h-7 w-7 text-amber-500" />
            Gestión de Suplidores
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Gestiona los datos de facturación y contacto de todos tus suplidores.
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto shrink-0">
          <button
            onClick={handlePrintList}
            className="flex items-center gap-2 bg-[#C5A059] hover:bg-[#b08c4a] text-slate-950 px-4 py-2 h-9 rounded-lg font-bold shadow-sm hover:shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
          >
            <Printer className="h-4 w-4 text-slate-950" /> Imprimir
          </button>
          <button
            onClick={openNewModal}
            className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
          >
            <Plus className="h-4 w-4" />
            Nuevo Suplidor
          </button>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="flex items-center gap-2">
        <SearchBar
          placeholder="Buscar por nombre, RNC..."
          value={search}
          onChange={setSearch}
          className="flex-1"
        />
        {loading && search && (
          <div className="text-amber-500 shrink-0">
            <RefreshCw className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>

      {/* SUPPLIERS TABLE */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/80 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">Suplidor / Empresa</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">RNC</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest hidden md:table-cell">Contacto</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest hidden lg:table-cell">Dirección</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest text-center">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" />
                      <span className="text-slate-500 text-sm font-medium">Cargando suplidores...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Truck className="h-8 w-8 text-slate-300" />
                      <span className="text-slate-500 text-sm">No se encontraron suplidores. Haz clic en "Nuevo Suplidor" para empezar.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedSuppliers.map((s) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-[#C5A059]/5 transition-colors group"
                  >
                    <td className="px-4 py-2 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[#C5A059] flex-shrink-0 text-sm">
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-[#003366] text-xs">{s.name}</p>
                          <p className="text-[10px] text-slate-400 hidden sm:block">Creado: {new Date(s.createdAt).toLocaleDateString('es-DO')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        <ShieldCheck className="h-3 w-3 text-emerald-500" />
                        {s.rnc || 'S/N'}
                      </span>
                    </td>
                    <td className="px-4 py-2 align-middle hidden md:table-cell">
                      <div className="flex flex-col gap-0.5">
                        {s.email && <div className="flex items-center gap-1.5 text-[11px] text-slate-600"><Mail className="h-3 w-3" /> {s.email}</div>}
                        {s.phone && <div className="flex items-center gap-1.5 text-[11px] text-slate-600"><Phone className="h-3 w-3" /> {s.phone}</div>}
                        {(!s.email && !s.phone) && <span className="text-slate-400 text-xs">-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2 align-middle hidden lg:table-cell text-[11px] text-slate-600 max-w-[200px]">
                      {s.address ? (
                        <span className="flex items-center gap-1.5" title={s.address}>
                          <MapPin className="h-3 w-3 flex-shrink-0 text-slate-400" />
                          <span className="truncate block max-w-[180px]">{s.address}</span>
                        </span>
                      ) : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-2 align-middle text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border whitespace-nowrap ${
                        s.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1 ${s.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {s.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-2 align-middle text-right">
                      <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditModal(s)} className="p-1.5 rounded-lg transition-colors flex items-center justify-center text-slate-500 hover:text-[#003366] hover:bg-[#003366]/10" title="Editar">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(s.id, s.name)} className="p-1.5 rounded-lg transition-colors flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50" title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {suppliers.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={suppliers.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
        )}
      </div>

      {/* MODAL */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-3xl bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col z-10"
            >
              <div className="flex justify-between items-center p-4 border-b border-slate-200 bg-white">
                <h2 className="text-base font-bold text-slate-800 font-display flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-slate-500" />
                  {editId ? 'Editar Suplidor' : 'Registrar Nuevo Suplidor'}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-slate-700 cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-1 md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <span>RNC o Cédula</span>
                        <span className="text-slate-400 font-normal normal-case tracking-normal">(Opcional)</span>
                      </label>
                      {rncVerified && (
                        <span className="text-emerald-600 text-[10px] uppercase font-bold flex items-center gap-1">
                          <ShieldCheck className="h-3.5 w-3.5" /> Validado DGII
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.rnc || ''}
                        onChange={(e) => {
                          setFormData({ ...formData, rnc: e.target.value });
                          setRncVerified(false);
                        }}
                        className={`flex-1 h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 font-mono ${rncVerified ? 'border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/20' : ''}`}
                        placeholder="Ej. 130123456"
                      />
                      <button
                        type="button"
                        onClick={handleSearchDGII}
                        disabled={searchingDGII || !formData.rnc}
                        className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
                      >
                        {searchingDGII ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                        Buscar DGII
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nombre o Razón Social <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
                      placeholder="Nombre de la empresa o persona"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Correo Electrónico</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
                      placeholder="contacto@empresa.com"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Teléfono</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
                      placeholder="(809) 000-0000"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dirección</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
                      placeholder="Calle, Número, Sector, Ciudad..."
                    />
                  </div>

                  {editId && (
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Estado</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 appearance-none"
                      >
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Este RNC se utilizará para registrar gastos y reportar a la DGII mediante el formato 606 y facturación electrónica (e-CF). Valide que sea correcto.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 px-4 py-2 h-9 rounded-lg font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
                  >
                    <X className="w-4 h-4" />
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
                  >
                    {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
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
