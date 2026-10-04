'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Pencil, Trash2, ToggleLeft, ToggleRight, ShieldAlert, Percent, Globe, Building2 } from 'lucide-react';
import { PestanasDeRegistro, PanelDeRegistro } from '@/components/ui/pestanas-de-registro';
import { toast } from 'sonner';
import clsx from 'clsx';
import { useRbac } from '@/components/providers/rbacContext';
import { leerRespuesta } from '@/utils/leerRespuesta';

import { Button, IconButton } from '@/components/ui/button';
import { CabeceraDePagina } from '@/components/ui/cabecera-de-pagina';
import { Modal } from '@/components/ui/dialog';
interface Retention {
  id: string;
  name: string;
  type: 'ITBIS' | 'ISR' | 'OTRA';
  percentage: string;
  active: boolean;
  companyId: string | null;
}

const TYPE_LABELS = { ITBIS: 'ITBIS', ISR: 'ISR', OTRA: 'Otra' };
const TYPE_COLORS = {
  ITBIS: 'bg-blue-100 text-blue-700 border-blue-200',
  ISR:   'bg-purple-100 text-purple-700 border-purple-200',
  OTRA:  'bg-slate-100 text-slate-600 border-slate-200',
};

const emptyForm = { name: '', type: 'ISR' as 'ITBIS' | 'ISR' | 'OTRA', percentage: '' };

