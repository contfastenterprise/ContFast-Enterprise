"use client";

import { useState, useEffect } from 'react';

export default function CartBadgeClient() {
  const [count, setCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const updateCount = () => {
      try {
        const cart = JSON.parse(localStorage.getItem('storefront_cart') || '[]');
        const totalItems = cart.reduce((acc: number, item: any) => acc + item.quantity, 0);
        setCount(totalItems);
      } catch (e) {
        setCount(0);
      }
    };

    // Carga inicial
    updateCount();

    // Escuchar actualizaciones
    window.addEventListener('cart_updated', updateCount);
    
    // Escuchar cambios de otra pestaña
    window.addEventListener('storage', (e) => {
      if (e.key === 'storefront_cart') {
        updateCount();
      }
    });

    return () => {
      window.removeEventListener('cart_updated', updateCount);
    };
  }, []);

  if (!mounted || count === 0) return null;

  return (
    <span className="absolute -top-2 -right-2 bg-[#ba1a1a] text-white text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center shadow-sm border-2 border-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}
