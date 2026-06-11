'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Tag, RefreshCw, X, Save } from 'lucide-react';
import { toast } from 'sonner';

interface Category {
  id: string;
  name: string;
  description: string | null;
  status: string;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'active'
  });

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/categories');
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
  }, []);

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
        <button
          onClick={openNewModal}
          className="bg-primary text-on-primary px-6 py-3 rounded-2xl flex items-center gap-2 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-95"
        >
          <Plus className="h-5 w-5" />
          <span className="font-label-md font-bold text-sm">Nueva Categoría</span>
        </button>
      </header>

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
