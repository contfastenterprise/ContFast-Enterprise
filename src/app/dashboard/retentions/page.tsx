'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ShieldAlert, Percent, Globe, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';

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
  const [retentions, setRetentions] = useState<Retention[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Retention | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Retention | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  // Fetch current user for role guard
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/me');
        const data = await res.json();
        if (data.success && data.data?.user) setCurrentUser(data.data.user);
      } catch { /* noop */ } finally {
        setAuthLoaded(true);
      }
    })();
  }, []);

  const userRole = (currentUser?.role || currentUser?.roleName || '').toLowerCase();
  const hasAccess = userRole.includes('sistema') || userRole.includes('admin') || userRole.includes('conta') || userRole.includes('auditor');

  const fetchRetentions = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/retentions');
      const data = await res.json();
      if (data.success) setRetentions(data.data);
    } catch {
      toast.error('Error al cargar retenciones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (hasAccess) fetchRetentions(); }, [hasAccess]);

  // Role guard — show access denied
  if (!authLoaded) {
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
          Solo los roles de <strong>Administración</strong>, <strong>Sistemas</strong> y <strong>Contabilidad</strong> pueden gestionar las retenciones fiscales.
        </p>
        <a href="/dashboard" className="mt-6 text-sm font-semibold text-[#003366] hover:underline">← Volver al inicio</a>
      </div>
    );
  }

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
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Error desconocido');
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
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message);
      toast.success(r.active ? 'Retención desactivada' : 'Retención activada');
      fetchRetentions();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/v1/retentions/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message);
      toast.success('Retención eliminada');
      setDeleteTarget(null);
      fetchRetentions();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const grouped = {
    ISR:   retentions.filter(r => r.type === 'ISR'),
    ITBIS: retentions.filter(r => r.type === 'ITBIS'),
    OTRA:  retentions.filter(r => r.type === 'OTRA'),
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#003366]">Retenciones Fiscales</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestiona los tipos de retenciones ISR e ITBIS aplicables en facturas.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-[#003366] hover:bg-[#004080] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md hover:shadow-lg"
        >
          <Plus className="w-4 h-4" /> Nueva Retención
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-slate-400" /> Global del sistema (solo activar/desactivar)</span>
        <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-[#003366]" /> Tu empresa (editable y eliminable)</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(['ISR', 'ITBIS', 'OTRA'] as const).map(type => (
            <div key={type} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className={clsx('px-5 py-3 border-b border-slate-100 flex items-center justify-between', {
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
                  <div key={r.id} className={clsx('px-4 py-3 flex items-center justify-between gap-2 transition-colors', r.active ? '' : 'opacity-50 bg-slate-50')}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {r.companyId ? (
                          <Building2 className="w-3 h-3 text-[#003366] shrink-0" />
                        ) : (
                          <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                        )}
                        <p className="text-sm font-semibold text-[#003366] truncate">{r.name}</p>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <Percent className="w-3 h-3" />
                        {parseFloat(r.percentage).toFixed(2)}%
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Toggle active */}
                      <button
                        onClick={() => toggleActive(r)}
                        title={r.active ? 'Desactivar' : 'Activar'}
                        className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
                      >
                        {r.active
                          ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                          : <ToggleLeft className="w-5 h-5 text-slate-400" />
                        }
                      </button>
                      {/* Edit — only company */}
                      {r.companyId && (
                        <button
                          onClick={() => openEdit(r)}
                          title="Editar"
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-[#003366] transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {/* Delete — only company */}
                      {r.companyId && (
                        <button
                          onClick={() => setDeleteTarget(r)}
                          title="Eliminar"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5"
            >
              <h2 className="text-lg font-bold text-[#003366]">
                {editing ? 'Editar Retención' : 'Nueva Retención'}
              </h2>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: ISR Servicios Profesionales"
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Tipo</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-[#003366] focus:border-[#C5A059] outline-none transition-all bg-white"
                  >
                    <option value="ISR">ISR — Impuesto Sobre la Renta</option>
                    <option value="ITBIS">ITBIS — Impuesto Transferencias</option>
                    <option value="OTRA">Otra retención</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Porcentaje (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={form.percentage}
                      onChange={e => setForm(f => ({ ...f, percentage: e.target.value }))}
                      placeholder="Ej: 10"
                      min={0.01} max={100} step="any"
                      className="w-full border border-slate-300 rounded-xl px-4 py-2.5 pr-10 text-sm text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none transition-all"
                    />
                    <Percent className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-slate-300 text-slate-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 bg-[#003366] hover:bg-[#004080] text-white text-sm font-semibold py-2.5 rounded-xl transition-all disabled:opacity-60"
                >
                  {submitting ? 'Guardando…' : editing ? 'Guardar Cambios' : 'Crear Retención'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirm Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setDeleteTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-bold text-[#003366]">Eliminar retención</h3>
                  <p className="text-sm text-slate-500">Esta acción no se puede deshacer.</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-3">
                ¿Eliminar <strong>{deleteTarget.name}</strong> ({parseFloat(deleteTarget.percentage).toFixed(2)}%)?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 border border-slate-300 text-slate-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-2.5 rounded-xl transition-all"
                >
                  Sí, eliminar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
