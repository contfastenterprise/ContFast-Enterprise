"use client";

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Package, Mail, Lock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/storefront/ui/client-button';
import { toast } from 'sonner';

export default function StorefrontLoginPage() {
  const router = useRouter();
  const params = useParams<{ empresa: string }>();
  const empresaSlug = params.empresa;
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Reutilizamos el endpoint existente del sistema
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        toast.success('¡Bienvenido!');
        
        // Disparamos un evento para que el header se entere de que hay sesión
        window.dispatchEvent(new Event('auth_updated'));
        
        // Redirigimos a la cotización o cuenta
        router.push(`/${empresaSlug}/mi-cotizacion`);
        router.refresh(); // Para refrescar layouts
      } else {
        toast.error(data.error?.message || 'Credenciales incorrectas');
      }
    } catch (err) {
      toast.error('Error de red al intentar iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-[#001e40]">
          Iniciar Sesión
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          ¿No tienes una cuenta?{' '}
          <Link href={`/${empresaSlug}/registro`} className="font-medium text-[#c5a059] hover:text-[#b08c4a]">
            Regístrate aquí
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm sm:rounded-xl border border-slate-200 sm:px-10">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Correo Electrónico
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="focus:ring-[#001e40] focus:border-[#001e40] block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 border bg-white"
                  placeholder="tu@correo.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="focus:ring-[#001e40] focus:border-[#001e40] block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 border bg-white"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-end">
              <div className="text-sm">
                <Link href="#" className="font-medium text-[#001e40] hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
            </div>

            <div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-slate-950 bg-[#c5a059] hover:bg-[#b08c4a] h-12"
              >
                {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
