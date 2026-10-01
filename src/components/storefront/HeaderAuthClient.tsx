"use client";

/**
 * El icono de la cuenta en la cabecera de la tienda.
 *
 * Lote 231: pasa a ser un icono, como en Spree (antes era un boton azul con
 * texto que no cabia junto a los demas). Lo que decia el texto lo dice ahora la
 * etiqueta: "Mi cuenta (Nombre)" o "Iniciar sesión". Y la respuesta se lee por
 * su estado (`leerRespuesta`, lote 227): antes un 5xx con pagina de error hacia
 * lanzar a `json()`.
 */
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { User } from 'lucide-react';
import { leerRespuesta } from '@/utils/leerRespuesta';

export default function HeaderAuthClient({ empresaSlug }: { empresaSlug: string }) {
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const leido = await leerRespuesta<{ data?: { user?: { name?: string } } }>(await fetch('/api/v1/auth/me'));
        const nombre = leido.bien ? leido.cuerpo.data?.user?.name : undefined;
        setUserName(nombre ? nombre.split(' ')[0] : null);
      } catch {
        setUserName(null);
      }
    };
    checkAuth();
    window.addEventListener('auth_updated', checkAuth);
    return () => window.removeEventListener('auth_updated', checkAuth);
  }, []);

  const entrado = userName !== null;
  return (
    <Link
      href={`/${empresaSlug}/${entrado ? 'mi-cuenta' : 'login'}`}
      aria-label={entrado ? `Mi cuenta (${userName})` : 'Iniciar sesión'}
      title={entrado ? `Hola, ${userName}` : 'Iniciar sesión'}
      className="relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full text-slate-900 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001e40]"
    >
      <User className="h-5 w-5" strokeWidth={1.5} />
      {entrado && <span className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" aria-hidden="true" />}
    </Link>
  );
}
