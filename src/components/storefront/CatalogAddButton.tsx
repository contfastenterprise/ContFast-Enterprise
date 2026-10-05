"use client";

import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { BotonTienda } from './BotonTienda';

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

  //  Lote 231: el boton de Spree, fino y en mayusculas; se rellena al pasar.
  //  Dice QUE producto anade: en la rejilla hay 87 iguales.
  //  Lote 282: el contorno de la tienda (`BotonTienda`), el mismo de la portada y la cotizacion.
  return (
    <BotonTienda
      type="button"
      variante="contorno"
      tamano="xs"
      onClick={(e) => {
        e.preventDefault(); // Por si está envuelto en un Link
        handleAddToCart();
      }}
      aria-label={`Añadir ${name} a mi cotización`}
    >
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      Cotizar
    </BotonTienda>
  );
}
