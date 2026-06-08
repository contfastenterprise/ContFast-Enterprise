'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Building, Printer, Truck, UserCheck, ChevronRight, ChevronLeft, Loader2, Sparkles, CloudCog, Key, Globe, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';

export default function SetupWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [showToken, setShowToken] = useState(false);

  // Form State
  const [company, setCompany] = useState({ name: '', rnc: '', businessActivity: '' });
  const [fiscal, setFiscal] = useState({ dgiiEnv: 'test', msellerUrl: 'https://api.mseller.app/v1', msellerApiKey: '' });
  const [printing, setPrinting] = useState({ printLayout: 'carta' });
  const [delivery, setDelivery] = useState({ autoDeliveryNotes: false });
  const [user, setUser] = useState({ name: '', email: '', password: '' });

  // 1. Initial status check
  useEffect(() => {
    async function checkSetup() {
      try {
        const res = await fetch('/api/v1/setup/status');
        const data = await res.json();
        if (data.success && data.data.initialized) {
          router.push('/auth/login');
        } else {
          setCheckingStatus(false);
        }
      } catch (error) {
        console.error('Setup status check failed:', error);
        setCheckingStatus(false);
      }
    }
    checkSetup();
  }, [router]);

  const handleNext = () => {
    // Step validation
    if (currentStep === 0) {
      if (!company.name || !company.rnc) {
        toast.error('Campos obligatorios', { description: 'El nombre y RNC de la empresa son requeridos.' });
        return;
      }
      if (!/^(?:\d{9}|\d{11})$/.test(company.rnc)) {
        toast.error('RNC Inválido', { description: 'El RNC debe contener exactamente 9 u 11 dígitos numéricos.' });
        return;
      }
    } else if (currentStep === 1) {
      if (!fiscal.msellerApiKey) {
        toast.error('Token de mSeller requerido', { description: 'El Token de la API de mSeller es requerido para la integración de e-CF.' });
        return;
      }
    } else if (currentStep === 4) {
      if (!user.name || !user.email || !user.password) {
        toast.error('Administrador requerido', { description: 'Todos los campos de la cuenta del administrador son requeridos.' });
        return;
      }
      if (user.password.length < 8) {
        toast.error('Contraseña corta', { description: 'La contraseña del administrador debe tener al menos 8 caracteres.' });
        return;
      }
    }

    setCurrentStep((prev) => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleConfirmSetup = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/setup/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          fiscal,
          printing,
          delivery,
          user,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al completar la inicialización del sistema.');
      }

      toast.success('¡Sistema Inicializado!', {
        description: 'Redireccionando al panel administrativo de ContFast...',
      });

      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    } catch (error: any) {
      toast.error('Fallo en configuración', {
        description: error.message,
      });
      setLoading(false);
    }
  };

  const stepIcons = [
    <Building key="0" className="h-5 w-5" />,
    <Shield key="1" className="h-5 w-5" />,
    <Printer key="2" className="h-5 w-5" />,
    <Truck key="3" className="h-5 w-5" />,
    <UserCheck key="4" className="h-5 w-5" />,
  ];

  const stepNames = [
    'Empresa',
    'Ambiente e-CF',
    'Impresión',
    'Entregas',
    'Administrador',
    'Confirmación',
  ];

  if (checkingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#C5A059]" />
          <p className="text-on-surface-variant text-sm">Verificando estado del sistema...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col font-sans relative overflow-x-hidden">
      <Toaster position="top-right" richColors />

      {/* Top Environment Bar */}
      <div className="w-full h-8 bg-[#001e40] flex items-center justify-center relative overflow-hidden shrink-0 border-b border-outline-variant/30">
        <div className="absolute inset-0 opacity-10 bg-repeat-x" style={{
          backgroundImage: 'linear-gradient(45deg, #fed488 25%, transparent 25%, transparent 50%, #fed488 50%, #fed488 75%, transparent 75%, transparent)',
          backgroundSize: '20px 20px'
        }} />
        <span className="relative z-10 font-mono text-[11px] font-bold text-primary tracking-widest flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-[#C5A059]" />
          PRODUCTION ENVIRONMENT - SECURE FISCAL PORTAL
        </span>
      </div>

      {/* Onboarding Header */}
      <header className="bg-surface-container-low/40 border-b border-slate-900 py-6 shrink-0">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <img 
            alt="Latin Doors Logo" 
            className="h-10 object-contain brightness-95" 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDl-a6MYr3pCuvDfhdfg2VsbCggo6qEsaqURtdMkvUAQHRlXrFTtg9n3S-s2FkLtbhnaYVQILBbn5A5IyMSOLJez_vEEVSzJ8tVwMfS1jsa33vsuPwKkzwHFjmOuCq8JPZl3rtSisjT9q8MLwRfpnuPh4eLfoSK-Q6OjFOL8YpTW1OyQ9NcJGWccmdF_-tT7396-uR3dke78esJ0PZvnB0QZuHHpGZS14Xg9ueX988uE79O2QsdXZfeVSQ7K9bfJJ6rWoGlEhNmBKs2" 
          />
          <div className="text-center sm:text-right">
            <h1 className="text-xl font-bold tracking-tight text-[#C5A059] font-display">Onboarding Wizard</h1>
            <p className="text-xs text-on-surface-variant">Fiscal Authorization Process</p>
          </div>
        </div>
      </header>

      {/* Background gradients */}
      <div className="absolute top-32 -left-20 w-[450px] h-[450px] bg-blue-900/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 -right-20 w-[450px] h-[450px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-10 z-10 flex flex-col justify-center">
        
        {/* Progress Stepper */}
        <div className="mb-10 max-w-2xl mx-auto w-full">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-surface-container-high -translate-y-1/2 z-0" />
            <div 
              className="absolute top-1/2 left-0 h-0.5 bg-[#C5A059] -translate-y-1/2 z-0 transition-all duration-500" 
              style={{ width: `${(currentStep / 5) * 100}%` }}
            />
            {stepNames.map((name, idx) => (
              <div key={idx} className="relative z-10 flex flex-col items-center gap-1.5">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs border-2 transition-all duration-300 ${
                    idx === currentStep
                      ? 'border-[#C5A059] bg-[#001e40] text-[#fed488] scale-110 shadow-lg shadow-blue-900/30'
                      : idx < currentStep
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                      : 'border-outline-variant/30 bg-background text-on-surface-variant/70'
                  }`}
                >
                  {idx < currentStep ? '✓' : idx + 1}
                </div>
                <span className={`text-[10px] font-semibold uppercase tracking-wider hidden sm:block ${
                  idx === currentStep ? 'text-[#fed488]' : 'text-on-surface-variant/70'
                }`}>
                  {name.split(' ')[0]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Form panel with Premium design */}
        <div className="bg-surface-container-low/55 backdrop-blur-xl border border-outline-variant/30/80 rounded-xl p-8 shadow-2xl transition-all">
          <div className="mb-6 border-b border-outline-variant/30/60 pb-4">
            <h2 className="text-lg font-bold text-[#fed488] tracking-wider uppercase font-display">
              Paso {currentStep + 1}: {stepNames[currentStep]}
            </h2>
            <p className="text-on-surface-variant text-xs mt-1">Configure los parámetros requeridos para inicializar el sistema de facturación.</p>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {/* STEP 1: Company Profile */}
              {currentStep === 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1 group">
                    <label className="block text-xs font-semibold text-[#fed488] uppercase tracking-wider">Nombre Comercial <span className="text-[#C5A059]">*</span></label>
                    <input
                      type="text"
                      value={company.name}
                      onChange={(e) => setCompany({ ...company, name: e.target.value })}
                      className="block w-full rounded border border-outline-variant/30 bg-background/80 py-2.5 px-4 text-primary placeholder-slate-600 focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all focus:scale-[1.01]"
                      placeholder="e.g. Latin Doors SRL"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-[#fed488] uppercase tracking-wider">RNC (Tax ID) <span className="text-[#C5A059]">*</span></label>
                    <input
                      type="text"
                      value={company.rnc}
                      onChange={(e) => setCompany({ ...company, rnc: e.target.value.replace(/\D/g, '') })}
                      className="block w-full rounded border border-outline-variant/30 bg-background/80 py-2.5 px-4 text-primary placeholder-slate-600 focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm font-mono transition-all focus:scale-[1.01]"
                      placeholder="1-01-XXXXX-X"
                      maxLength={11}
                    />
                    <p className="text-[10px] text-on-surface-variant/70 italic mt-0.5">Formato: 9 u 11 dígitos numéricos</p>
                  </div>
                  <div className="col-span-1 md:col-span-2 space-y-1">
                    <label className="block text-xs font-semibold text-[#fed488] uppercase tracking-wider">Actividad Económica</label>
                    <input
                      type="text"
                      value={company.businessActivity}
                      onChange={(e) => setCompany({ ...company, businessActivity: e.target.value })}
                      className="block w-full rounded border border-outline-variant/30 bg-background/80 py-2.5 px-4 text-primary placeholder-slate-600 focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all focus:scale-[1.01]"
                      placeholder="Venta al por mayor de insumos comerciales y desarrollo tecnológico"
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: Fiscal Environment & MSeller integration */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-[#fed488] uppercase tracking-wider">Ambiente Fiscal DGII</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div
                        onClick={() => setFiscal({ ...fiscal, dgiiEnv: 'test' })}
                        className={`cursor-pointer rounded-lg border p-5 flex flex-col justify-between transition-all ${
                          fiscal.dgiiEnv === 'test'
                            ? 'border-[#C5A059] bg-[#001e40]/40'
                            : 'border-outline-variant/30 bg-background/40 hover:border-outline-variant/50'
                        }`}
                      >
                        <span className="text-primary font-semibold text-sm flex items-center gap-2"><CloudCog className="w-4.5 h-4.5 text-[#fed488]"/> Ambiente de Pruebas</span>
                        <p className="text-on-surface-variant text-xs mt-2">Para validaciones técnicas y simulaciones usando la API de mSeller en Sandbox.</p>
                      </div>
                      <div
                        onClick={() => setFiscal({ ...fiscal, dgiiEnv: 'production' })}
                        className={`cursor-pointer rounded-lg border p-5 flex flex-col justify-between transition-all ${
                          fiscal.dgiiEnv === 'production'
                            ? 'border-[#C5A059] bg-[#001e40]/40'
                            : 'border-outline-variant/30 bg-background/40 hover:border-outline-variant/50'
                        }`}
                      >
                        <span className="text-primary font-semibold text-sm flex items-center gap-2"><Sparkles className="w-4.5 h-4.5 text-[#fed488]"/> Ambiente de Producción</span>
                        <p className="text-on-surface-variant text-xs mt-2">Envío real de facturación electrónica con valor tributario directo a través de mSeller.</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-outline-variant/30/60 pt-6 space-y-4">
                    <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
                      <Globe className="w-4 h-4 text-[#C5A059]" /> Integración con API de mSeller
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2 space-y-1">
                        <label className="block text-xs font-semibold text-[#fed488] uppercase tracking-wider">URL de la API (MSeller URL)</label>
                        <input
                          type="text"
                          value={fiscal.msellerUrl}
                          onChange={(e) => setFiscal({ ...fiscal, msellerUrl: e.target.value })}
                          className="block w-full rounded border border-outline-variant/30 bg-background/80 py-2.5 px-4 text-primary placeholder-slate-600 focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all focus:scale-[1.01]"
                          placeholder="https://api.mseller.app/v1"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-[#fed488] uppercase tracking-wider">Token API (MSeller Key) <span className="text-[#C5A059]">*</span></label>
                        <div className="relative">
                          <input
                            type={showToken ? 'text' : 'password'}
                            value={fiscal.msellerApiKey}
                            onChange={(e) => setFiscal({ ...fiscal, msellerApiKey: e.target.value })}
                            className="block w-full rounded border border-outline-variant/30 bg-background/80 py-2.5 pl-4 pr-10 text-primary placeholder-slate-600 focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all focus:scale-[1.01]"
                            placeholder="mSeller Token"
                          />
                          <button
                            type="button"
                            onClick={() => setShowToken(!showToken)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70 hover:text-on-surface-variant transition-colors"
                          >
                            {showToken ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-on-surface-variant/70 italic">Este token se almacenará encriptado de forma segura en la base de datos de su empresa.</p>
                  </div>
                </div>
              )}

              {/* STEP 3: Printing Configuration */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <p className="text-on-surface-variant text-sm">Seleccione el formato de impresión predeterminado para las facturas e-CF generadas en PDF.</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {['carta', '80mm', '58mm'].map((layout) => (
                      <div
                        key={layout}
                        onClick={() => setPrinting({ printLayout: layout })}
                        className={`cursor-pointer rounded-lg border p-6 flex flex-col items-center justify-center transition-all ${
                          printing.printLayout === layout
                            ? 'border-[#C5A059] bg-[#001e40]/30 text-[#fed488]'
                            : 'border-outline-variant/30 bg-background/40 text-on-surface-variant hover:border-outline-variant/50'
                        }`}
                      >
                        <Printer className="h-8 w-8 mb-2" />
                        <span className="font-semibold uppercase text-sm tracking-wider">{layout}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 4: Delivery Configuration */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <div className="flex items-start gap-4 rounded-lg border border-outline-variant/30 p-6 bg-background/40">
                    <Truck className="h-8 w-8 text-[#C5A059] flex-shrink-0" />
                    <div>
                      <h4 className="text-primary font-semibold">Generación Automática de Conduces (Remisión)</h4>
                      <p className="text-on-surface-variant text-sm mt-1">
                        Si se habilita, cada vez que se emita una factura de venta física que requiera entrega de mercancías, el sistema generará y vinculará automáticamente un conduce de entrega pre-llenado en borrador.
                      </p>
                      <div className="mt-4 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setDelivery({ autoDeliveryNotes: !delivery.autoDeliveryNotes })}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                            delivery.autoDeliveryNotes ? 'bg-[#C5A059]' : 'bg-surface-container-high'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              delivery.autoDeliveryNotes ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <span className="text-on-surface-variant text-sm font-semibold">
                          {delivery.autoDeliveryNotes ? 'Habilitado' : 'Deshabilitado'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5: Administrator Credentials */}
              {currentStep === 4 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-1 md:col-span-2 space-y-1">
                    <label className="block text-xs font-semibold text-[#fed488] uppercase tracking-wider">Nombre Completo del Administrador <span className="text-[#C5A059]">*</span></label>
                    <input
                      type="text"
                      value={user.name}
                      onChange={(e) => setUser({ ...user, name: e.target.value })}
                      className="block w-full rounded border border-outline-variant/30 bg-background/80 py-2.5 px-4 text-primary placeholder-slate-600 focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all focus:scale-[1.01]"
                      placeholder="Ing. Juan Pérez"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-[#fed488] uppercase tracking-wider">Correo Electrónico <span className="text-[#C5A059]">*</span></label>
                    <input
                      type="email"
                      value={user.email}
                      onChange={(e) => setUser({ ...user, email: e.target.value })}
                      className="block w-full rounded border border-outline-variant/30 bg-background/80 py-2.5 px-4 text-primary placeholder-slate-600 focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all focus:scale-[1.01]"
                      placeholder="admin@empresa.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-[#fed488] uppercase tracking-wider">Contraseña Administrativa <span className="text-[#C5A059]">*</span></label>
                    <input
                      type="password"
                      value={user.password}
                      onChange={(e) => setUser({ ...user, password: e.target.value })}
                      className="block w-full rounded border border-outline-variant/30 bg-background/80 py-2.5 px-4 text-primary placeholder-slate-600 focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all focus:scale-[1.01]"
                      placeholder="Mínimo 8 caracteres"
                    />
                  </div>
                </div>
              )}

              {/* STEP 6: Confirm & Summary */}
              {currentStep === 5 && (
                <div className="space-y-6">
                  <p className="text-on-surface-variant text-sm">Verifique todos los datos ingresados antes de iniciar el sistema.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border border-outline-variant/30 p-6 bg-background/40 text-sm text-on-surface-variant">
                    <div>
                      <span className="font-semibold text-on-surface-variant/70 text-xs uppercase block">Empresa</span>
                      <p className="mt-1 font-semibold text-primary">{company.name}</p>
                      <p className="text-xs text-on-surface-variant font-mono">RNC: {company.rnc}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-on-surface-variant/70 text-xs uppercase block">Integración e-CF</span>
                      <p className="mt-1 font-semibold text-emerald-400">✓ API mSeller vinculada</p>
                      <p className="text-xs text-on-surface-variant font-mono truncate">URL: {fiscal.msellerUrl}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-on-surface-variant/70 text-xs uppercase block">Entorno Fiscal</span>
                      <p className="mt-1 font-semibold uppercase text-[#fed488]">{fiscal.dgiiEnv}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-on-surface-variant/70 text-xs uppercase block">Impresión & Conduces</span>
                      <p className="mt-1 font-semibold">Layout: <span className="uppercase text-on-surface">{printing.printLayout}</span></p>
                      <p className="text-xs text-on-surface-variant">Autoconduces: {delivery.autoDeliveryNotes ? 'Sí' : 'No'}</p>
                    </div>
                    <div className="col-span-1 md:col-span-2 border-t border-outline-variant/30 pt-4">
                      <span className="font-semibold text-on-surface-variant/70 text-xs uppercase block">Administrador de Sistemas</span>
                      <p className="mt-1 font-semibold text-primary">{user.name}</p>
                      <p className="text-xs text-on-surface-variant font-mono">{user.email}</p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Stepper Buttons */}
          <div className="flex items-center justify-between border-t border-outline-variant/30 mt-8 pt-6">
            <button
              onClick={handleBack}
              disabled={currentStep === 0 || loading}
              className="flex items-center gap-2 rounded border border-outline-variant/30 bg-background px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Atrás
            </button>

            {currentStep < 5 ? (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 rounded bg-[#C5A059] px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-[#fed488] transition-colors"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleConfirmSetup}
                disabled={loading}
                className="flex items-center gap-2 rounded bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-primary hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Inicializando base de datos...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Confirmar e Inicializar
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <p className="text-center mt-8 text-xs text-on-surface-variant/70">
          ¿Necesita ayuda con su registro? <a className="text-[#C5A059] font-semibold hover:underline" href="#">Soporte Técnico</a> o <a className="text-[#C5A059] font-semibold hover:underline" href="#">Guía de Usuario</a>.
        </p>
      </main>

      {/* Footer */}
      <footer className="py-6 bg-background border-t border-slate-900 shrink-0">
        <div className="max-w-4xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-on-surface-variant/70 text-[11px]">
          <span>© 2024 Latin Doors SRL - Proveedor Autorizado de Facturación Electrónica</span>
          <div className="flex gap-6">
            <a className="hover:text-on-surface-variant transition-colors" href="#">Política de Privacidad</a>
            <a className="hover:text-on-surface-variant transition-colors" href="#">Términos de Servicio</a>
            <a className="hover:text-on-surface-variant transition-colors" href="#">Documentación API</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
