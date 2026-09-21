'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Loader2, ArrowLeft, Eye, EyeOff, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { motion } from 'framer-motion';

import { RippleBackground } from '@/components/ui/interactive-ripple-background';
import { esquemaNuevaContrasena, type NuevaContrasena } from '@/services/auth/recuperarAcceso';
import { motivoDelFallo } from '@/services/auth/accesoDelUsuario';

function Formulario() {
  const router = useRouter();
  const token = useSearchParams().get('token') || '';
  const [loading, setLoading] = useState(false);
  const [listo, setListo] = useState(false);
  const [verClave, setVerClave] = useState(false);
  const [motivoDelError, setMotivoDelError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<NuevaContrasena>({
    resolver: zodResolver(esquemaNuevaContrasena),
    defaultValues: { token, password: '', confirmacion: '' },
  });

  const onSubmit = async (values: NuevaContrasena) => {
    setLoading(true);
    setMotivoDelError(null);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'No se pudo cambiar la contraseña.');
      setListo(true);
      // Se manda al acceso, no al panel: la contraseña cambio y las sesiones
      // abiertas se cerraron, asi que hay que entrar de nuevo.
      setTimeout(() => router.push('/auth/login'), 2500);
    } catch (err: unknown) {
      setMotivoDelError(motivoDelFallo(err instanceof Error ? err.message : err));
    } finally {
      setLoading(false);
    }
  };

  if (listo) {
    return (
      <div className="text-center space-y-4">
        <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" aria-hidden="true" />
        <p role="status" className="text-sm text-on-surface-variant leading-relaxed">
          Contraseña actualizada. Se cerraron las sesiones que había abiertas; entre de nuevo con la contraseña nueva.
        </p>
        <Link href="/auth/login" className="inline-flex items-center gap-2 text-xs font-semibold text-[#c5a059] hover:underline underline-offset-4">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Ir al acceso
        </Link>
      </div>
    );
  }

  // Sin token no hay nada que hacer: se dice y se ofrece pedir otro, en vez de
  // enseñar un formulario que va a fallar al enviarlo.
  if (!token) {
    return (
      <div className="text-center space-y-4">
        <AlertCircle className="h-10 w-10 text-red-600 mx-auto" aria-hidden="true" />
        <p role="alert" className="text-sm text-on-surface-variant leading-relaxed">
          Este enlace no es válido. Solicite uno nuevo desde la pantalla de acceso.
        </p>
        <Link href="/auth/forgot-password" className="inline-flex items-center gap-2 text-xs font-semibold text-[#c5a059] hover:underline underline-offset-4">
          Pedir un enlace nuevo
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register('token')} />
      <div>
        <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">Nueva contraseña</h2>
        <p className="text-xs text-on-surface-variant/80 mt-1 leading-snug">
          Al guardarla se cerrarán las sesiones que tenga abiertas.
        </p>
      </div>

      {motivoDelError && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{motivoDelError}</span>
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="password" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
          Contraseña nueva
        </label>
        <div className="relative rounded-md shadow-sm">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-on-surface-variant/70">
            <Lock className="h-5 w-5" aria-hidden="true" />
          </div>
          <input
            id="password"
            type={verClave ? 'text' : 'password'}
            autoComplete="new-password"
            autoFocus
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'error-password' : undefined}
            {...register('password')}
            className="block w-full rounded-md border-0 bg-background py-2 pl-10 pr-10 text-primary ring-1 ring-inset ring-outline-variant/30 placeholder:text-on-surface-variant/80 focus:ring-2 focus:ring-inset focus:ring-[#c5a059] sm:text-sm sm:leading-6 transition duration-200 outline-none"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setVerClave(!verClave)}
            aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={verClave}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-on-surface-variant/70 hover:text-primary transition-colors rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c5a059]"
          >
            {verClave ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
        {errors.password && <p id="error-password" className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
      </div>

      <div className="space-y-1">
        <label htmlFor="confirmacion" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
          Repita la contraseña
        </label>
        <div className="relative rounded-md shadow-sm">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-on-surface-variant/70">
            <Lock className="h-5 w-5" aria-hidden="true" />
          </div>
          <input
            id="confirmacion"
            type={verClave ? 'text' : 'password'}
            autoComplete="new-password"
            aria-invalid={!!errors.confirmacion}
            aria-describedby={errors.confirmacion ? 'error-confirmacion' : undefined}
            {...register('confirmacion')}
            className="block w-full rounded-md border-0 bg-background py-2 pl-10 pr-3 text-primary ring-1 ring-inset ring-outline-variant/30 placeholder:text-on-surface-variant/80 focus:ring-2 focus:ring-inset focus:ring-[#c5a059] sm:text-sm sm:leading-6 transition duration-200 outline-none"
            placeholder="••••••••"
          />
        </div>
        {errors.confirmacion && <p id="error-confirmacion" className="text-xs text-red-600 mt-1">{errors.confirmacion.message}</p>}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex w-full justify-center items-center gap-2 rounded-md bg-[#c5a059] px-3 py-2.5 text-sm font-semibold text-[#001e40] shadow-sm hover:bg-[#b18f4d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c5a059] disabled:opacity-50 disabled:cursor-not-allowed transition-[background-color,transform] duration-200 ease-out hover:scale-[1.02] active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none"
      >
        {loading ? (
          <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Guardando…</>
        ) : (
          <><KeyRound className="h-5 w-5" aria-hidden="true" /> Guardar contraseña</>
        )}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <RippleBackground>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-4xl flex flex-col items-center justify-center z-10 px-4 sm:px-6 py-8"
      >
        <div className="w-full text-center mb-8 sm:mb-10">
          <h1 className="sr-only">ContFast Enterprise — Nueva contraseña</h1>
          <img
            src="/Logo.svg"
            alt="ContFast Enterprise"
            className="mx-auto w-full max-w-[260px] sm:max-w-[340px] lg:max-w-[420px] object-contain drop-shadow-xl"
          />
        </div>

        <div className="w-full max-w-md bg-surface-container-low/60 backdrop-blur-xl border border-outline-variant/30 rounded-lg p-6 shadow-2xl relative z-10">
          {/* `useSearchParams` obliga a un limite de Suspense en el build. */}
          <Suspense fallback={<div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-[#c5a059]" /></div>}>
            <Formulario />
          </Suspense>
        </div>
      </motion.div>
    </RippleBackground>
  );
}
