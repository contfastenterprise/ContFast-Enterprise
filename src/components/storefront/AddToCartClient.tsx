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
import clsx from 'clsx';
import { BotonTienda } from './BotonTienda';
import { FOCO_TIENDA } from './botonTiendaVariantes';

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
      //  La cotizacion vive en el navegador del visitante: la tienda no tiene cuentas (lote 233).
      const currentCart: Renglon[] = JSON.parse(localStorage.getItem('storefront_cart') || '[]');

      const existingItemIndex = currentCart.findIndex((item) => item.productId === productId);

      if (existingItemIndex >= 0) {
        currentCart[existingItemIndex].quantity += quantity;
      } else {
        currentCart.push({
          productId,
          name,
          price, // No manda: la cotizacion toma el precio del catalogo en cada visita (lote 233).
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
            className={clsx('flex h-11 w-11 items-center justify-center text-slate-600 transition-colors hover:text-slate-900 disabled:opacity-30', FOCO_TIENDA)}>
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="w-12 text-center text-base text-slate-900" aria-live="polite">{quantity}</span>
          <button type="button" onClick={increment} aria-label="Una más"
            className={clsx('flex h-11 w-11 items-center justify-center text-slate-600 transition-colors hover:text-slate-900', FOCO_TIENDA)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <BotonTienda type="button" tamano="lg" onClick={handleAddToCart} className="flex-1 px-6">
          Añadir a mi cotización
        </BotonTienda>
        {children}
      </div>
      {/* Lote 282: decia "Al enviar tu cotización…", y desde el lote 233 la cotizacion no se envia:
          se arma en el navegador y se imprime o se guarda en PDF. */}
      <p className="text-xs text-slate-500">
        Tu cotización se guarda en este navegador para imprimirla o guardarla en PDF. El inventario y el tiempo de entrega se confirman al hacer el pedido.
      </p>
    </div>
  );
}
