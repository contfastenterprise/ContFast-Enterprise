"use client";

import { Plus } from 'lucide-react';
import { toast } from 'sonner';

interface CatalogAddButtonProps {
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
}

export default function CatalogAddButton({ productId, name, price, imageUrl }: CatalogAddButtonProps) {
  const handleAddToCart = () => {
    try {
      const currentCart = JSON.parse(localStorage.getItem('storefront_cart') || '[]');
      const existingItemIndex = currentCart.findIndex((item: any) => item.productId === productId);
      
      if (existingItemIndex >= 0) {
        currentCart[existingItemIndex].quantity += 1;
      } else {
        currentCart.push({
          productId,
          name,
          price,
          quantity: 1,
          imageUrl,
          addedAt: new Date().toISOString()
        });
      }

      localStorage.setItem('storefront_cart', JSON.stringify(currentCart));
      
      toast.success('Agregado a tu cotización', {
        description: `1 x ${name}`,
      });

      window.dispatchEvent(new Event('cart_updated'));
    } catch (e) {
      toast.error('Error al agregar el producto');
    }
  };

  //  Lote 231: el boton de Spree, fino y en mayusculas; se rellena de azul
  //  marino al pasar. Dice QUE producto anade: en la rejilla hay 87 iguales.
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault(); // Por si está envuelto en un Link
        handleAddToCart();
      }}
      aria-label={`Añadir ${name} a mi cotización`}
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-900 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-900 transition-colors hover:border-[#001e40] hover:bg-[#001e40] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001e40] focus-visible:ring-offset-2"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      Cotizar
    </button>
  );
}