export default function RetentionsPage() {
  const h = useRetenciones();
  const { loading, submitting, showModal, setShowModal, editing, form, setForm, deleteTarget, setDeleteTarget, rbacLoading, hasAccess, openCreate, openEdit, handleSubmit, toggleActive, confirmDelete, grouped } = h;
  // Role guard — show access denied
  if (rbacLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-[#003366] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-[#003366] mb-2">Acceso Restringido</h2>
        <p className="text-slate-500 text-sm max-w-md">
          Necesitas permiso de lectura sobre <strong>Contabilidad</strong> para gestionar las retenciones fiscales.
        </p>
        <Link href="/dashboard" className="mt-6 text-sm font-semibold text-[#003366] hover:underline">← Volver al inicio</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <CabeceraDePagina
        titulo="Retenciones Fiscales"
        descripcion="Gestiona los tipos de retenciones ISR e ITBIS aplicables en facturas."
        icono={<Percent />}
        acciones={
          /* Lote 248: en la cabecera, SOLO las pestanas (como en Compras). */
          <PestanasDeRegistro
            enFormulario={showModal}
            lista="Retenciones"
            editando={!!editing}
            alVerLista={() => setShowModal(false)}
            alRegistrar={openCreate}
          />
        }
      />

      {!showModal && (<>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-slate-400" /> Global del sistema (solo activar/desactivar)</span>
        <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-[#003366]" /> Tu empresa (editable y eliminable)</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(['ISR', 'ITBIS', 'OTRA'] as const).map(type => (
            <div key={type} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className={clsx('px-4 py-2.5 border-b border-slate-200 flex items-center justify-between', {
                'bg-purple-50': type === 'ISR',
                'bg-blue-50': type === 'ITBIS',
                'bg-slate-50': type === 'OTRA',
              })}>
                <span className={clsx('text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border', TYPE_COLORS[type])}>
                  {TYPE_LABELS[type]}
                </span>
                <span className="text-xs text-slate-400">{grouped[type].length} tipo{grouped[type].length !== 1 ? 's' : ''}</span>
              </div>

              <div className="divide-y divide-slate-100">
                {grouped[type].length === 0 && (
                  <p className="text-center text-xs text-slate-400 py-8">Sin retenciones de este tipo</p>
                )}
                {grouped[type].map(r => (
                  <div key={r.id} className={clsx('px-4 py-2.5 text-xs flex items-center justify-between gap-2 transition-colors', r.active ? '' : 'opacity-50 bg-slate-50')}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {r.companyId ? (
                          <Building2 className="w-3 h-3 text-[#003366] shrink-0" />
                        ) : (
                          <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                        )}
                        <p className="font-semibold text-[#003366] truncate">{r.name}</p>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <Percent className="w-3 h-3" />
                        {parseFloat(r.percentage).toFixed(2)}%
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Toggle active */}
                      <button
                        type="button"
                        onClick={() => toggleActive(r)}
                        title={r.active ? 'Desactivar' : 'Activar'}
                        aria-label={`${r.active ? 'Desactivar' : 'Activar'} la retención ${r.name}`}
                        className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
                      >
                        {r.active
                          ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                          : <ToggleLeft className="w-5 h-5 text-slate-400" />
                        }
                      </button>
                      {/* Edit — only company */}
                      {r.companyId && (
                        <IconButton
                          type="button"
                          onClick={() => openEdit(r)}
                          title="Editar"
                          aria-label={`Editar la retención ${r.name}`}
                          className="hover:text-[#003366] hover:bg-[#003366]/10"
                        >
                          <Pencil className="w-4 h-4" />
                        </IconButton>
                      )}
                      {/* Delete — only company */}
                      {r.companyId && (
                        <IconButton
                          type="button"
                          onClick={() => setDeleteTarget(r)}
                          title="Eliminar"
                          aria-label={`Eliminar la retención ${r.name}`}
                          className="hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info card */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm text-amber-800">
        <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
        <div>
          <p className="font-semibold">¿Cómo se usan estas retenciones?</p>
          <p className="mt-0.5 text-amber-700">Al crear una factura, activa el módulo de retenciones y selecciona los tipos aplicables. Los montos se calculan automáticamente y se reflejan en el PDF, el modal de detalle y el reporte 607 de la DGII.</p>
        </div>
      </div>
      </>)}

      {/* Registrar / editar: era un modal; desde el lote 248 es la segunda pestana. */}
      {showModal && (
        <PanelDeRegistro titulo={editing ? 'Editar Retención' : 'Nueva Retención'}>
          <div className="max-w-md space-y-5">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="ret-nombre" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nombre</label>
              <input
                id="ret-nombre"
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: ISR Servicios Profesionales"
                className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-[#003366] focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="ret-tipo" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tipo</label>
              <select
                id="ret-tipo"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-[#003366] focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition"
              >
                <option value="ISR">ISR — Impuesto Sobre la Renta</option>
                <option value="ITBIS">ITBIS — Impuesto Transferencias</option>
                <option value="OTRA">Otra retención</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="ret-porcentaje" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Porcentaje (%)</label>
              <div className="relative">
                <input
                  id="ret-porcentaje"
                  type="number"
                  value={form.percentage}
                  onChange={e => setForm(f => ({ ...f, percentage: e.target.value }))}
                  placeholder="Ej: 10"
                  min={0.01} max={100} step="any"
                  className="w-full h-8 px-3 py-1.5 pr-10 text-xs rounded-lg border border-slate-200 bg-slate-50 text-[#003366] focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition"
                />
                <Percent className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary"
              type="button"
              onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}>
              {submitting ? 'Guardando…' : editing ? 'Guardar Cambios' : 'Crear Retención'}
            </Button>
          </div>
          </div>
        </PanelDeRegistro>
      )}

      {/* Delete Confirm Modal */}
      {/* Lote 279: la ventana comun (`Modal`). El fondo ya cerraba (por defecto). */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth="sm"
        icono={<Trash2 />}
        title="Eliminar retención"
        description="Esta acción no se puede deshacer."
      >
        {deleteTarget && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-3">
                ¿Eliminar <strong>{deleteTarget.name}</strong> ({parseFloat(deleteTarget.percentage).toFixed(2)}%)?
              </p>
              <div className="flex gap-3">
                <Button variant="secondary"
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1">
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={confirmDelete}
                  className="flex-1"
                >
                  Sí, eliminar
                </Button>
              </div>
            </div>
        )}
      </Modal>
    </div>
  );
}

/** El estado y las acciones de la pagina, movidos TAL CUAL desde el componente. */
function useRetenciones() {
  const [retentions, setRetentions] = useState<Retention[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Retention | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Retention | null>(null);
  const { loading: rbacLoading, hasPermission } = useRbac();

  // Auditoria P0-02 (2026-09-03), extendida al frontend (2026-09-07): antes
  // .includes('sistema'|'admin'|'conta'|'auditor'), que concedia acceso a
  // cualquier rol cuyo NOMBRE contuviera esas letras -- un rol creado de buena
  // fe como "Contacto de clientes" entraba por 'conta'. Ahora se pregunta por
  // el PERMISO real en vez de por el nombre del rol: hasPermission ya concede
  // acceso total a sistemas y administracion, cubre contabilidad, y respeta
  // cualquier rol al que se le haya otorgado contabilidad:read en la base de
  // datos (que antes quedaba fuera si su nombre no contenia esas letras).
  const hasAccess = hasPermission('contabilidad', 'read');

  //  Lote 252: el estado se mira ANTES de leer el cuerpo (`leerRespuesta`). Antes, un 403 o un
  //  500 dejaban la lista vacia sin decir nada: se leia como "sin retenciones".
  const fetchRetentions = useCallback(async () => {
    try {
      setLoading(true);
      const leido = await leerRespuesta<{ data: Retention[] }>(await fetch('/api/v1/retentions'));
      if (leido.bien) setRetentions(leido.cuerpo.data);
      else toast.error(leido.mensaje || 'No se pudieron cargar las retenciones.');
    } catch {
      toast.error('Error al cargar retenciones');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (hasAccess) fetchRetentions(); }, [hasAccess, fetchRetentions]);

  //  Dos clics seguidos en "Si, eliminar" llegan antes de volver a pintar: la guarda es un ref.
  const borrando = useRef(false);


  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (r: Retention) => {
    if (!r.companyId) {
      toast.warning('Las retenciones globales del sistema no se pueden editar.', { description: 'Solo puedes activarlas o desactivarlas.' });
      return;
    }
    setEditing(r);
    setForm({ name: r.name, type: r.type, percentage: r.percentage });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.percentage) {
      toast.error('Completa todos los campos');
      return;
    }
    const pct = parseFloat(form.percentage);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      toast.error('El porcentaje debe ser entre 0.01 y 100');
      return;
    }

    setSubmitting(true);
    try {
      const url = editing ? `/api/v1/retentions/${editing.id}` : '/api/v1/retentions';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), type: form.type, percentage: pct }),
      });
      const leido = await leerRespuesta(res);
      if (!leido.bien) throw new Error(leido.mensaje || 'No se pudo guardar la retención.');
      toast.success(editing ? 'Retención actualizada' : 'Retención creada');
      setShowModal(false);
      fetchRetentions();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (r: Retention) => {
    try {
      const res = await fetch(`/api/v1/retentions/${r.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !r.active }),
      });
      const leido = await leerRespuesta(res);
      if (!leido.bien) throw new Error(leido.mensaje || 'No se pudo cambiar la retención.');
      toast.success(r.active ? 'Retención desactivada' : 'Retención activada');
      fetchRetentions();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || borrando.current) return;
    borrando.current = true;
    try {
      const res = await fetch(`/api/v1/retentions/${deleteTarget.id}`, { method: 'DELETE' });
      const leido = await leerRespuesta(res);
      if (!leido.bien) throw new Error(leido.mensaje || 'No se pudo eliminar la retención.');
      toast.success('Retención eliminada');
      setDeleteTarget(null);
      fetchRetentions();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      borrando.current = false;
    }
  };

  const grouped = {
    ISR:   retentions.filter(r => r.type === 'ISR'),
    ITBIS: retentions.filter(r => r.type === 'ITBIS'),
    OTRA:  retentions.filter(r => r.type === 'OTRA'),
  };

  return { retentions, setRetentions, loading, setLoading, submitting, setSubmitting, showModal, setShowModal, editing, setEditing, form, setForm, deleteTarget, setDeleteTarget, rbacLoading, hasPermission, hasAccess, fetchRetentions, borrando, openCreate, openEdit, handleSubmit, toggleActive, confirmDelete, grouped };
}

type EstadoRetentionsPage = ReturnType<typeof useRetenciones>;

