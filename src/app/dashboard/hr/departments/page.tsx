'use client';

import { useState, useEffect } from 'react';
import { Building2, Briefcase, Plus, Pencil, Trash2, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/providers/confirm-provider';
import { Button, IconButton } from '@/components/ui/button';
import { CabeceraDePagina } from '@/components/ui/cabecera-de-pagina';
import { AccionesDeFormulario } from '@/components/ui/acciones-de-formulario';

export default function DepartmentsPage() {
  const confirm = useConfirm();
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

  async function fetchData() {
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
    if (
      !(await confirm({
        title: 'Eliminar departamento',
        description: 'Esta acción no se puede deshacer.',
        variant: 'destructive',
      }))
    ) return;
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
    if (
      !(await confirm({
        title: 'Eliminar puesto',
        description: 'Esta acción no se puede deshacer.',
        variant: 'destructive',
      }))
    ) return;
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

    <div className="space-y-6">
      {/* Header */}
      <CabeceraDePagina
        titulo="Departamentos y Puestos"
        descripcion="Estructura organizativa y cargos funcionales del personal."
        icono={<Building2 />}
        acciones={<IconButton
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Actualizar"
          onClick={fetchData}
        >
          <RefreshCw className="h-4 w-4" />
        </IconButton>}
      />

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
              <Button
                type="button"
                size="sm"
                onClick={handleOpenDeptCreate}
              >
                <Plus className="h-3.5 w-3.5" /> Agregar
              </Button>
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
                      <IconButton
                        type="button"
                        aria-label="Editar departamento"
                        onClick={() => handleOpenDeptEdit(d)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        type="button"
                        aria-label="Eliminar departamento"
                        className="text-red-500 hover:bg-red-500/10 hover:text-red-600"
                        onClick={() => handleDeptDelete(d.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
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
              <Button
                type="button"
                size="sm"
                onClick={handleOpenPosCreate}
              >
                <Plus className="h-3.5 w-3.5" /> Agregar
              </Button>
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
                      <IconButton
                        type="button"
                        aria-label="Editar puesto"
                        onClick={() => handleOpenPosEdit(p)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        type="button"
                        aria-label="Eliminar puesto"
                        className="text-red-500 hover:bg-red-500/10 hover:text-red-600"
                        onClick={() => handlePosDelete(p.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
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
            <IconButton
              type="button"
              aria-label="Cerrar"
              className="absolute right-4 top-4 rounded-full"
              onClick={() => setShowDeptModal(false)}
            >
              <X className="h-5 w-5" />
            </IconButton>
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
              <AccionesDeFormulario textoPrincipal="Guardar" alCancelar={() => setShowDeptModal(false)} />
            </form>
          </div>
        </div>
      )}

      {/* Pos Modal */}
      {showPosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-outline rounded-xl w-full max-w-md shadow-2xl p-5 relative">
            <IconButton
              type="button"
              aria-label="Cerrar"
              className="absolute right-4 top-4 rounded-full"
              onClick={() => setShowPosModal(false)}
            >
              <X className="h-5 w-5" />
            </IconButton>
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
              <AccionesDeFormulario textoPrincipal="Guardar" alCancelar={() => setShowPosModal(false)} />
            </form>
          </div>
        </div>
      )}
    </div>

  );
}
