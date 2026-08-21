"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Package, Mail, Lock, User, ArrowRight } from 'lucide-react';
import { Button } from '@/components/storefront/ui/client-button';
import { toast } from 'sonner';

export default function StorefrontRegisterPage() {
  const router = useRouter();
  const params = useParams<{ empresa: string }>();
  const empresaSlug = params.empresa;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await fetch('/api/storefront/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password, empresaSlug })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        toast.success('¡Cuenta creada con éxito!', {
          description: 'Tu sesión ha sido iniciada automáticamente.',
        });
        
        window.dispatchEvent(new Event('auth_updated'));
        
        router.push(`/${empresaSlug}/mi-cotizacion`);
        router.refresh();
      } else {
        toast.error(data.error?.message || 'Error al crear la cuenta');
      }
    } catch (err) {
      toast.error('Error de red al intentar registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-[#001e40]">
          Crear una Cuenta
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          ¿Ya tienes cuenta?{' '}
          <Link href={`/${empresaSlug}/login`} className="font-medium text-[#c5a059] hover:text-[#b08c4a]">
            Inicia sesión aquí
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm sm:rounded-xl border border-slate-200 sm:px-10">
          <form className="space-y-6" onSubmit={handleRegister}>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Nombre Completo
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="focus:ring-[#001e40] focus:border-[#001e40] block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 border bg-white"
                  placeholder="Juan Pérez"
                />
              </div>
            </div>

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
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="focus:ring-[#001e40] focus:border-[#001e40] block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 border bg-white"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-slate-950 bg-[#c5a059] hover:bg-[#b08c4a] h-12"
              >
                {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
                {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </div>
            
            <p className="text-xs text-center text-slate-500 mt-4">
              Al registrarte aceptas nuestros Términos de Servicio y Política de Privacidad.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
