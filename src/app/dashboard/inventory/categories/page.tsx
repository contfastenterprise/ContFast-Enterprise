'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Tag, RefreshCw, X, Save, Printer } from 'lucide-react';
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
  
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'active'
  });

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
            className="bg-white border border-outline-variant/50 hover:bg-surface-container-low text-primary px-4 py-3 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 font-bold text-sm shadow-sm"
          >
            <Printer className="h-5 w-5" /> Imprimir
          </button>
          <button
            onClick={openNewModal}
            className="bg-primary text-on-primary px-6 py-3 rounded-2xl flex items-center justify-center gap-2 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-95 flex-1 md:flex-none"
          >
            <Plus className="h-5 w-5" />
            <span className="font-label-md font-bold text-sm">Nueva Categoría</span>
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

      <div className="bg-white rounded-3xl border border-outline-variant/30 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center text-primary">
            <RefreshCw className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container border-b border-outline-variant/20">
                  <th className="px-6 py-4 font-label-md text-xs font-bold text-on-surface-variant uppercase tracking-wider">Nombre</th>
                  <th className="px-6 py-4 font-label-md text-xs font-bold text-on-surface-variant uppercase tracking-wider">Descripción</th>
                  <th className="px-6 py-4 font-label-md text-xs font-bold text-on-surface-variant uppercase tracking-wider w-24">Estado</th>
                  <th className="px-6 py-4 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id} className="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors">
                    <td className="px-6 py-4 font-bold text-primary">{cat.name}</td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant/80">{cat.description || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-bold rounded-lg ${cat.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {cat.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEditModal(cat)} className="p-2 text-primary hover:bg-primary/10 rounded-lg">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(cat.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-on-surface-variant">
                      No hay categorías registradas. Crea una nueva para comenzar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 rounded-xl text-primary font-bold hover:bg-surface-container">Cancelar</button>
                <button type="submit" disabled={submitting} className="bg-primary text-on-primary px-6 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-primary/90">
                  {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editId ? 'Actualizar' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
