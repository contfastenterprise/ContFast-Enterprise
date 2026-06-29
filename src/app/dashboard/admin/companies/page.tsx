'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Shield, Plus, RefreshCw, X, Building2, Trash2, CreditCard, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';

interface Company {
  id: string;
  name: string;
  rnc: string;
  email: string | null;
  businessActivity: string | null;
  status: string;
  createdAt: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  currentPeriodEnd?: string;
  planId?: string;
  planName?: string;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  maxEcfLimit: number;
}

export default function AdminCompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showNewCompanyModal, setShowNewCompanyModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const [companyForm, setCompanyForm] = useState({
    name: '',
    rnc: '',
    email: '',
    businessActivity: '',
    address: ''
  });

  const [subForm, setSubForm] = useState({
    planId: '',
    status: 'active',
    currentPeriodEnd: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [compRes, plansRes] = await Promise.all([
        fetch('/api/v1/admin/companies'),
        fetch('/api/v1/admin/plans')
      ]);

      if (compRes.status === 403) {
         toast.error('Acceso denegado. Solo el rol sistemas puede ver esto.');
         router.push('/dashboard');
         return;
      }
      
      const compData = await compRes.json();
      if (compData.success) {
        setCompanies(compData.data);
      } else {
        toast.error(compData.error?.message || 'Error al cargar empresas');
      }

      if (plansRes.ok) {
        const plansData = await plansRes.json();
        if (plansData.success) {
          setPlans(plansData.data);
        }
      }
    } catch (err) {
      toast.error('Error al cargar datos administrativos');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(companyForm)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Empresa creada exitosamente');
        setShowNewCompanyModal(false);
        fetchData();
        setCompanyForm({ name: '', rnc: '', email: '', businessActivity: '', address: '' });
      } else {
        toast.error(data.error?.message || 'Error al crear empresa');
      }
    } catch (error) {
      toast.error('Error de red al crear empresa');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCompany = async (id: string) => {
    if (!confirm('¿Está seguro de desactivar esta empresa? Esta acción deshabilitará el acceso de sus usuarios.')) return;
    try {
      const res = await fetch(`/api/v1/admin/companies/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Empresa desactivada');
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al eliminar empresa');
      }
    } catch (error) {
      toast.error('Error de red al eliminar empresa');
    }
  };

  const handleOpenSubscriptionModal = (company: Company) => {
    setSelectedCompany(company);
    setSubForm({
      planId: company.planId || '',
      status: company.subscriptionStatus || 'active',
      currentPeriodEnd: company.currentPeriodEnd ? company.currentPeriodEnd.split('T')[0] : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
    setShowSubscriptionModal(true);
  };

  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    setSubmitting(true);

    try {
      const startIso = new Date().toISOString();
      const endIso = new Date(subForm.currentPeriodEnd + 'T23:59:59.999Z').toISOString();

      let res;
      if (selectedCompany.subscriptionId) {
        // Update subscription
        res = await fetch(`/api/v1/admin/subscriptions/${selectedCompany.subscriptionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: subForm.planId,
            status: subForm.status,
            currentPeriodEnd: endIso
          })
        });
      } else {
        // Create new subscription
        res = await fetch('/api/v1/admin/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: selectedCompany.id,
            planId: subForm.planId,
            status: subForm.status,
            currentPeriodStart: startIso,
            currentPeriodEnd: endIso
          })
        });
      }

      const data = await res.json();
      if (data.success) {
        toast.success('Suscripción SaaS actualizada correctamente');
        setShowSubscriptionModal(false);
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al actualizar suscripción');
      }
    } catch (err) {
      toast.error('Error de red al guardar suscripción');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20 max-w-7xl mx-auto w-full">
      <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-end items-center shadow-inner">
        <span className="text-white text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
          <Shield className="h-3 w-3" /> Sistema &gt; Empresas
        </span>
      </div>

      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-[#003366] flex items-center gap-2">
              Gestión de Empresas (Multi-Tenant)
            </h1>
            <p className="text-on-surface-variant/70 text-sm mt-1">
              Controla las empresas instaladas en el servidor y sus suscripciones SaaS.
            </p>
          </div>
          <button onClick={() => setShowNewCompanyModal(true)} className="bg-[#003366] hover:bg-[#002244] text-white font-bold py-2.5 px-6 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm justify-center">
            <Plus className="h-4 w-4" /> Nueva Empresa
          </button>
        </div>

        {/* Listado */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h2 className="font-bold text-[#003366] flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Empresas Registradas
            </h2>
            <button onClick={fetchData} className="p-2 hover:bg-slate-200 rounded-lg transition-colors" title="Actualizar">
              <RefreshCw className={clsx("h-4 w-4 text-slate-500", loading && "animate-spin")} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#003366] text-white">
                <tr>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wider">Empresa</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wider">RNC</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wider">Plan Activo</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companies.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      {loading ? 'Cargando...' : 'No hay empresas registradas.'}
                    </td>
                  </tr>
                ) : (
                  companies.map(company => (
                    <tr key={company.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{company.name}</div>
                        {company.email && <div className="text-xs text-slate-600 mt-0.5">{company.email}</div>}
                        <div className="text-xs text-slate-500 font-mono mt-0.5">{company.id}</div>
                      </td>
                      <td className="px-6 py-4 font-mono">{company.rnc}</td>
                      <td className="px-6 py-4">
                        {company.planName ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-[#003366] text-xs">
                              {company.planName}
                            </span>
                            {company.currentPeriodEnd && (
                              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                <Calendar className="h-3 w-3" /> Vence: {new Date(company.currentPeriodEnd).toLocaleDateString('es-DO')}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-xs">Ninguno asignado</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={clsx(
                            "px-2 py-0.5 rounded-md text-[10px] font-bold inline-block w-fit text-center",
                            company.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          )}>
                            Empresa: {company.status === 'active' ? 'Activa' : 'Inactiva'}
                          </span>
                          {company.planName && (
                            <span className={clsx(
                              "px-2 py-0.5 rounded-md text-[10px] font-bold inline-block w-fit text-center",
                              company.subscriptionStatus === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            )}>
                              SaaS: {company.subscriptionStatus === 'active' ? 'Activa' : 'Expirada'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end items-center gap-2">
                          <button
                            onClick={() => handleOpenSubscriptionModal(company)}
                            className="p-1.5 hover:bg-[#003366]/10 text-[#003366] rounded transition-colors"
                            title="Gestionar Suscripción SaaS"
                          >
                            <CreditCard className="h-4 w-4" />
                          </button>
                          {company.status === 'active' && (
                            <button
                              onClick={() => handleDeleteCompany(company.id)}
                              className="p-1.5 hover:bg-red-100 text-red-600 rounded transition-colors"
                              title="Desactivar Empresa"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Modal: Crear Empresa */}
      {showNewCompanyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-[#003366] flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#C5A059]" /> Registrar Empresa
              </h2>
              <button onClick={() => setShowNewCompanyModal(false)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateCompany} className="p-5 space-y-4">
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-xs text-blue-800 mb-4">
                <strong>Nota:</strong> Al crear una empresa se generará automáticamente su configuración por defecto y el rol de <em>administracion</em>. Tendrás que crear o asignar usuarios a esta empresa manualmente luego.
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Comercial <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={companyForm.name}
                  onChange={e => setCompanyForm({...companyForm, name: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition-all"
                  placeholder="Ej. Mi Empresa S.R.L."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">RNC <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  minLength={9}
                  maxLength={11}
                  value={companyForm.rnc}
                  onChange={e => setCompanyForm({...companyForm, rnc: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition-all font-mono"
                  placeholder="Ej. 101001001"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Correo Electrónico <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  required
                  value={companyForm.email}
                  onChange={e => setCompanyForm({...companyForm, email: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition-all"
                  placeholder="Ej. contacto@empresa.com"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Actividad Comercial</label>
                <input
                  type="text"
                  value={companyForm.businessActivity}
                  onChange={e => setCompanyForm({...companyForm, businessActivity: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition-all"
                  placeholder="Ej. Venta al por menor..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Dirección</label>
                <textarea
                  value={companyForm.address}
                  onChange={e => setCompanyForm({...companyForm, address: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition-all resize-none"
                  rows={2}
                  placeholder="Dirección física..."
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewCompanyModal(false)}
                  className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-[#003366] hover:bg-[#002244] text-white rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <><RefreshCw className="h-4 w-4 animate-spin" /> Guardando...</>
                  ) : (
                    'Guardar Empresa'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Gestionar Suscripción */}
      {showSubscriptionModal && selectedCompany && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-[#003366] flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[#C5A059]" /> Suscripción SaaS
              </h2>
              <button onClick={() => setShowSubscriptionModal(false)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveSubscription} className="p-5 space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs mb-2">
                <p className="font-bold text-slate-700">Compañía:</p>
                <p className="text-slate-900 font-medium text-sm mt-0.5">{selectedCompany.name}</p>
                <p className="text-slate-500 font-mono mt-0.5">RNC: {selectedCompany.rnc}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Seleccionar Plan <span className="text-red-500">*</span></label>
                <select
                  required
                  value={subForm.planId}
                  onChange={e => setSubForm({...subForm, planId: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition-all"
                >
                  <option value="">-- Elija un plan comercial --</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} - ${parseFloat(p.price).toLocaleString()} / mes ({p.maxEcfLimit === -1 ? 'e-CF Ilimitados' : `${p.maxEcfLimit} e-CF/mes`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Estado de Suscripción <span className="text-red-500">*</span></label>
                <select
                  required
                  value={subForm.status}
                  onChange={e => setSubForm({...subForm, status: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition-all"
                >
                  <option value="active">Activa (Vigente)</option>
                  <option value="past_due">Vencida (Pendiente de Pago)</option>
                  <option value="canceled">Cancelada (Suspendido total)</option>
                  <option value="trialing">Período de Prueba</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Fecha de Próximo Vencimiento <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  required
                  value={subForm.currentPeriodEnd}
                  onChange={e => setSubForm({...subForm, currentPeriodEnd: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition-all font-mono"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSubscriptionModal(false)}
                  className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-[#003366] hover:bg-[#002244] text-white rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <><RefreshCw className="h-4 w-4 animate-spin" /> Guardando...</>
                  ) : (
                    'Guardar Cambios'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
