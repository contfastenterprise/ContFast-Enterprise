'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, Loader2, ArrowLeft, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

import { RippleBackground } from '@/components/ui/interactive-ripple-background';
import { esquemaPedirEnlace, type PedirEnlace } from '@/services/auth/recuperarAcceso';
import { motivoDelFallo } from '@/services/auth/accesoDelUsuario';

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [motivoDelError, setMotivoDelError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<PedirEnlace>({
    resolver: zodResolver(esquemaPedirEnlace),
  });

  const onSubmit = async (values: PedirEnlace) => {
    setLoading(true);
    setMotivoDelError(null);
    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'No se pudo enviar el enlace.');
      // El servidor responde lo mismo exista o no la cuenta; la pantalla
      // enseña ESA frase, sin añadirle nada que la desmienta.
      setEnviado(data.message as string);
    } catch (err: unknown) {
      setMotivoDelError(motivoDelFallo(err instanceof Error ? err.message : err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <RippleBackground>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-4xl flex flex-col items-center justify-center z-10 px-4 sm:px-6 py-8"
      >
        <div className="w-full text-center mb-8 sm:mb-10">
          <h1 className="sr-only">ContFast Enterprise — Recuperar contraseña</h1>
          <img
            src="/Logo.svg"
            alt="ContFast Enterprise"
            className="mx-auto w-full max-w-[260px] sm:max-w-[340px] lg:max-w-[420px] object-contain drop-shadow-xl"
          />
        </div>

        <div className="w-full max-w-md bg-surface-container-low/60 backdrop-blur-xl border border-outline-variant/30 rounded-lg p-6 shadow-2xl relative z-10">
          {enviado ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" aria-hidden="true" />
              <p role="status" className="text-sm text-on-surface-variant leading-relaxed">{enviado}</p>
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 text-xs font-semibold text-[#c5a059] hover:underline underline-offset-4"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver al acceso
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div>
                <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">
                  Recuperar contraseña
                </h2>
                <p className="text-xs text-on-surface-variant/80 mt-1 leading-snug">
                  Escriba el correo de su cuenta y le enviaremos un enlace para crear una nueva.
                </p>
              </div>

              {motivoDelError && (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{motivoDelError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="email" className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                  Correo Electrónico
                </label>
                <div className="relative rounded-md shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-on-surface-variant/70">
                    <Mail className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? 'error-email' : undefined}
                    {...register('email')}
                    className="block w-full rounded-md border-0 bg-background py-2 pl-10 pr-3 text-primary ring-1 ring-inset ring-outline-variant/30 placeholder:text-on-surface-variant/80 focus:ring-2 focus:ring-inset focus:ring-[#c5a059] sm:text-sm sm:leading-6 transition duration-200 outline-none"
                    placeholder="admin@empresa.com"
                  />
                </div>
                {errors.email && (
                  <p id="error-email" className="text-xs text-red-600 mt-1">{errors.email.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center items-center gap-2 rounded-md bg-[#c5a059] px-3 py-2.5 text-sm font-semibold text-[#001e40] shadow-sm hover:bg-[#b18f4d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c5a059] disabled:opacity-50 disabled:cursor-not-allowed transition-[background-color,transform] duration-200 ease-out hover:scale-[1.02] active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none"
              >
                {loading ? (
                  <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Enviando…</>
                ) : (
                  <><Send className="h-5 w-5" aria-hidden="true" /> Enviarme el enlace</>
                )}
              </button>

              <Link
                href="/auth/login"
                className="flex items-center justify-center gap-2 text-xs font-semibold text-on-surface-variant hover:text-[#c5a059] transition-colors"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver al acceso
              </Link>
            </form>
          )}
        </div>
      </motion.div>
    </RippleBackground>
  );
}
