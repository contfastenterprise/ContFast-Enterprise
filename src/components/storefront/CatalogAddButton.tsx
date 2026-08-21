"use client";

import { Button } from '@/components/storefront/ui/client-button';
import { ShoppingCart, Plus } from 'lucide-react';
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

  return (
    <Button 
      size="sm" 
      onClick={(e) => {
        e.preventDefault(); // Por si está envuelto en un Link
        handleAddToCart();
      }}
      className="bg-[#c5a059] hover:bg-[#b08c4a] text-slate-950 font-semibold px-4 rounded-full flex items-center shadow-md hover:shadow-lg transition-all active:scale-95"
    >
      <ShoppingCart className="h-4 w-4 mr-1.5" />
      Agregar
    </Button>
  );
}
