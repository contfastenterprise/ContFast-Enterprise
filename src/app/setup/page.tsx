'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Building, Key, Printer, Truck, UserCheck, ChevronRight, ChevronLeft, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';

export default function SetupWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Form State
  const [company, setCompany] = useState({ name: '', rnc: '', businessActivity: '' });
  const [fiscal, setFiscal] = useState({ dgiiEnv: 'test' });
  const [ecf, setEcf] = useState({ certP12Base64: '', certFileName: '', certPassword: '' });
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

  // Certificate file reader (Base64 converter)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.p12') && !file.name.endsWith('.pfx')) {
      toast.error('Formato de archivo inválido', {
        description: 'Por favor suba un certificado digital con extensión .p12 o .pfx',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const base64Data = result.split(',')[1] || result;
      setEcf((prev) => ({
        ...prev,
        certP12Base64: base64Data,
        certFileName: file.name,
      }));
      toast.success('Certificado cargado', {
        description: `Archivo ${file.name} listo para su cifrado.`,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleNext = () => {
    // Basic step validation
    if (currentStep === 0) {
      if (!company.name || !company.rnc) {
        toast.error('Campos obligatorios', { description: 'El nombre y RNC de la empresa son requeridos.' });
        return;
      }
      if (!/^(?:\d{9}|\d{11})$/.test(company.rnc)) {
        toast.error('RNC Inválido', { description: 'El RNC debe contener exactamente 9 u 11 dígitos numéricos.' });
        return;
      }
    } else if (currentStep === 2) {
      if (!ecf.certP12Base64 || !ecf.certPassword) {
        toast.error('Certificado requerido', { description: 'Debe cargar el archivo del certificado y especificar su contraseña.' });
        return;
      }
    } else if (currentStep === 5) {
      if (!user.name || !user.email || !user.password) {
        toast.error('Administrador requerido', { description: 'Todos los campos de la cuenta del administrador son requeridos.' });
        return;
      }
      if (user.password.length < 8) {
        toast.error('Contraseña corta', { description: 'La contraseña del administrador debe tener al menos 8 caracteres.' });
        return;
      }
    }

    setCurrentStep((prev) => Math.min(prev + 1, 6));
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
          ecf,
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
    <Key key="2" className="h-5 w-5" />,
    <Printer key="3" className="h-5 w-5" />,
    <Truck key="4" className="h-5 w-5" />,
    <UserCheck key="5" className="h-5 w-5" />,
  ];

  const stepNames = [
    'Empresa',
    'Ambiente',
    'Certificado e-CF',
    'Impresión',
    'Entregas',
    'Administrador',
    'Confirmación',
  ];

  if (checkingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <p className="text-slate-400 text-sm">Verificando estado del sistema...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <Toaster position="top-right" richColors />

      {/* Background gradients */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-900/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 -right-4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />

      <div className="w-full max-w-4xl space-y-8 z-10">
        {/* Wizard Header */}
        <div className="text-center">
          <h2 className="text-3xl font-display font-bold text-white">
            Asistente de <span className="text-amber-500">Configuración</span>
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Configure los parámetros iniciales y su certificado digital homologado para facturación e-CF.
          </p>
        </div>

        {/* Progress Stepper */}
        <div className="flex items-center justify-between max-w-xl mx-auto py-4">
          {stepIcons.map((icon, idx) => (
            <div key={idx} className="flex items-center flex-1 last:flex-initial">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-300 ${
                  idx === currentStep
                    ? 'border-amber-500 bg-amber-500 text-slate-950'
                    : idx < currentStep
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500'
                    : 'border-slate-800 bg-slate-900 text-slate-500'
                }`}
              >
                {icon}
              </div>
              {idx < stepIcons.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-2 transition-all duration-300 ${
                    idx < currentStep ? 'bg-emerald-500' : 'bg-slate-800'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Form panel with Glassmorphism */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-lg p-8 shadow-2xl">
          <h3 className="text-lg font-semibold text-white mb-6 uppercase tracking-wider border-b border-slate-800 pb-3">
            Paso {currentStep + 1}: {stepNames[currentStep]}
          </h3>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* STEP 1: Company Profile */}
              {currentStep === 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300 uppercase">Nombre Comercial</label>
                    <input
                      type="text"
                      value={company.name}
                      onChange={(e) => setCompany({ ...company, name: e.target.value })}
                      className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="Empresa Dominicana SRL"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300 uppercase">RNC (Registro Nacional de Contribuyentes)</label>
                    <input
                      type="text"
                      value={company.rnc}
                      onChange={(e) => setCompany({ ...company, rnc: e.target.value.replace(/\D/g, '') })}
                      className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="101001001"
                      maxLength={11}
                    />
                  </div>
                  <div className="col-span-1 md:col-span-2 space-y-1">
                    <label className="block text-xs font-semibold text-slate-300 uppercase">Actividad Económica</label>
                    <input
                      type="text"
                      value={company.businessActivity}
                      onChange={(e) => setCompany({ ...company, businessActivity: e.target.value })}
                      className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="Venta al por mayor de insumos comerciales y desarrollo tecnológico"
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: Fiscal Environment */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <p className="text-slate-400 text-sm">
                    Seleccione el ambiente para las solicitudes enviadas a los servicios web de la Dirección General de Impuestos Internos (DGII).
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div
                      onClick={() => setFiscal({ dgiiEnv: 'test' })}
                      className={`cursor-pointer rounded-lg border p-6 flex flex-col justify-between transition-all ${
                        fiscal.dgiiEnv === 'test'
                          ? 'border-amber-500 bg-amber-500/5'
                          : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-white font-semibold text-base">Ambiente de Pruebas (Test / Certificación)</span>
                      <p className="text-slate-400 text-xs mt-2">Para validaciones técnicas y e-CF de simulación sin valor tributario.</p>
                    </div>
                    <div
                      onClick={() => setFiscal({ dgiiEnv: 'production' })}
                      className={`cursor-pointer rounded-lg border p-6 flex flex-col justify-between transition-all ${
                        fiscal.dgiiEnv === 'production'
                          ? 'border-amber-500 bg-amber-500/5'
                          : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-white font-semibold text-base">Ambiente de Producción</span>
                      <p className="text-slate-400 text-xs mt-2">Envío real de facturación electrónica con valor tributario directo a la DGII.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Digital Certificate */}
              {currentStep === 2 && (
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-300 uppercase">Archivo de Firma (.p12 / .pfx)</label>
                    <div className="flex items-center justify-center w-full">
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-800 border-dashed rounded-lg cursor-pointer bg-slate-950 hover:bg-slate-900 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Key className="w-8 h-8 mb-3 text-slate-500" />
                          <p className="mb-2 text-sm text-slate-400">
                            <span className="font-semibold">Haga clic para subir</span> o arrastre el archivo
                          </p>
                          <p className="text-xs text-slate-500">Certificado Digital PKCS#12 (.p12 / .pfx)</p>
                        </div>
                        <input type="file" className="hidden" accept=".p12,.pfx" onChange={handleFileChange} />
                      </label>
                    </div>
                    {ecf.certFileName && (
                      <p className="text-emerald-500 text-xs mt-1">✓ Cargado: {ecf.certFileName}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300 uppercase">Contraseña del Certificado</label>
                    <input
                      type="password"
                      value={ecf.certPassword}
                      onChange={(e) => setEcf({ ...ecf, certPassword: e.target.value })}
                      className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              )}

              {/* STEP 4: Printing Configuration */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <p className="text-slate-400 text-sm">Seleccione el formato de impresión predeterminado para las facturas e-CF generadas en PDF.</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {['carta', '80mm', '58mm'].map((layout) => (
                      <div
                        key={layout}
                        onClick={() => setPrinting({ printLayout: layout })}
                        className={`cursor-pointer rounded-lg border p-6 flex flex-col items-center justify-center transition-all ${
                          printing.printLayout === layout
                            ? 'border-amber-500 bg-amber-500/5 text-amber-500'
                            : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <Printer className="h-8 w-8 mb-2" />
                        <span className="font-semibold uppercase text-sm">{layout}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 5: Delivery Configuration */}
              {currentStep === 4 && (
                <div className="space-y-4">
                  <div className="flex items-start gap-4 rounded-lg border border-slate-800 p-6 bg-slate-950/40">
                    <Truck className="h-8 w-8 text-amber-500 flex-shrink-0" />
                    <div>
                      <h4 className="text-white font-semibold">Generación Automática de Conduces (Remisión)</h4>
                      <p className="text-slate-400 text-sm mt-1">
                        Si se habilita, cada vez que se emita una factura de venta física que requiera entrega de mercancías, el sistema generará y vinculará automáticamente un conduce de entrega pre-llenado en borrador.
                      </p>
                      <div className="mt-4 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setDelivery({ autoDeliveryNotes: !delivery.autoDeliveryNotes })}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                            delivery.autoDeliveryNotes ? 'bg-amber-500' : 'bg-slate-800'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              delivery.autoDeliveryNotes ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <span className="text-slate-300 text-sm">
                          {delivery.autoDeliveryNotes ? 'Habilitado' : 'Deshabilitado'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 6: Administrator Credentials */}
              {currentStep === 5 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-1 md:col-span-2 space-y-1">
                    <label className="block text-xs font-semibold text-slate-300 uppercase">Nombre Completo del Administrador</label>
                    <input
                      type="text"
                      value={user.name}
                      onChange={(e) => setUser({ ...user, name: e.target.value })}
                      className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="Ing. Juan Pérez"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300 uppercase">Correo Electrónico</label>
                    <input
                      type="email"
                      value={user.email}
                      onChange={(e) => setUser({ ...user, email: e.target.value })}
                      className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="admin@empresa.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-300 uppercase">Contraseña Administrativa</label>
                    <input
                      type="password"
                      value={user.password}
                      onChange={(e) => setUser({ ...user, password: e.target.value })}
                      className="block w-full rounded-md border-0 bg-slate-950 py-3 px-4 text-white ring-1 ring-inset ring-slate-800 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                      placeholder="Mínimo 8 caracteres"
                    />
                  </div>
                </div>
              )}

              {/* STEP 7: Confirm & Summary */}
              {currentStep === 6 && (
                <div className="space-y-6">
                  <p className="text-slate-400 text-sm">Verifique todos los datos ingresados antes de iniciar el sistema.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border border-slate-800 p-6 bg-slate-950/40 text-sm text-slate-300">
                    <div>
                      <span className="font-semibold text-white text-xs uppercase block text-slate-500">Empresa</span>
                      <p className="mt-1 font-medium">{company.name}</p>
                      <p className="text-xs text-slate-400">RNC: {company.rnc}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-white text-xs uppercase block text-slate-500">Entorno Fiscal</span>
                      <p className="mt-1 font-medium uppercase text-amber-500">{fiscal.dgiiEnv}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-white text-xs uppercase block text-slate-500">Certificado</span>
                      <p className="mt-1 font-medium text-emerald-500">✓ {ecf.certFileName || 'Cargado'}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-white text-xs uppercase block text-slate-500">Impresión & Conduces</span>
                      <p className="mt-1 font-medium">Layout: <span className="uppercase">{printing.printLayout}</span></p>
                      <p className="text-xs text-slate-400">Autoconduces: {delivery.autoDeliveryNotes ? 'Sí' : 'No'}</p>
                    </div>
                    <div className="col-span-1 md:col-span-2 border-t border-slate-800 pt-4">
                      <span className="font-semibold text-white text-xs uppercase block text-slate-500">Administrador de Sistemas</span>
                      <p className="mt-1 font-medium">{user.name}</p>
                      <p className="text-xs text-slate-400">{user.email}</p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Stepper Buttons */}
          <div className="flex items-center justify-between border-t border-slate-800 mt-8 pt-6">
            <button
              onClick={handleBack}
              disabled={currentStep === 0 || loading}
              className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Atrás
            </button>

            {currentStep < 6 ? (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 rounded-md bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleConfirmSetup}
                disabled={loading}
                className="flex items-center gap-2 rounded-md bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      </div>
    </div>
  );
}
