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

  // 1. Check if the system is initialized. If not, redirect to wizard.
  useEffect(() => {
    async function checkSetupStatus() {
      try {
        const res = await fetch('/api/v1/setup/status');
        const data = await res.json();
        if (data.success && !data.data.initialized) {
          router.push('/setup');
        } else {
          setCheckingStatus(false);
        }
      } catch (error) {
        console.error('Failed to check setup status:', error);
        setCheckingStatus(false);
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

      toast.success('¡Acceso concedido!', {
        description: 'Redireccionando al panel principal...',
      });

      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);
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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md space-y-8 z-10 px-4 sm:px-6"
      >
        <div className="text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}
            className="mx-auto flex h-20 w-20 items-center justify-center"
          >
            <img
              src="/contfast-logo.png"
              alt="ContFast Enterprise"
              className="h-20 w-20 rounded-2xl object-cover shadow-2xl shadow-teal-900/40 ring-2 ring-teal-500/30"
            />
          </motion.div>
          <h2 className="mt-6 text-3xl font-display font-bold tracking-tight text-primary">
            ContFast <span className="text-amber-500">Enterprise</span>
          </h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            Facturación Electrónica e-CF Homologada DGII
          </p>
        </div>

        {/* Form Container with Glassmorphism */}
        <div className="bg-surface-container-low/60 backdrop-blur-xl border border-outline-variant/30 rounded-lg p-8 shadow-2xl">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            
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
                  className="block w-full rounded-md border-0 bg-background py-3 pl-10 pr-3 text-primary ring-1 ring-inset ring-outline-variant/30 placeholder:text-on-surface-variant/80 focus:ring-2 focus:ring-inset focus:ring-amber-500 sm:text-sm sm:leading-6 transition-all duration-200 outline-none"
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
                  className="block w-full rounded-md border-0 bg-background py-3 pl-10 pr-10 text-primary ring-1 ring-inset ring-outline-variant/30 placeholder:text-on-surface-variant/80 focus:ring-2 focus:ring-inset focus:ring-amber-500 sm:text-sm sm:leading-6 transition-all duration-200 outline-none"
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
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={loading}
              className="flex w-full justify-center items-center gap-2 rounded-md bg-amber-500 px-3 py-3 text-sm font-semibold text-slate-950 shadow-sm hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
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
            </motion.button>
          </form>
        </div>
      </motion.div>
    </RippleBackground>
  );
}
