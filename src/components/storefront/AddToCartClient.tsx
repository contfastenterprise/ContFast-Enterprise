"use client";

/**
 * Cantidad y "Añadir a mi cotización" de la ficha de producto.
 *
 * Lote 231: al estilo de Spree — "CANTIDAD" con su selector y el boton ancho
 * y redondeado, con un hueco al lado (`children`) para el corazon de
 * favoritos. La logica de la cotizacion no cambia.
 */
import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';

interface AddToCartProps {
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  children?: React.ReactNode;
}

type Renglon = { productId: string; name: string; price: number; quantity: number; imageUrl: string | null; addedAt: string };

export default function AddToCartClient({ productId, name, price, imageUrl, children }: AddToCartProps) {
  const [quantity, setQuantity] = useState(1);

  const increment = () => setQuantity(prev => prev + 1);
  const decrement = () => setQuantity(prev => (prev > 1 ? prev - 1 : 1));

  const handleAddToCart = () => {
    try {
      // Usaremos localStorage de forma provisional hasta que el usuario inicie sesión
      const currentCart: Renglon[] = JSON.parse(localStorage.getItem('storefront_cart') || '[]');

      const existingItemIndex = currentCart.findIndex((item) => item.productId === productId);

      if (existingItemIndex >= 0) {
        currentCart[existingItemIndex].quantity += quantity;
      } else {
        currentCart.push({
          productId,
          name,
          price, // Ojo: en Phase 7 este precio se ignorará por seguridad, pero sirve para la UI temporal
          quantity,
          imageUrl,
          addedAt: new Date().toISOString()
        });
      }

      localStorage.setItem('storefront_cart', JSON.stringify(currentCart));

      toast.success('Agregado a tu cotización', {
        description: `${quantity} x ${name}`,
      });

      window.dispatchEvent(new Event('cart_updated'));

    } catch {
      toast.error('Error al agregar el producto');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p id="etiqueta-cantidad" className="mb-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-900">Cantidad</p>
        <div role="group" aria-labelledby="etiqueta-cantidad" className="inline-flex items-center border border-slate-300">
          <button type="button" onClick={decrement} aria-label="Una menos" disabled={quantity <= 1}
            className="flex h-11 w-11 items-center justify-center text-slate-600 transition-colors hover:text-slate-900 disabled:opacity-30">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-base text-slate-900" aria-live="polite">{quantity}</span>
          <button type="button" onClick={increment} aria-label="Una más"
            className="flex h-11 w-11 items-center justify-center text-slate-600 transition-colors hover:text-slate-900">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={handleAddToCart}
          className="h-12 flex-1 rounded-full bg-[#001e40] px-6 text-sm font-semibold uppercase tracking-[0.15em] text-white transition-colors hover:bg-[#00142a] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001e40] focus-visible:ring-offset-2">
          Añadir a mi cotización
        </button>
        {children}
      </div>
      <p className="text-xs text-slate-500">
        Al enviar tu cotización validamos el inventario y el tiempo de entrega.
      </p>
    </div>
  );
}
