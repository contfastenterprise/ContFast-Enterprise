'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw, X, Building2, Trash2, CreditCard, Calendar, Search } from 'lucide-react';
import { PestanasDeRegistro, PanelDeRegistro } from '@/components/ui/pestanas-de-registro';
import { toast } from 'sonner';
import { ErrorDeCarga, motivoDeCarga } from '@/components/ui/estado-carga';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/providers/confirm-provider';
import { formatDateDisplay } from '@/utils/fechasLocales';
import { leerRespuesta } from '@/utils/leerRespuesta';
import { Button, IconButton } from '@/components/ui/button';
import { CabeceraDePagina } from '@/components/ui/cabecera-de-pagina';

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
  const h = useEmpresas();
  const { showNewCompanyModal, setShowNewCompanyModal } = h;

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20 max-w-7xl mx-auto w-full">
      <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-end items-center shadow-inner">
        <span className="text-white text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
          <Shield className="h-3 w-3" /> Sistema &gt; Empresas
        </span>
      </div>

      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        {/* Lote 250: en la cabecera, SOLO las pestanas (como en Compras). */}
        <CabeceraDePagina
          titulo="Gestión de Empresas (Multi-Tenant)"
          descripcion="Controla las empresas instaladas en el servidor y sus suscripciones SaaS."
          icono={<Building2 />}
          acciones={<PestanasDeRegistro
            enFormulario={showNewCompanyModal}
            lista="Empresas"
            alVerLista={() => setShowNewCompanyModal(false)}
            alRegistrar={() => setShowNewCompanyModal(true)}
          />}
        />

        {!showNewCompanyModal && (<>
        <ListadoDeEmpresas h={h} />
        </>)}

        <AltaDeEmpresa h={h} />
      </div>

      <VentanaDeSuscripcion h={h} />
    </div>
  );
}

/** El estado y las acciones de la pagina, movidos TAL CUAL desde el componente. */
function useEmpresas() {
  const confirm = useConfirm();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  // P2-37: el fallo de carga NO se limpia solo. Mientras este puesto, la lista
  // enseña el error en vez de su mensaje de vacio.
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCompanies = companies.filter(company => 
    company.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    company.rnc.includes(searchTerm)
  );

  const [showNewCompanyModal, setShowNewCompanyModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clearingSandbox, setClearingSandbox] = useState<string | null>(null);

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

  //  Lote 252: una funcion estable, y el efecto solo la llama.
  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorCarga(null);
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
      
      const empresas = await leerRespuesta<{ data: Company[] }>(compRes);
      if (empresas.bien) {
        setCompanies(empresas.cuerpo.data);
      } else {
        setCompanies([]);
        setErrorCarga(motivoDeCarga(null, empresas.mensaje));
        toast.error(empresas.mensaje || 'Error al cargar empresas');
      }

      const planes = await leerRespuesta<{ data: typeof plans }>(plansRes);
      if (planes.bien) setPlans(planes.cuerpo.data);
    } catch (err) {
      setCompanies([]);
      setErrorCarga(motivoDeCarga(err));
      toast.error('Error al cargar datos administrativos');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(companyForm)
      });
      const leido = await leerRespuesta(res);
      if (leido.bien) {
        toast.success('Empresa creada exitosamente');
        setShowNewCompanyModal(false);
        fetchData();
        setCompanyForm({ name: '', rnc: '', email: '', businessActivity: '', address: '' });
      } else {
        toast.error(leido.mensaje || 'Error al crear empresa');
      }
    } catch (error) {
      toast.error('Error de red al crear empresa');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCompany = async (id: string) => {
    await confirm({
      title: 'Confirmar desactivación',
      description: '¿Está seguro de desactivar esta empresa? Esta acción deshabilitará el acceso de sus usuarios.',
      action: async () => {
        try {
          const res = await fetch(`/api/v1/admin/companies/${id}`, {
            method: 'DELETE',
          });
          const leido = await leerRespuesta(res);
          if (leido.bien) {
            toast.success('Empresa desactivada');
            fetchData();
          } else {
            toast.error(leido.mensaje || 'Error al eliminar empresa');
          }
        } catch (error) {
          toast.error('Error de red al eliminar empresa');
        }
      }
    });
  };

  const handleClearSandboxData = async (company: Company) => {
    // Interactive text prompt for confirmation
    const confirmName = prompt(
      `ATENCIÓN: Esta acción borrará permanentemente todos los datos de PRUEBA (Sandbox) de la empresa "${company.name}".\n\n` +
      `Esto incluye facturas, cotizaciones, asientos contables, inventario, movimientos de caja y nóminas en modo Sandbox.\n` +
      `Los datos de producción y otras empresas NO serán afectados.\n\n` +
      `Para confirmar, escriba el nombre de la empresa a continuación:`
    );

    if (confirmName !== company.name) {
      if (confirmName !== null) {
        toast.error('Confirmación inválida. No se borraron los datos.');
      }
      return;
    }

    setClearingSandbox(company.id);
    try {
      const res = await fetch(`/api/v1/admin/companies/${company.id}/clear-sandbox`, {
        method: 'POST',
      });
      const leido = await leerRespuesta(res);
      if (leido.bien) {
        toast.success(`Datos de prueba de "${company.name}" eliminados exitosamente.`);
        fetchData();
      } else {
        toast.error(leido.mensaje || 'Error al limpiar datos de prueba.');
      }
    } catch (err) {
      toast.error('Error de red al limpiar datos de prueba.');
    } finally {
      setClearingSandbox(null);
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

      const leido = await leerRespuesta(res);
      if (leido.bien) {
        toast.success('Suscripción SaaS actualizada correctamente');
        setShowSubscriptionModal(false);
        fetchData();
      } else {
        toast.error(leido.mensaje || 'Error al actualizar suscripción');
      }
    } catch (err) {
      toast.error('Error de red al guardar suscripción');
    } finally {
      setSubmitting(false);
    }
  };

  return { confirm, router, companies, setCompanies, plans, setPlans, loading, setLoading, errorCarga, setErrorCarga, searchTerm, setSearchTerm, filteredCompanies, showNewCompanyModal, setShowNewCompanyModal, showSubscriptionModal, setShowSubscriptionModal, selectedCompany, setSelectedCompany, submitting, setSubmitting, clearingSandbox, setClearingSandbox, companyForm, setCompanyForm, subForm, setSubForm, fetchData, handleCreateCompany, handleDeleteCompany, handleClearSandboxData, handleOpenSubscriptionModal, handleSaveSubscription };
}

