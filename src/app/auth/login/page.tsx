'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Shield, Mail, Lock, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';

const loginSchema = z.object({
  email: z.string().email('Formato de correo electrónico inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

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

      const data = await response.json();

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
      toast.error('Error de autenticación', {
        description: err.message,
      });
      setLoading(false);
    }
  };

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
      
      {/* Decorative Glowing Gradients */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-900/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 -right-4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md space-y-8 z-10"
      >
        <div className="text-center">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-blue-950 border border-blue-900 text-amber-500 shadow-lg shadow-amber-500/10"
          >
            <Shield className="h-8 w-8" />
          </motion.div>
          <h2 className="mt-6 text-3xl font-display font-bold tracking-tight text-white">
            ContFast <span className="text-amber-500">Enterprise</span>
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Facturación Electrónica e-CF Homologada DGII
          </p>
        </div>

        {/* Form Container with Glassmorphism */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-lg p-8 shadow-2xl">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            
            {/* Email Field */}
            <div className="space-y-1">
              <label htmlFor="email" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Correo Electrónico
              </label>
              <div className="relative rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  {...register('email')}
                  className="block w-full rounded-md border-0 bg-slate-950 py-3 pl-10 pr-3 text-white ring-1 ring-inset ring-slate-800 placeholder:text-slate-600 focus:ring-2 focus:ring-inset focus:ring-amber-500 sm:text-sm sm:leading-6 transition-all duration-200 outline-none"
                  placeholder="admin@empresa.com"
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-1">
              <label htmlFor="password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Contraseña
              </label>
              <div className="relative rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  {...register('password')}
                  className="block w-full rounded-md border-0 bg-slate-950 py-3 pl-10 pr-3 text-white ring-1 ring-inset ring-slate-800 placeholder:text-slate-600 focus:ring-2 focus:ring-inset focus:ring-amber-500 sm:text-sm sm:leading-6 transition-all duration-200 outline-none"
                  placeholder="••••••••"
                />
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
    </div>
  );
}
