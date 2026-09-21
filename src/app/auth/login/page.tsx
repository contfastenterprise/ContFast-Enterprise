'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Mail, Lock, Loader2, LogIn, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

import { RippleBackground } from '@/components/ui/interactive-ripple-background';
import { PageLoader } from '@/components/ui/PageLoader';
import { esquemaAcceso, motivoDelFallo, type DatosDeAcceso } from '@/services/auth/accesoDelUsuario';

type LoginFormValues = DatosDeAcceso;

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  // Lote 173: el motivo del fallo se enseña EN el formulario, no en un aviso
  // efimero en la otra punta de la pantalla. Quien no puede entrar esta
  // mirando los dos campos, no la esquina superior derecha.
  const [motivoDelError, setMotivoDelError] = useState<string | null>(null);

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

        // La respuesta puede no ser JSON (404 con HTML, redirect, error de un proxy
        // intermedio). Sin esta comprobacion, res.json() lanza un SyntaxError de
        // parseo que oculta la causa real. Ante una respuesta no valida se muestra
        // el login, igual que ya hacia el catch de mas abajo.
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) {
          console.error(
            `Failed to check setup status: respuesta no valida de /api/v1/setup/status ` +
            `(HTTP ${res.status}, content-type: ${contentType || 'ausente'})`
          );
          setCheckingStatus(false);
          return;
        }

        const data = await res.json();
        // Solo se redirige al wizard cuando la API afirma explicitamente que el
        // sistema no esta inicializado. Cualquier otra forma de respuesta deja
        // pasar al login en vez de mandar a /setup por una lectura ambigua.
        if (data.success && data.data?.initialized === false) {
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
    resolver: zodResolver(esquemaAcceso),
  });

  const onSubmit = async (values: LoginFormValues) => {
    setLoading(true);
    setMotivoDelError(null);
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

      // Lote 173: aqui habia un `toast.success('¡Acceso concedido!')` justo
      // antes de navegar: aparecia y se iba en el mismo instante. La senal de
      // que el acceso salio bien es que se entra.

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
    } catch (err: unknown) {
      // La cadena de `includes()` que habia aqui vive en
      // `services/auth/accesoDelUsuario.ts` desde el lote 173, donde se puede
      // probar: distinguir "no hay red" de "contraseña incorrecta" importa,
      // porque decirle lo segundo a quien se quedo sin wifi le hace dudar de
      // su contraseña.
      setMotivoDelError(motivoDelFallo(err instanceof Error ? err.message : err));
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
          <Loader2 className="h-8 w-8 animate-spin text-[#c5a059]" />
          <p className="text-on-surface-variant text-sm">Verificando estado del sistema...</p>
        </div>
      </div>
    );
  }

  return (
    <RippleBackground>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        // Lote 173: antes `justify-start min-h-screen` con `mt-20` y `mb-12`
        // fijos. En un portatil de 768px de alto, el logo de 450px empujaba el
        // boton fuera de la pantalla y habia que desplazarse para entrar. Ahora
        // el bloque se centra (RippleBackground ya da el alto) y los margenes
        // crecen con la pantalla en vez de estar clavados.
        className="w-full max-w-4xl flex flex-col items-center justify-center z-10 px-4 sm:px-6 py-8"
      >
        <div className="w-full text-center mb-8 sm:mb-10">
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 5 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.4, type: 'spring', stiffness: 250, damping: 25 }}
          >
            {/* La pagina no tenia ningun titulo: el logo es una imagen, y para
                un lector de pantalla eso no es un encabezado. */}
            <h1 className="sr-only">ContFast Enterprise — Acceso al sistema</h1>
            <img
              src="/Logo.svg"
              alt="ContFast Enterprise"
              className="mx-auto w-full max-w-[260px] sm:max-w-[340px] lg:max-w-[420px] object-contain drop-shadow-xl"
            />
          </motion.div>
        </div>

        {/* Form Container with Glassmorphism */}
        <div className="w-full max-w-md bg-surface-container-low/60 backdrop-blur-xl border border-outline-variant/30 rounded-lg p-6 shadow-2xl relative z-10">
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>

            {/* Lote 173: el motivo del fallo, donde se esta mirando.
                `role="alert"` para que un lector de pantalla lo anuncie: antes
                era un toast en la esquina y quien no ve la pantalla no se
                enteraba de por que no habia entrado. */}
            {motivoDelError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{motivoDelError}</span>
              </div>
            )}

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
                  autoFocus
                  // Lote 173: sin `required`. Con el, el navegador disparaba su
                  // aviso NATIVO -- en ingles y con otro estilo -- antes de que
                  // zod llegara a hablar, asi que los mensajes en español que
                  // hay escritos no se veian nunca. El `noValidate` del form
                  // completa lo mismo.
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
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'error-password' : undefined}
                  {...register('password')}
                  className="block w-full rounded-md border-0 bg-background py-2 pl-10 pr-10 text-primary ring-1 ring-inset ring-outline-variant/30 placeholder:text-on-surface-variant/80 focus:ring-2 focus:ring-inset focus:ring-[#c5a059] sm:text-sm sm:leading-6 transition duration-200 outline-none"
                  placeholder="••••••••"
                />
                {/* Lote 173: el boton no decia nada y estaba fuera del tabulador.
                    Un lector de pantalla leia "boton" a secas, y quien navega
                    con teclado no podia usarlo. */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-on-surface-variant/70 hover:text-primary transition-colors rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c5a059]"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p id="error-password" className="text-xs text-red-600 mt-1">{errors.password.message}</p>
              )}
              {/* Lote 177: el enlace que el 173 dejo fuera a proposito, porque
                  entonces no habia a donde llevar. Ahora si. */}
              <div className="flex justify-end pt-1">
                <Link
                  href="/auth/forgot-password"
                  className="text-xs font-semibold text-on-surface-variant hover:text-[#c5a059] transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c5a059]"
                >
                  ¿Olvidó su contraseña?
                </Link>
              </div>
            </div>

            {/* Action Button */}
            <button
              type="submit"
              disabled={loading}
              // Lote 173: `amber-500` era otro dorado distinto del de la marca.
              // El panel entero usa #c5a059 (458 sitios): se entraba con un
              // color y se aterrizaba en otro.
              className="flex w-full justify-center items-center gap-2 rounded-md bg-[#c5a059] px-3 py-2.5 text-sm font-semibold text-[#001e40] shadow-sm hover:bg-[#b18f4d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c5a059] disabled:opacity-50 disabled:cursor-not-allowed transition-[background-color,transform,box-shadow] duration-200 ease-out hover:scale-[1.02] active:scale-[0.98] active:duration-100 motion-reduce:transform-none motion-reduce:transition-none"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  Verificando credenciales...
                </>
              ) : (
                <>
                  {/* Chispas para entrar a un sistema contable desentonaba con
                      la sobriedad del resto. */}
                  <LogIn className="h-5 w-5" aria-hidden="true" />
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
