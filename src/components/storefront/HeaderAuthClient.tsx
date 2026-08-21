"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { User, LogOut } from 'lucide-react';
import { Button } from '@/components/storefront/ui/client-button';

export default function HeaderAuthClient({ empresaSlug }: { empresaSlug: string }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/v1/auth/me');
      const data = await res.json();
      if (res.ok && data.success && data.data?.user) {
        setIsAuthenticated(true);
        const firstName = data.data.user.name.split(' ')[0];
        setUserName(firstName);
      } else {
        setIsAuthenticated(false);
        setUserName(null);
      }
    } catch (e) {
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    checkAuth();
    window.addEventListener('auth_updated', checkAuth);
    return () => window.removeEventListener('auth_updated', checkAuth);
  }, []);

  if (isAuthenticated) {
    return (
      <Link href={`/${empresaSlug}/mi-cuenta`}>
        <Button className="bg-[#001e40] hover:bg-[#00142a] text-white">
          <User className="h-4 w-4 mr-2" />
          Hola, {userName}
        </Button>
      </Link>
    );
  }

  return (
    <Link href={`/${empresaSlug}/login`}>
      <Button className="bg-[#001e40] hover:bg-[#00142a] text-white">
        <User className="h-4 w-4 mr-2" />
        Iniciar Sesión
      </Button>
    </Link>
  );
}
