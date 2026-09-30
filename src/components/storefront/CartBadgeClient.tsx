"use client";

/**
 * El numero sobre el icono de Mi Cotizacion.
 *
 * Lote 231: el oyente de `storage` se ponia con una funcion anonima y nunca se
 * quitaba, asi que cada montaje dejaba uno mas escuchando. Y la cuenta ignora
 * lo que no es una cantidad: `storefront_cart` es texto que cualquiera puede
 * tocar, y un renglon roto daba `NaN` en el icono.
 */
import { useState, useEffect } from 'react';

function contar(): number {
  try {
    const cart: unknown = JSON.parse(localStorage.getItem('storefront_cart') || '[]');
    if (!Array.isArray(cart)) return 0;
    return cart.reduce((acc: number, item: { quantity?: unknown }) =>
      acc + (typeof item?.quantity === 'number' && item.quantity > 0 ? item.quantity : 0), 0);
  } catch {
    return 0;
  }
}

export default function CartBadgeClient() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const actualizar = () => setCount(contar());
    const deOtraPestana = (e: StorageEvent) => { if (e.key === 'storefront_cart') actualizar(); };
    actualizar();
    window.addEventListener('cart_updated', actualizar);
    window.addEventListener('storage', deOtraPestana);
    return () => {
      window.removeEventListener('cart_updated', actualizar);
      window.removeEventListener('storage', deOtraPestana);
    };
  }, []);

  if (count === 0) return null;

  return (
    <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#001e40] px-1 text-[10px] font-bold text-white" aria-hidden="true">
      {count > 99 ? '99+' : count}
    </span>
  );
}
