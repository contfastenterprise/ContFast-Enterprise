'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Settings as SettingsIcon, CheckCircle2, RefreshCw, Building, FileText, Lock, Truck, Printer, Zap, Image as ImageIcon, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Read-only
  const [companyInfo, setCompanyInfo] = useState({ name: '', rnc: '' });

  // Editable
  const [formData, setFormData] = useState({
    businessActivity: '',
    logoUrl: '',
    dgiiEnv: 'test',
    printLayout: 'carta',
    autoDeliveryNotes: false,
    maxCreditNoteApprovalAmount: 0,
    maxCashOutApprovalAmount: 0
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/v1/admin/settings');
      const data = await res.json();
      if (data.success) {
        setCompanyInfo({ name: data.data.company.name, rnc: data.data.company.rnc });
        setFormData({
          businessActivity: data.data.company.businessActivity || '',
          logoUrl: data.data.settings.logoUrl || '',
          dgiiEnv: data.data.settings.dgiiEnv,
          printLayout: data.data.settings.printLayout,
          autoDeliveryNotes: data.data.settings.autoDeliveryNotes,
          maxCreditNoteApprovalAmount: Number(data.data.settings.maxCreditNoteApprovalAmount),
          maxCashOutApprovalAmount: Number(data.data.settings.maxCashOutApprovalAmount)
        });
      }
    } catch (err) {
      toast.error('Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Configuración guardada exitosamente');
      } else {
        toast.error(data.error?.message || 'Error al guardar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecciona un archivo de imagen (PNG, JPG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData(prev => ({ ...prev, logoUrl: event.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <DashboardLayout>
      <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20">
        <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-end items-center shadow-inner">
           <span className="text-primary text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
             <SettingsIcon className="h-3 w-3" /> Configuración Global
           </span>
        </div>

        <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-[#003366] flex items-center gap-2">
                Ajustes del Sistema
              </h1>
              <p className="text-on-surface-variant/70 text-sm mt-1">
                Configura los parámetros operativos y límites de la empresa.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" /></div>
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              
              {/* Bloque: Identidad (No editable) */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-3">
                  <Lock className="w-5 h-5 text-on-surface-variant" />
                  <h3 className="font-bold text-slate-800">Identidad Fiscal (Solo Lectura)</h3>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">Nombre Comercial</label>
                    <input type="text" disabled value={companyInfo.name} className="w-full bg-slate-50 border border-slate-200 text-on-surface-variant/70 rounded-lg px-3 py-2 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">RNC</label>
                    <input type="text" disabled value={companyInfo.rnc} className="w-full bg-slate-50 border border-slate-200 text-on-surface-variant/70 rounded-lg px-3 py-2 cursor-not-allowed" />
                  </div>
                  <div className="col-span-1 md:col-span-2 border-t border-slate-100 pt-6">
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">Logo de la Empresa (Facturas y Reportes)</label>
                    <div className="flex items-start gap-6 mt-2">
                      <div className="w-24 h-24 border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {formData.logoUrl ? (
                          <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                        ) : (
                          <ImageIcon className="w-8 h-8 text-on-surface-variant" />
                        )}
                      </div>
                      <div className="flex-1">
                        <label className="flex items-center justify-center w-full max-w-sm h-24 px-4 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-slate-50 transition-colors">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <UploadCloud className="w-6 h-6 text-on-surface-variant mb-2" />
                            <p className="text-sm text-on-surface-variant/70 font-medium">Haga clic para subir el logo</p>
                            <p className="text-xs text-on-surface-variant mt-1">PNG, JPG, SVG (Recomendado 250x100px)</p>
                          </div>
                          <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                        </label>
                        {formData.logoUrl && (
                          <button type="button" onClick={() => setFormData({...formData, logoUrl: ''})} className="text-xs text-rose-500 font-bold mt-2 hover:underline">
                            Remover Imagen
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloque: Configuración Editable */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-3">
                  <Building className="w-5 h-5 text-[#003366]" />
                  <h3 className="font-bold text-[#003366]">Parámetros Operativos</h3>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">Actividad Económica</label>
                    <input type="text" value={formData.businessActivity} onChange={e => setFormData({...formData, businessActivity: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059]" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Zap className="w-3 h-3"/> Ambiente de Facturación (e-CF)</label>
                    <select value={formData.dgiiEnv} onChange={e => setFormData({...formData, dgiiEnv: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] font-medium">
                      <option value="test">Pruebas (Sandbox)</option>
                      <option value="production">Producción</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Printer className="w-3 h-3"/> Formato de Impresión Predeterminado</label>
                    <select value={formData.printLayout} onChange={e => setFormData({...formData, printLayout: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] font-medium uppercase">
                      <option value="carta">Carta (8.5 x 11)</option>
                      <option value="80mm">Ticket 80mm</option>
                      <option value="58mm">Ticket 58mm</option>
                    </select>
                  </div>

                  <div className="col-span-1 md:col-span-2 border-t border-slate-100 pt-6 mt-2">
                    <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><FileText className="w-4 h-4"/> Límites y Automatizaciones</h4>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">Límite para Notas de Crédito Automáticas (DOP)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-on-surface-variant font-bold">$</span>
                      <input type="number" min="0" step="0.01" value={formData.maxCreditNoteApprovalAmount} onChange={e => setFormData({...formData, maxCreditNoteApprovalAmount: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 outline-none focus:border-[#C5A059] font-mono" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">Límite para Retiro de Caja Chica (DOP)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-on-surface-variant font-bold">$</span>
                      <input type="number" min="0" step="0.01" value={formData.maxCashOutApprovalAmount} onChange={e => setFormData({...formData, maxCashOutApprovalAmount: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 outline-none focus:border-[#C5A059] font-mono" />
                    </div>
                  </div>

                  <div className="col-span-1 md:col-span-2 flex items-center gap-3 bg-amber-50 p-4 rounded-lg border border-amber-100 mt-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, autoDeliveryNotes: !formData.autoDeliveryNotes })}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                        formData.autoDeliveryNotes ? 'bg-amber-500' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          formData.autoDeliveryNotes ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <div>
                      <h4 className="text-sm font-bold text-amber-900 flex items-center gap-2"><Truck className="w-4 h-4"/> Conduces Automáticos</h4>
                      <p className="text-xs text-amber-700/80">Generar un borrador de remisión automáticamente al facturar productos físicos.</p>
                    </div>
                  </div>

                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button type="submit" disabled={submitting} className="bg-[#003366] hover:bg-[#002244] text-primary font-bold py-3 px-8 rounded-lg shadow-md transition-all flex items-center gap-2">
                  {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} Guardar Cambios
                </button>
              </div>

            </form>
          )}

        </div>
      </div>
    </DashboardLayout>
  );
}
