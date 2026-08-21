"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Package, Trash2, ArrowRight, ShoppingCart, Plus, Minus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/storefront/ui/client-button';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string | null;
  addedAt: string;
}

export default function CartPageClient({ empresaSlug }: { empresaSlug: string }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);

  const loadCart = () => {
    try {
      const cart = JSON.parse(localStorage.getItem('storefront_cart') || '[]');
      setItems(cart);
    } catch (e) {
      setItems([]);
    }
  };

  useEffect(() => {
    setMounted(true);
    loadCart();
    
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'storefront_cart') loadCart();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const saveCart = (newItems: CartItem[]) => {
    localStorage.setItem('storefront_cart', JSON.stringify(newItems));
    setItems(newItems);
    window.dispatchEvent(new Event('cart_updated'));
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    const newItems = items.map(item => 
      item.productId === productId ? { ...item, quantity: newQuantity } : item
    );
    saveCart(newItems);
  };

  const removeItem = (productId: string) => {
    const newItems = items.filter(item => item.productId !== productId);
    saveCart(newItems);
  };

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/storefront/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaSlug,
          items: items.map(i => ({ productId: i.productId, quantity: i.quantity }))
        })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        toast.success('¡Cotización enviada con éxito!', {
          description: `Número de referencia: ${data.data.sequenceNumber}`,
        });
        saveCart([]); // Vaciar carrito
        router.push(`/${empresaSlug}/mi-cuenta`);
      } else if (res.status === 401) {
        toast.error('Inicia sesión para enviar tu cotización');
        router.push(`/${empresaSlug}/login`);
      } else {
        toast.error(data.error?.message || 'Error al enviar la cotización');
      }
    } catch (e) {
      toast.error('Error de conexión al enviar la cotización');
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null; // Avoid hydration mismatch

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
        <ShoppingCart className="h-16 w-16 text-slate-200 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-[#001e40] mb-2">Tu cotización está vacía</h2>
        <p className="text-slate-500 mb-8 max-w-md mx-auto">
          Aún no has agregado productos. Explora nuestro catálogo y selecciona las soluciones ideales para tu espacio.
        </p>
        <Link href={`/${empresaSlug}/productos`}>
          <Button size="lg" className="bg-[#001e40] hover:bg-[#00142a] text-white">
            Explorar Catálogo
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </Link>
      </div>
    );
  }

  const subtotal = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Lista de Productos */}
      <div className="lg:col-span-2 space-y-4">
        {items.map((item) => (
          <div key={item.productId} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <div className="w-24 h-24 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain p-2 mix-blend-multiply" />
              ) : (
                <Package className="h-8 w-8 text-slate-300" />
              )}
            </div>
            
            <div className="flex-grow text-center sm:text-left">
              <h3 className="font-bold text-[#001e40] text-lg mb-1">{item.name}</h3>
              <p className="text-[#c5a059] font-bold">
                RD$ {item.price.toLocaleString('es-DO', { minimumFractionDigits: 2 })} <span className="text-sm font-normal text-slate-500">c/u</span>
              </p>
            </div>

            <div className="flex flex-col sm:items-end gap-3 w-full sm:w-auto">
              <div className="flex items-center justify-between sm:justify-end w-full gap-4">
                <div className="flex items-center border border-slate-200 rounded-md bg-slate-50">
                  <button 
                    onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                    className="p-1.5 text-slate-500 hover:text-[#001e40] hover:bg-slate-100 transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-10 text-center font-medium text-sm text-slate-900">{item.quantity}</span>
                  <button 
                    onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                    className="p-1.5 text-slate-500 hover:text-[#001e40] hover:bg-slate-100 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                
                <button 
                  onClick={() => removeItem(item.productId)}
                  className="text-red-400 hover:text-red-600 p-2 transition-colors"
                  title="Eliminar producto"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
              <div className="text-right w-full font-bold text-[#001e40]">
                RD$ {(item.price * item.quantity).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Resumen de Cotización */}
      <div className="lg:col-span-1">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sticky top-24">
          <h2 className="text-xl font-bold text-[#001e40] mb-6">Resumen Estimado</h2>
          
          <div className="space-y-3 text-sm mb-6">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal ({items.reduce((acc, i) => acc + i.quantity, 0)} items)</span>
              <span>RD$ {subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 mb-6">
            <div className="flex justify-between items-end">
              <span className="font-bold text-slate-900">Total Estimado</span>
              <span className="text-2xl font-extrabold text-[#001e40]">
                RD$ {subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2 text-right">* Impuestos incluidos según aplique.</p>
          </div>

          <div className="bg-blue-50 border border-blue-100 text-blue-800 rounded-lg p-4 flex gap-3 text-sm mb-6">
            <AlertCircle className="h-5 w-5 shrink-0 text-blue-600" />
            <p>Los productos seleccionados serán enviados como una solicitud de cotización. Nuestro equipo revisará tu selección y te enviará la cotización final oficial.</p>
          </div>

          <div className="space-y-3">
            <Button 
              onClick={handleCheckout} 
              disabled={loading}
              className="w-full bg-[#c5a059] hover:bg-[#b08c4a] text-slate-950 font-bold h-12 text-base flex justify-center items-center"
            >
              {loading ? 'Procesando...' : 'Enviar mi cotización'}
              {!loading && <ArrowRight className="ml-2 h-5 w-5" />}
            </Button>
            <Link href={`/${empresaSlug}/productos`} className="block w-full">
              <Button variant="outline" className="w-full h-12 text-[#001e40] border-slate-300 hover:bg-slate-50 font-semibold">
                Seguir comprando
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
