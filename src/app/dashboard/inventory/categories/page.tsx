'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Tag, RefreshCw, X, Save, Printer, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { SearchBar } from '@/components/ui/search-bar';

interface Category {
  id: string;
  name: string;
  description: string | null;
  status: string;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'active'
  });

  const itemsPerPage = 15;
  const totalPages = Math.ceil(categories.length / itemsPerPage);
  const pagedCategories = categories.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const fetchCategories = async (searchQuery = search) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/categories?search=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data.success) {
        setCategories(data.data);
      }
    } catch (err) {
      toast.error('Error al cargar categorías');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchCategories();
  }, [search]);

  const handlePrintList = async () => {
    const toastId = toast.loading('Preparando plantilla de impresión...');
    try {
      const res = await fetch('/api/v1/company/settings');
      const settingsData = await res.json();
      const company = settingsData.data || {};
      
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const logoHtml = company.logoUrl 
        ? `<img src="${company.logoUrl}" style="max-height: 55px; width: auto; object-fit: contain; margin-left: -3ch;" alt="Logo">` 
        : '';
      const companyTitleHtml = logoHtml ? '' : `<div style="font-size: 20px; font-weight: bold; color: #003366;">${company.companyName || 'Latin Doors e-CF'}</div>`;

      const htmlContent = `
        <html>
          <head>
            <title>Reporte de Categorías - ${company.companyName || 'Latin Doors e-CF'}</title>
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
                <div class="subtitle">CATEGORÍAS DE PRODUCTOS</div>
                <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
                <div><strong>Total Categorías:</strong> ${categories.length}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Descripción</th>
                  <th class="text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${categories.map(cat => `
                  <tr>
                    <td><strong>${cat.name}</strong></td>
                    <td>${cat.description || '-'}</td>
                    <td class="text-center">
                      <span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; background-color: ${cat.status === 'active' ? '#e6f4ea' : '#f1f3f4'}; color: ${cat.status === 'active' ? '#137333' : '#5f6368'};">
                        ${cat.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="footer">
              Reporte de Categorías - Generado por ContFast Enterprise
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

  const openNewModal = () => {
    setEditId(null);
    setFormData({ name: '', description: '', status: 'active' });
    setShowModal(true);
  };

  const openEditModal = (cat: Category) => {
    setEditId(cat.id);
    setFormData({
      name: cat.name,
      description: cat.description || '',
      status: cat.status || 'active'
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const method = editId ? 'PUT' : 'POST';
      const url = editId ? `/api/v1/categories/${editId}` : '/api/v1/categories';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      
      if (data.success) {
        toast.success(editId ? 'Categoría actualizada' : 'Categoría creada');
        setShowModal(false);
        fetchCategories();
      } else {
        toast.error(data.error?.message || 'Ocurrió un error');
      }
    } catch (err) {
      toast.error('Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar esta categoría?')) return;
    try {
      const res = await fetch(`/api/v1/categories/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Categoría eliminada');
        fetchCategories();
      } else {
        toast.error(data.error?.message || 'Error al eliminar');
      }
    } catch (err) {
      toast.error('Error de red');
    }
  };

  return (
    <div className="space-y-8 animate-fade-in-up pb-10">
      <header className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          <h1 className="font-display-lg text-3xl md:text-4xl text-primary tracking-tight font-extrabold flex items-center gap-3">
            <Tag className="h-8 w-8 text-primary" /> Categorías
          </h1>
          <p className="font-body-lg text-on-surface-variant/80 mt-1">Clasifica y organiza tu catálogo de productos.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={handlePrintList}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-[#003366] px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-bold text-sm shadow-sm"
          >
            <Printer className="h-4 w-4 text-amber-500" /> Imprimir
          </button>
          <button
            onClick={openNewModal}
            className="bg-[#003366] hover:bg-[#002244] text-white font-bold py-2.5 px-6 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm justify-center flex-1 md:flex-none"
          >
            <Plus className="h-4 w-4" />
            <span className="font-bold">Nueva Categoría</span>
          </button>
        </div>
      </header>

      {/* SEARCH BAR */}
      <div className="flex items-center gap-2">
        <SearchBar
          placeholder="Buscar por nombre..."
          value={search}
          onChange={setSearch}
          className="flex-1"
        />
        {loading && search && (
          <div className="text-primary shrink-0">
            <RefreshCw className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center text-primary">
            <RefreshCw className="h-6 w-6 animate-spin text-[#C5A059]" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Nombre</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Descripción</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-24 text-center">Estado</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right w-24">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedCategories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-[#C5A059]/5 transition-colors group">
                    <td className="px-4 py-2 align-middle text-xs font-semibold text-[#003366]">{cat.name}</td>
                    <td className="px-4 py-2 align-middle text-xs text-slate-600">{cat.description || '-'}</td>
                    <td className="px-4 py-2 align-middle text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${cat.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                        {cat.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                    </td>
                    <td className="px-4 py-2 align-middle text-right">
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditModal(cat)} className="p-1.5 text-slate-500 hover:text-[#003366] hover:bg-[#003366]/5 rounded-lg transition-colors">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(cat.id)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-slate-400 text-xs">
                      No hay categorías registradas. Crea una nueva para comenzar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Toolbar */}
          <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
            <p className="text-xs text-slate-500 font-medium">
              Mostrando <span className="font-bold text-slate-800">{pagedCategories.length}</span> de <span className="font-bold text-slate-800">{categories.length}</span> categorías
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  type="button"
                  className="px-3 py-1.5 bg-[#003366]/10 hover:bg-[#003366]/20 text-[#003366] text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  Anterior
                </button>
                <span className="text-xs text-slate-500 font-bold px-2">
                  Pág. {page} de {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  type="button"
                  className="px-3 py-1.5 bg-[#003366]/10 hover:bg-[#003366]/20 text-[#003366] text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl w-full max-w-md shadow-2xl flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-outline-variant/20">
              <h2 className="font-display-sm text-2xl text-primary font-bold">{editId ? 'Editar Categoría' : 'Nueva Categoría'}</h2>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-primary p-2 rounded-full hover:bg-surface-container">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-primary mb-1">Nombre</label>
                <input 
                  type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-primary mb-1">Descripción</label>
                <textarea 
                  rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-primary mb-1">Estado</label>
                <select 
                  value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}
                  className="w-full bg-surface-container-highest border border-outline rounded-lg px-4 py-2 text-primary focus:border-[#c5a059] outline-none"
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 font-bold border border-rose-200 transition-colors">
                  <X className="w-4 h-4" />
                  Cancelar
                </button>
                <button type="submit" disabled={submitting} className="bg-[#003366] text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md hover:bg-[#002244] hover:-translate-y-0.5 transition-all">
                  {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {editId ? 'Guardar Cambios' : 'Registrar Categoría'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
