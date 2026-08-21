"use client";

import { useState } from 'react';
import { Button } from '@/components/storefront/ui/client-button';
import { ShoppingCart, Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';

interface AddToCartProps {
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
}

export default function AddToCartClient({ productId, name, price, imageUrl }: AddToCartProps) {
  const [quantity, setQuantity] = useState(1);

  const increment = () => setQuantity(prev => prev + 1);
  const decrement = () => setQuantity(prev => (prev > 1 ? prev - 1 : 1));

  const handleAddToCart = () => {
    try {
      // Usaremos localStorage de forma provisional hasta que el usuario inicie sesión
      const currentCart = JSON.parse(localStorage.getItem('storefront_cart') || '[]');
      
      const existingItemIndex = currentCart.findIndex((item: any) => item.productId === productId);
      
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

      // Disparar evento para que el header actualice el contador (se implementará en Phase 4)
      window.dispatchEvent(new Event('cart_updated'));

    } catch (e) {
      toast.error('Error al agregar el producto');
    }
  };

  return (
    <div className="flex flex-col gap-4 mt-8">
      <div className="flex items-center gap-4">
        <span className="font-medium text-slate-700">Cantidad:</span>
        <div className="flex items-center border border-slate-300 rounded-md bg-white">
          <button 
            type="button" 
            onClick={decrement}
            className="p-2 text-slate-500 hover:text-[#001e40] hover:bg-slate-50 transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-12 text-center font-medium text-slate-900">{quantity}</span>
          <button 
            type="button" 
            onClick={increment}
            className="p-2 text-slate-500 hover:text-[#001e40] hover:bg-slate-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button 
          size="lg" 
          onClick={handleAddToCart}
          className="flex-1 bg-[#c5a059] hover:bg-[#b08c4a] text-slate-950 font-bold h-12"
        >
          <ShoppingCart className="h-5 w-5 mr-2" />
          Agregar a Mi Cotización
        </Button>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        * Al finalizar tu selección, enviaremos la solicitud para validar el inventario y tiempo de entrega.
      </p>
    </div>
  );
}
