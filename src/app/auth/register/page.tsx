'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Shield, Mail, Lock, User, Loader2, Sparkles, CheckCircle, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Toaster, toast } from 'sonner';

const registerSchema = z.object({
  fullName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  email: z.string().email('Formato de correo electrónico inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  confirmPassword: z.string().min(6, 'Debe confirmar su contraseña'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: values.fullName,
          email: values.email,
          password: values.password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Error en el registro.');
      }

      toast.success('¡Registro Exitoso!', {
        description: 'Tu cuenta ha sido creada correctamente.',
      });

      setSuccess(true);
    } catch (err: any) {
      toast.error('Error de registro', {
        description: err.message,
      });
      setLoading(false);
    }
  };

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
            Portal de Facturación Electrónica e-CF Homologado DGII
          </p>
        </div>

        {/* Success or Form State */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-lg p-8 shadow-2xl">
          {success ? (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center text-center space-y-6"
            >
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500 text-emerald-500 rounded-full flex items-center justify-center">
                <CheckCircle className="h-10 w-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Registro Completado</h3>
                <p className="text-sm text-slate-400 mt-2">
                  Tu cuenta ha sido creada exitosamente. Ya puedes iniciar sesión en la plataforma.
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => router.push('/auth/login')}
                className="flex w-full justify-center items-center gap-2 rounded-md bg-amber-500 px-3 py-3 text-sm font-semibold text-slate-950 shadow-sm hover:bg-amber-400"
              >
                Ir al Inicio de Sesión
                <ArrowRight className="h-4 w-4" />
              </motion.button>
            </motion.div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
              
              {/* Full Name */}
              <div className="space-y-1">
                <label htmlFor="fullName" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Nombre Completo
                </label>
                <div className="relative rounded-md shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                    <User className="h-5 w-5" />
                  </div>
                  <input
                    id="fullName"
                    type="text"
                    required
                    {...register('fullName')}
                    className="block w-full rounded-md border-0 bg-slate-950 py-2.5 pl-10 pr-3 text-white ring-1 ring-inset ring-slate-800 placeholder:text-slate-600 focus:ring-2 focus:ring-inset focus:ring-amber-500 sm:text-sm sm:leading-6 transition-all duration-200 outline-none"
                    placeholder="Juan Pérez"
                  />
                </div>
                {errors.fullName && (
                  <p className="text-xs text-red-500 mt-0.5">{errors.fullName.message}</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label htmlFor="email" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Correo Electrónico de Trabajo
                </label>
                <div className="relative rounded-md shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    required
                    {...register('email')}
                    className="block w-full rounded-md border-0 bg-slate-950 py-2.5 pl-10 pr-3 text-white ring-1 ring-inset ring-slate-800 placeholder:text-slate-600 focus:ring-2 focus:ring-inset focus:ring-amber-500 sm:text-sm sm:leading-6 transition-all duration-200 outline-none"
                    placeholder="juan.perez@empresa.do"
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-red-500 mt-0.5">{errors.email.message}</p>
                )}
              </div>

              {/* Password */}
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
                    required
                    {...register('password')}
                    className="block w-full rounded-md border-0 bg-slate-950 py-2.5 pl-10 pr-3 text-white ring-1 ring-inset ring-slate-800 placeholder:text-slate-600 focus:ring-2 focus:ring-inset focus:ring-amber-500 sm:text-sm sm:leading-6 transition-all duration-200 outline-none"
                    placeholder="••••••••"
                  />
                </div>
                {errors.password && (
                  <p className="text-xs text-red-500 mt-0.5">{errors.password.message}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <label htmlFor="confirmPassword" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Confirmar Contraseña
                </label>
                <div className="relative rounded-md shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                    <Lock className="h-5 w-5" />
                  </div>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    {...register('confirmPassword')}
                    className="block w-full rounded-md border-0 bg-slate-950 py-2.5 pl-10 pr-3 text-white ring-1 ring-inset ring-slate-800 placeholder:text-slate-600 focus:ring-2 focus:ring-inset focus:ring-amber-500 sm:text-sm sm:leading-6 transition-all duration-200 outline-none"
                    placeholder="••••••••"
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="text-xs text-red-500 mt-0.5">{errors.confirmPassword.message}</p>
                )}
              </div>

              {/* Action Button */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="submit"
                disabled={loading}
                className="mt-6 flex w-full justify-center items-center gap-2 rounded-md bg-amber-500 px-3 py-3 text-sm font-semibold text-slate-950 shadow-sm hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Registrando cuenta...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Crear Cuenta
                  </>
                )}
              </motion.button>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-slate-800 text-center">
            <p className="text-sm text-slate-400">
              ¿Ya tienes una cuenta?
              <button
                onClick={() => router.push('/auth/login')}
                className="text-amber-500 font-bold ml-1 hover:underline outline-none"
              >
                Inicia Sesión
              </button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
