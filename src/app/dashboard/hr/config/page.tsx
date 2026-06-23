'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Settings, ShieldCheck, HelpCircle, Save, RefreshCw, Scale, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// Format currency helper
const formatCurrency = (val: number | string) => {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return 'RD$ ' + (num || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function ConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<any>({
    afpEmployee: 2.87,
    sfsEmployee: 3.04,
    afpEmployer: 7.10,
    sfsEmployer: 7.09,
    infotepEmployer: 1.0,
    riskEmployer: 1.10,
    overtimeDiurnaRate: 1.35,
    overtimeNocturnaRate: 1.85,
    overtimeFestivaRate: 2.00,
    overtimeDobleRate: 2.00,
  });
  const [brackets, setBrackets] = useState<any[]>([]);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/hr/config');
      const resData = await res.json();
      if (resData.success) {
        // Convert string rates from API to numbers (percentages)
        const cfg = resData.data.config;
        setConfig({
          afpEmployee: parseFloat(cfg.afpEmployee) * 100,
          sfsEmployee: parseFloat(cfg.sfsEmployee) * 100,
          afpEmployer: parseFloat(cfg.afpEmployer) * 100,
          sfsEmployer: parseFloat(cfg.sfsEmployer) * 100,
          infotepEmployer: parseFloat(cfg.infotepEmployer) * 100,
          riskEmployer: parseFloat(cfg.riskEmployer) * 100,
          overtimeDiurnaRate: parseFloat(cfg.overtimeDiurnaRate),
          overtimeNocturnaRate: parseFloat(cfg.overtimeNocturnaRate),
          overtimeFestivaRate: parseFloat(cfg.overtimeFestivaRate),
          overtimeDobleRate: parseFloat(cfg.overtimeDobleRate),
        });
        setBrackets(resData.data.brackets || []);
      } else {
        toast.error(resData.error?.message || 'Error al cargar configuraciones');
      }
    } catch (e) {
      toast.error('Error de red');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setConfig((prev: any) => ({
      ...prev,
      [field]: parseFloat(value) || 0,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      // Convert rates back to decimals for backend validation and storage
      const payload = {
        afpEmployee: config.afpEmployee / 100,
        sfsEmployee: config.sfsEmployee / 100,
        afpEmployer: config.afpEmployer / 100,
        sfsEmployer: config.sfsEmployer / 100,
        infotepEmployer: config.infotepEmployer / 100,
        riskEmployer: config.riskEmployer / 100,
        overtimeDiurnaRate: config.overtimeDiurnaRate,
        overtimeNocturnaRate: config.overtimeNocturnaRate,
        overtimeFestivaRate: config.overtimeFestivaRate,
        overtimeDobleRate: config.overtimeDobleRate,
      };

      const res = await fetch('/api/v1/hr/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (resData.success) {
        toast.success('Configuraciones guardadas y actualizadas para las futuras nóminas');
        fetchConfig();
      } else {
        toast.error(resData.error?.message || 'Error al guardar');
      }
    } catch (err) {
      toast.error('Error de red');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-sans">
              Configuraciones de Ley TSS e ISR
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Configure las tasas de seguridad social (TSS), horas extras, y visualice los tramos anuales de la DGII.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchConfig}
              className="inline-flex items-center justify-center rounded-md border border-outline bg-surface p-2 text-sm font-medium text-on-surface shadow-sm hover:bg-surface-variant transition-all"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* TSS and Overtime Card */}
            <div className="rounded-xl border border-outline bg-surface p-6 shadow-sm">
              <div className="flex items-center gap-2 border-b border-outline/30 pb-4 mb-4">
                <Settings className="h-5 w-5 text-primary" />
                <h3 className="text-base font-semibold text-on-surface">
                  Porcentajes de TSS y Horas Extras
                </h3>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* TSS Sections */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                    Retenciones del Empleado (TSS)
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        AFP (Fondo de Pensiones) (%)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={config.afpEmployee}
                        onChange={(e) => handleInputChange('afpEmployee', e.target.value)}
                        required
                        className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        SFS (Seguro de Salud) (%)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={config.sfsEmployee}
                        onChange={(e) => handleInputChange('sfsEmployee', e.target.value)}
                        required
                        className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                    Aportes del Empleador (Costo Empresa)
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        AFP Empleador (%)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={config.afpEmployer}
                        onChange={(e) => handleInputChange('afpEmployer', e.target.value)}
                        required
                        className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        SFS Empleador (%)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={config.sfsEmployer}
                        onChange={(e) => handleInputChange('sfsEmployer', e.target.value)}
                        required
                        className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        ARL (Riesgo Laboral) (%)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={config.riskEmployer}
                        onChange={(e) => handleInputChange('riskEmployer', e.target.value)}
                        required
                        className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        INFOTEP Empleador (%)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={config.infotepEmployer}
                        onChange={(e) => handleInputChange('infotepEmployer', e.target.value)}
                        required
                        className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                      />
                    </div>
                  </div>
                </div>

                {/* Overtime Sections */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                    Factores de Recargo (Horas Extras)
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Horas Diurnas (Factor)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={config.overtimeDiurnaRate}
                        onChange={(e) => handleInputChange('overtimeDiurnaRate', e.target.value)}
                        required
                        className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Horas Nocturnas (Factor)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={config.overtimeNocturnaRate}
                        onChange={(e) => handleInputChange('overtimeNocturnaRate', e.target.value)}
                        required
                        className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Horas Festivas/Libres (Factor)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={config.overtimeFestivaRate}
                        onChange={(e) => handleInputChange('overtimeFestivaRate', e.target.value)}
                        required
                        className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Horas Dobles (Factor)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={config.overtimeDobleRate}
                        onChange={(e) => handleInputChange('overtimeDobleRate', e.target.value)}
                        required
                        className="w-full rounded-md border border-outline bg-surface p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-outline/30">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center rounded-md bg-[#003366] hover:bg-[#001e40] px-4 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50 transition-all"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>

            {/* ISR Brackets Card */}
            <div className="space-y-6">
              <div className="rounded-xl border border-outline bg-surface p-6 shadow-sm">
                <div className="flex items-center gap-2 border-b border-outline/30 pb-4 mb-4">
                  <Scale className="h-5 w-5 text-primary" />
                  <h3 className="text-base font-semibold text-on-surface">
                    Escala de ISR Anual (DGII)
                  </h3>
                </div>

                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Estos tramos de Impuesto sobre la Renta son establecidos por ley de la República Dominicana. El motor de cálculos aplica esta tabla de forma anualizada sobre el salario imponible neto de retenciones de TSS.
                </p>

                {/* Table of Brackets */}
                <div className="overflow-hidden rounded-lg border border-outline bg-surface">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-outline bg-surface-variant/20 text-on-surface-variant font-semibold">
                        <th className="p-3">Desde Anual</th>
                        <th className="p-3">Hasta Anual</th>
                        <th className="p-3 text-right">Tasa de Impuesto</th>
                        <th className="p-3 text-right">Excedente / Cargo Fijo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                      {brackets.map((b) => {
                        const fromAmt = formatCurrency(b.fromAmount);
                        const toAmt = b.toAmount ? formatCurrency(b.toAmount) : 'En adelante';
                        const rate = Number(b.percentage).toFixed(1) + '%';
                        const fixed = parseFloat(b.fixedAmount) > 0 ? formatCurrency(b.fixedAmount) : 'RD$ 0.00';

                        return (
                          <tr key={b.id} className="hover:bg-surface-variant/10 text-on-surface">
                            <td className="p-3 font-medium">{fromAmt}</td>
                            <td className="p-3">{toAmt}</td>
                            <td className="p-3 text-right font-semibold text-[#003366]">
                              {rate}
                            </td>
                            <td className="p-3 text-right">
                              {parseFloat(b.fixedAmount) > 0 ? (
                                <span>{fixed} + {rate} del exc.</span>
                              ) : parseFloat(b.percentage) > 0 ? (
                                <span>{rate} del exc.</span>
                              ) : (
                                <span className="text-slate-400 italic">Exento</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-2 rounded-lg border border-outline bg-surface-variant/10 p-4 text-xs text-on-surface-variant mt-4">
                  <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">Exención de Impuestos (Ley RD)</p>
                    <p className="mt-0.5">
                      AFP y SFS son deducibles antes del cálculo del ISR. El Salario de Navidad (hasta la duodécima parte) está totalmente exento de ISR.
                    </p>
                  </div>
                </div>
              </div>

              {/* TSS Threshold info */}
              <div className="rounded-xl border border-outline bg-surface p-6 shadow-sm">
                <div className="flex items-center gap-2 border-b border-outline/30 pb-4 mb-4">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <h3 className="text-base font-semibold text-on-surface">
                    Límites y Topes de Cotización (TSS)
                  </h3>
                </div>
                
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Las cotizaciones de TSS en República Dominicana están limitadas a topes basados en salarios mínimos cotizables:
                </p>
                
                <ul className="mt-3 space-y-2 text-xs text-slate-700 dark:text-slate-300 list-disc list-inside">
                  <li><strong>AFP:</strong> Hasta 20 salarios mínimos cotizables.</li>
                  <li><strong>SFS:</strong> Hasta 10 salarios mínimos cotizables.</li>
                  <li><strong>ARL:</strong> Hasta 4 salarios mínimos cotizables.</li>
                </ul>

                <p className="mt-3 text-xs text-slate-400 italic">
                  El motor de cálculo del ERP ajusta automáticamente los aportes si el salario del empleado supera estos límites.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
