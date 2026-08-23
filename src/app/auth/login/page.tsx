'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Mail, Lock, Loader2, Sparkles, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';

import { RippleBackground } from '@/components/ui/interactive-ripple-background';
import { PageLoader } from '@/components/ui/PageLoader';

const loginSchema = z.object({
  email: z.string().email('Formato de correo electrónico inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  // Company logo screen transition state
  const [showCompanyLoader, setShowCompanyLoader] = useState(false);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  // 1. Check if the system is initialized. If not, redirect to wizard.
  useEffect(() => {
    async function checkSetupStatus() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5s max
      try {
        const res = await fetch('/api/v1/setup/status', { signal: controller.signal });
        clearTimeout(timeout);
        const data = await res.json();
        if (data.success && !data.data.initialized) {
          router.push('/setup');
        } else {
          setCheckingStatus(false);
        }
      } catch (error) {
        clearTimeout(timeout);
        console.error('Failed to check setup status:', error);
        setCheckingStatus(false); // Si falla o timeout, mostrar login de todas formas
      }
    }
    checkSetupStatus();
  }, [router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.status === 500) {
        throw new Error('No hay conexión a internet.');
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        throw new Error('No hay conexión a internet.');
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Acceso incorrecto.');
      }

      const configuredLogo = data.data?.companyLogo || data.data?.logoUrl || null;
      const configuredName = data.data?.companyName || null;

      toast.success('¡Acceso concedido!', {
        description: 'Redireccionando al panel principal...',
      });

      // ONLY execute company logo loader transition if company has logo configured in DB
      if (configuredLogo && typeof configuredLogo === 'string' && configuredLogo.trim() !== '') {
        try {
          sessionStorage.setItem('cf_post_login_logo', configuredLogo);
          if (configuredName) sessionStorage.setItem('cf_post_login_name', configuredName);
        } catch (e) {
          console.error('SessionStorage error:', e);
        }
        setCompanyLogo(configuredLogo);
        setCompanyName(configuredName);
        setShowCompanyLoader(true);
        // Immediate navigation - PageLoader in layout will keep screen smooth until dashboard fully loads
        router.push('/dashboard');
      } else {
        // Otherwise, standard behavior continues as normal
        router.push('/dashboard');
      }
    } catch (err: any) {
      let errorMessage = err.message;
      if (
        errorMessage === 'Failed to fetch' ||
        errorMessage?.toLowerCase().includes('failed to fetch') ||
        errorMessage?.toLowerCase().includes('networkerror') ||
        errorMessage?.toLowerCase().includes('load resource')
      ) {
        errorMessage = 'No hay conexión a internet.';
      }

      toast.error('Error de autenticación', {
        description: errorMessage,
      });
      setLoading(false);
    }
  };

  if (showCompanyLoader && companyLogo) {
    return (
      <PageLoader
        logoUrl={companyLogo}
        companyName={companyName}
        message="Inicializando panel principal..."
        fullScreen
      />
    );
  }

  if (checkingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <p className="text-on-surface-variant text-sm">Verificando estado del sistema...</p>
        </div>
      </div>
    );
  }

  return (
    <RippleBackground>
      <Toaster position="top-right" richColors />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full max-w-4xl flex flex-col items-center justify-start min-h-screen z-10 px-4 sm:px-6 pt-4 pb-10"
      >
        <div className="w-full text-center mb-12 mt-20">
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 5 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.4, type: 'spring', stiffness: 250, damping: 25 }}
          >
            <img 
              src="/Logo.svg" 
              alt="ContFast Enterprise" 
              className="mx-auto w-full max-w-[450px] object-contain drop-shadow-xl" 
            />
          </motion.div>
        </div>

        {/* Form Container with Glassmorphism */}
        <div className="w-full max-w-md bg-surface-container-low/60 backdrop-blur-xl border border-outline-variant/30 rounded-lg p-6 shadow-2xl relative z-10">
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            
            {/* Email Field */}
            <div className="space-y-1">
              <label htmlFor="email" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                Correo Electrónico
              </label>
              <div className="relative rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-on-surface-variant/70">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  {...register('email')}
                  className="block w-full rounded-md border-0 bg-background py-2 pl-10 pr-3 text-primary ring-1 ring-inset ring-outline-variant/30 placeholder:text-on-surface-variant/80 focus:ring-2 focus:ring-inset focus:ring-amber-500 sm:text-sm sm:leading-6 transition duration-200 outline-none"
                  placeholder="admin@empresa.com"
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-1">
              <label htmlFor="password" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                Contraseña
              </label>
              <div className="relative rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-on-surface-variant/70">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  {...register('password')}
                  className="block w-full rounded-md border-0 bg-background py-2 pl-10 pr-10 text-primary ring-1 ring-inset ring-outline-variant/30 placeholder:text-on-surface-variant/80 focus:ring-2 focus:ring-inset focus:ring-amber-500 sm:text-sm sm:leading-6 transition duration-200 outline-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-on-surface-variant/70 hover:text-primary transition-colors focus:outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center items-center gap-2 rounded-md bg-amber-500 px-3 py-2.5 text-sm font-semibold text-slate-950 shadow-sm hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-[background-color,transform,box-shadow] duration-200 ease-out hover:scale-[1.02] active:scale-[0.98] active:duration-100"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Verificando credenciales...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  Acceder al Sistema
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </RippleBackground>
  );
}