type EstadoAdminCompaniesPage = ReturnType<typeof useEmpresas>;

function ListadoDeEmpresas({ h }: { h: EstadoAdminCompaniesPage }) {
  const { loading, errorCarga, searchTerm, setSearchTerm, filteredCompanies, clearingSandbox, fetchData, handleDeleteCompany, handleClearSandboxData, handleOpenSubscriptionModal } = h;
  return (
    <>
      {/* Listado */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
          <h2 className="font-bold text-[#003366] flex items-center gap-2 whitespace-nowrap">
            <Building2 className="h-4 w-4" /> Empresas Registradas
          </h2>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                aria-label="Buscar empresa por nombre o RNC"
                placeholder="Buscar por nombre o RNC..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition"
              />
            </div>
            <IconButton type="button" onClick={fetchData} aria-label="Actualizar">
              <RefreshCw className={clsx("h-4 w-4 text-slate-500", loading && "animate-spin")} />
            </IconButton>
          </div>
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
              {errorCarga && !loading ? (
                <tr>
                  <td colSpan={5}>
                    <ErrorDeCarga mensaje={errorCarga} onReintentar={fetchData} />
                  </td>
                </tr>
              ) : filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    {loading ? 'Cargando...' : 'No se encontraron empresas.'}
                  </td>
                </tr>
              ) : (
                filteredCompanies.map(company => (
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
                              <Calendar className="h-3 w-3" /> Vence: {formatDateDisplay(company.currentPeriodEnd)}
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
                        <IconButton
                          type="button"
                          onClick={() => handleOpenSubscriptionModal(company)}
                          className="hover:bg-[#003366]/10 text-[#003366]"
                          aria-label="Gestionar Suscripción SaaS"
                        >
                          <CreditCard className="h-4 w-4" />
                        </IconButton>
                        {company.status === 'active' && (
                          <>
                            <IconButton
                              type="button"
                              disabled={clearingSandbox !== null}
                              onClick={() => handleClearSandboxData(company)}
                              className={clsx(
                                "hover:bg-amber-100 text-amber-600",
                                clearingSandbox === company.id && "animate-pulse"
                              )}
                              aria-label="Limpiar Datos de Prueba (Sandbox)"
                            >
                              <RefreshCw className={clsx("h-4 w-4", clearingSandbox === company.id && "animate-spin")} />
                            </IconButton>
                            <IconButton
                              type="button"
                              onClick={() => handleDeleteCompany(company.id)}
                              className="hover:bg-red-100 text-red-600"
                              aria-label="Desactivar Empresa"
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </>
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
    </>
  );
}

function AltaDeEmpresa({ h }: { h: EstadoAdminCompaniesPage }) {
  const { showNewCompanyModal, setShowNewCompanyModal, submitting, companyForm, setCompanyForm, handleCreateCompany } = h;
  return (
    <>
      {/* Alta: era un modal; desde el lote 250 es la segunda pestana. */}
      {showNewCompanyModal && (
        <PanelDeRegistro titulo="Registrar Empresa">
        <form onSubmit={handleCreateCompany} className="space-y-4 max-w-md">
          <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-xs text-blue-800 mb-4">
            <strong>Nota:</strong> Al crear una empresa se generará automáticamente su configuración por defecto y el rol de <em>administracion</em>. Tendrás que crear o asignar usuarios a esta empresa manualmente luego.
          </div>
          
          <div>
            <label htmlFor="empresa-1" className="block text-xs font-bold text-slate-700 mb-1">Nombre Comercial <span className="text-red-500">*</span></label>
            <input id="empresa-1"
              type="text"
              required
              value={companyForm.name}
              onChange={e => setCompanyForm({...companyForm, name: e.target.value})}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition"
              placeholder="Ej. Mi Empresa S.R.L."
            />
          </div>

          <div>
            <label htmlFor="empresa-2" className="block text-xs font-bold text-slate-700 mb-1">RNC <span className="text-red-500">*</span></label>
            <input id="empresa-2"
              type="text"
              required
              minLength={9}
              maxLength={11}
              value={companyForm.rnc}
              onChange={e => setCompanyForm({...companyForm, rnc: e.target.value})}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition font-mono"
              placeholder="Ej. 101001001"
            />
          </div>

          <div>
            <label htmlFor="empresa-3" className="block text-xs font-bold text-slate-700 mb-1">Correo Electrónico <span className="text-red-500">*</span></label>
            <input id="empresa-3"
              type="email"
              required
              value={companyForm.email}
              onChange={e => setCompanyForm({...companyForm, email: e.target.value})}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition"
              placeholder="Ej. contacto@empresa.com"
            />
          </div>
          
          <div>
            <label htmlFor="empresa-4" className="block text-xs font-bold text-slate-700 mb-1">Actividad Comercial</label>
            <input id="empresa-4"
              type="text"
              value={companyForm.businessActivity}
              onChange={e => setCompanyForm({...companyForm, businessActivity: e.target.value})}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition"
              placeholder="Ej. Venta al por menor..."
            />
          </div>

          <div>
            <label htmlFor="empresa-5" className="block text-xs font-bold text-slate-700 mb-1">Dirección</label>
            <textarea id="empresa-5"
              value={companyForm.address}
              onChange={e => setCompanyForm({...companyForm, address: e.target.value})}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition resize-none"
              rows={2}
              placeholder="Dirección física..."
            />
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowNewCompanyModal(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting}
            >
              {submitting ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Guardando...</>
              ) : (
                'Guardar Empresa'
              )}
            </Button>
          </div>
        </form>
        </PanelDeRegistro>
      )}
    </>
  );
}

function VentanaDeSuscripcion({ h }: { h: EstadoAdminCompaniesPage }) {
  const { plans, showSubscriptionModal, setShowSubscriptionModal, selectedCompany, submitting, subForm, setSubForm, handleSaveSubscription } = h;
  return (
    <>
      {/* Modal: Gestionar Suscripción */}
      {showSubscriptionModal && selectedCompany && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 [animation-duration:200ms]">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-[#003366] flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[#C5A059]" /> Suscripción SaaS
              </h2>
              <IconButton type="button" onClick={() => setShowSubscriptionModal(false)} aria-label="Cerrar" className="rounded-full">
                <X className="h-5 w-5" />
              </IconButton>
            </div>
            
            <form onSubmit={handleSaveSubscription} className="p-5 space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs mb-2">
                <p className="font-bold text-slate-700">Compañía:</p>
                <p className="text-slate-900 font-medium text-sm mt-0.5">{selectedCompany.name}</p>
                <p className="text-slate-500 font-mono mt-0.5">RNC: {selectedCompany.rnc}</p>
              </div>

              <div>
                <label htmlFor="empresa-6" className="block text-xs font-bold text-slate-700 mb-1">Seleccionar Plan <span className="text-red-500">*</span></label>
                <select id="empresa-6"
                  required
                  value={subForm.planId}
                  onChange={e => setSubForm({...subForm, planId: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition"
                >
                  <option value="">-- Elija un plan comercial --</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} - ${parseFloat(p.price).toLocaleString('es-DO')} / mes ({p.maxEcfLimit === -1 ? 'e-CF Ilimitados' : `${p.maxEcfLimit} e-CF/mes`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="empresa-7" className="block text-xs font-bold text-slate-700 mb-1">Estado de Suscripción <span className="text-red-500">*</span></label>
                <select id="empresa-7"
                  required
                  value={subForm.status}
                  onChange={e => setSubForm({...subForm, status: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition"
                >
                  <option value="active">Activa (Vigente)</option>
                  <option value="past_due">Vencida (Pendiente de Pago)</option>
                  <option value="canceled">Cancelada (Suspendido total)</option>
                  <option value="trialing">Período de Prueba</option>
                </select>
              </div>

              <div>
                <label htmlFor="empresa-8" className="block text-xs font-bold text-slate-700 mb-1">Fecha de Próximo Vencimiento <span className="text-red-500">*</span></label>
                <input id="empresa-8"
                  type="date"
                  required
                  value={subForm.currentPeriodEnd}
                  onChange={e => setSubForm({...subForm, currentPeriodEnd: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none transition font-mono"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowSubscriptionModal(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? (
                    <><RefreshCw className="h-4 w-4 animate-spin" /> Guardando...</>
                  ) : (
                    'Guardar Cambios'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
