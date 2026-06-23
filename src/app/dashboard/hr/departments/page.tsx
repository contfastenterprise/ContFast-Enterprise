'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Building2, Briefcase, Plus, Edit2, Trash2, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showPosModal, setShowPosModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [deptForm, setDeptForm] = useState({ name: '', description: '' });
  const [posForm, setPosForm] = useState({ name: '', description: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const dRes = await fetch('/api/v1/hr/departments');
      const dData = await dRes.json();
      if (dData.success) setDepartments(dData.data);

      const pRes = await fetch('/api/v1/hr/positions');
      const pData = await pRes.json();
      if (pData.success) setPositions(pData.data);
    } catch (e) {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  // Department CRUD handlers
  const handleOpenDeptCreate = () => {
    setEditId(null);
    setDeptForm({ name: '', description: '' });
    setShowDeptModal(true);
  };

  const handleOpenDeptEdit = (dept: any) => {
    setEditId(dept.id);
    setDeptForm({ name: dept.name, description: dept.description || '' });
    setShowDeptModal(true);
  };

  const handleDeptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editId ? `/api/v1/hr/departments?id=${editId}` : '/api/v1/hr/departments';
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deptForm)
      });
      const data = await res.json();
      if (data.success) {
        toast.success(editId ? 'Departamento actualizado' : 'Departamento creado');
        setShowDeptModal(false);
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error');
      }
    } catch (err) {
      toast.error('Error al guardar');
    }
  };

  const handleDeptDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este departamento?')) return;
    try {
      const res = await fetch(`/api/v1/hr/departments?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Departamento eliminado');
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error');
      }
    } catch (e) {
      toast.error('Error al eliminar');
    }
  };

  // Position CRUD handlers
  const handleOpenPosCreate = () => {
    setEditId(null);
    setPosForm({ name: '', description: '' });
    setShowPosModal(true);
  };

  const handleOpenPosEdit = (pos: any) => {
    setEditId(pos.id);
    setPosForm({ name: pos.name, description: pos.description || '' });
    setShowPosModal(true);
  };

  const handlePosSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editId ? `/api/v1/hr/positions?id=${editId}` : '/api/v1/hr/positions';
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(posForm)
      });
      const data = await res.json();
      if (data.success) {
        toast.success(editId ? 'Puesto actualizado' : 'Puesto creado');
        setShowPosModal(false);
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error');
      }
    } catch (err) {
      toast.error('Error al guardar');
    }
  };

  const handlePosDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este puesto?')) return;
    try {
      const res = await fetch(`/api/v1/hr/positions?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Puesto eliminado');
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error');
      }
    } catch (e) {
      toast.error('Error al eliminar');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-on-surface flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" /> Departamentos y Puestos
            </h1>
            <p className="text-sm text-on-surface-variant/80">
              Estructura organizativa y cargos funcionales del personal.
            </p>
          </div>
          <button
            onClick={fetchData}
            className="p-2 border border-outline hover:bg-surface-variant rounded-lg transition-all text-on-surface self-start md:self-auto"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex h-[40vh] items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Departments Section */}
            <div className="bg-surface rounded-xl border border-outline p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-outline pb-3">
                <h3 className="font-semibold text-on-surface flex items-center gap-1.5 text-sm uppercase">
                  <Building2 className="h-4.5 w-4.5 text-primary" /> Departamentos ({departments.length})
                </h3>
                <button
                  onClick={handleOpenDeptCreate}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary hover:bg-primary-variant text-on-primary rounded-lg transition-all"
                >
                  <Plus className="h-3.5 w-3.5" /> Agregar
                </button>
              </div>

              {departments.length === 0 ? (
                <p className="text-xs text-on-surface-variant/70 text-center py-6">No hay departamentos agregados.</p>
              ) : (
                <div className="space-y-3.5">
                  {departments.map(d => (
                    <div key={d.id} className="flex justify-between items-start bg-surface-variant/10 p-3 rounded-lg border border-outline/30">
                      <div>
                        <h4 className="text-sm font-semibold text-on-surface">{d.name}</h4>
                        <p className="text-xs text-on-surface-variant/85 mt-0.5">{d.description || 'Sin descripción'}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0 ml-4">
                        <button
                          onClick={() => handleOpenDeptEdit(d)}
                          className="p-1 hover:bg-surface-variant rounded text-on-surface"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeptDelete(d.id)}
                          className="p-1 hover:bg-red-500/10 text-red-500 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Positions Section */}
            <div className="bg-surface rounded-xl border border-outline p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-outline pb-3">
                <h3 className="font-semibold text-on-surface flex items-center gap-1.5 text-sm uppercase">
                  <Briefcase className="h-4.5 w-4.5 text-primary" /> Cargos / Puestos ({positions.length})
                </h3>
                <button
                  onClick={handleOpenPosCreate}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary hover:bg-primary-variant text-on-primary rounded-lg transition-all"
                >
                  <Plus className="h-3.5 w-3.5" /> Agregar
                </button>
              </div>

              {positions.length === 0 ? (
                <p className="text-xs text-on-surface-variant/70 text-center py-6">No hay puestos agregados.</p>
              ) : (
                <div className="space-y-3.5">
                  {positions.map(p => (
                    <div key={p.id} className="flex justify-between items-start bg-surface-variant/10 p-3 rounded-lg border border-outline/30">
                      <div>
                        <h4 className="text-sm font-semibold text-on-surface">{p.name}</h4>
                        <p className="text-xs text-on-surface-variant/85 mt-0.5">{p.description || 'Sin descripción'}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0 ml-4">
                        <button
                          onClick={() => handleOpenPosEdit(p)}
                          className="p-1 hover:bg-surface-variant rounded text-on-surface"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handlePosDelete(p.id)}
                          className="p-1 hover:bg-red-500/10 text-red-500 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dept Modal */}
        {showDeptModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-surface border border-outline rounded-xl w-full max-w-md shadow-2xl p-5 relative">
              <button
                onClick={() => setShowDeptModal(false)}
                className="absolute right-4 top-4 text-on-surface-variant hover:bg-surface-variant p-1 rounded-full transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
              <h3 className="font-bold text-on-surface text-base mb-4 flex items-center gap-1.5">
                <Building2 className="h-5 w-5 text-primary" /> {editId ? 'Editar Departamento' : 'Nuevo Departamento'}
              </h3>
              <form onSubmit={handleDeptSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Nombre Departamento</label>
                  <input
                    type="text"
                    required
                    value={deptForm.name}
                    onChange={e => setDeptForm({ ...deptForm, name: e.target.value })}
                    className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Descripción (Opcional)</label>
                  <textarea
                    rows={3}
                    value={deptForm.description}
                    onChange={e => setDeptForm({ ...deptForm, description: e.target.value })}
                    className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                  />
                </div>
                <div className="flex justify-end gap-3.5 pt-2 border-t border-outline/30">
                  <button
                    type="button"
                    onClick={() => setShowDeptModal(false)}
                    className="px-4 py-2 text-xs font-semibold border border-outline rounded-lg text-on-surface hover:bg-surface-variant"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold bg-primary hover:bg-primary-variant text-on-primary rounded-lg"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Pos Modal */}
        {showPosModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-surface border border-outline rounded-xl w-full max-w-md shadow-2xl p-5 relative">
              <button
                onClick={() => setShowPosModal(false)}
                className="absolute right-4 top-4 text-on-surface-variant hover:bg-surface-variant p-1 rounded-full transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
              <h3 className="font-bold text-on-surface text-base mb-4 flex items-center gap-1.5">
                <Briefcase className="h-5 w-5 text-primary" /> {editId ? 'Editar Puesto' : 'Nuevo Puesto'}
              </h3>
              <form onSubmit={handlePosSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Nombre del Cargo/Puesto</label>
                  <input
                    type="text"
                    required
                    value={posForm.name}
                    onChange={e => setPosForm({ ...posForm, name: e.target.value })}
                    className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant">Descripción (Opcional)</label>
                  <textarea
                    rows={3}
                    value={posForm.description}
                    onChange={e => setPosForm({ ...posForm, description: e.target.value })}
                    className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                  />
                </div>
                <div className="flex justify-end gap-3.5 pt-2 border-t border-outline/30">
                  <button
                    type="button"
                    onClick={() => setShowPosModal(false)}
                    className="px-4 py-2 text-xs font-semibold border border-outline rounded-lg text-on-surface hover:bg-surface-variant"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold bg-primary hover:bg-primary-variant text-on-primary rounded-lg"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
