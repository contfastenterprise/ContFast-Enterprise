'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Search, Plus, Minus, Trash2, CreditCard, Wallet, Banknote, CheckCircle2, RefreshCw, X, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';

// ─── Types ──────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  code: string;
  price: string | number;
  taxRate: string | number;
  stock: string | number;
  categoryId: string;
}

interface CartItem extends Product {
  cartQuantity: number;
}

interface Category {
  id: string;
  name: string;
}

// ─── Format Helpers ─────────────────────────────────────────────────────────
const fmt = (val: number | string) =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(typeof val === 'string' ? parseFloat(val) : val);

const getSafeStock = (product: any): number => {
  if (!product || product.stock === undefined || product.stock === null) return 0;
  return parseFloat(product.stock.toString()) || 0;
};

export default function POSPage() {
  const router = useRouter();
  
  // ─── State ────────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Checkout state
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentType, setPaymentType] = useState<'cash' | 'credit' | 'bank_transfer'>('cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);

  // Default warehouse (In a real app, this might come from user settings or store config)
  const [warehouseId, setWarehouseId] = useState<string | null>(null);

  // ─── Load Data ────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch products, categories, and warehouses
        const [prodRes, catRes, whRes] = await Promise.all([
          fetch('/api/v1/products?per_page=100'),
          fetch('/api/v1/categories'),
          fetch('/api/v1/warehouses'),
        ]);
        
        const [prodData, catData, whData] = await Promise.all([
          prodRes.json(), catRes.json(), whRes.json()
        ]);
        
        if (prodData.success) setProducts(prodData.data);
        if (catData.success) setCategories(catData.data);
        if (whData.success && whData.data?.length > 0) {
          setWarehouseId(whData.data[0].id);
        }
      } catch (err) {
        toast.error('Error al cargar datos del POS');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // ─── Cart Logic ───────────────────────────────────────────────────────────
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        // Validate stock
        if (existing.cartQuantity + 1 > getSafeStock(existing)) {
          toast.error(`Stock insuficiente para ${product.name}`);
          return prev;
        }
        return prev.map(item => item.id === product.id ? { ...item, cartQuantity: item.cartQuantity + 1 } : item);
      }
      if (getSafeStock(product) <= 0) {
        toast.error(`Producto agotado: ${product.name}`);
        return prev;
      }
      return [...prev, { ...product, cartQuantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) => prev.map(item => {
      if (item.id === id) {
        const newQty = item.cartQuantity + delta;
        if (newQty <= 0) return item; // Handled by remove
        if (newQty > getSafeStock(item)) {
          toast.error(`Stock insuficiente para ${item.name}`);
          return item;
        }
        return { ...item, cartQuantity: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const clearCart = () => setCart([]);

  // ─── Totals ───────────────────────────────────────────────────────────────
  const { subtotal, taxTotal, total } = useMemo(() => {
    let sub = 0;
    let tax = 0;
    cart.forEach(item => {
      const price = typeof item.price === 'string' ? parseFloat(item.price) : item.price;
      const rate = typeof item.taxRate === 'string' ? parseFloat(item.taxRate) : item.taxRate;
      const lineSub = price * item.cartQuantity;
      sub += lineSub;
      tax += lineSub * rate;
    });
    return { subtotal: sub, taxTotal: tax, total: sub + tax };
  }, [cart]);

  const changeDue = useMemo(() => {
    if (paymentType !== 'cash') return 0;
    const received = parseFloat(amountReceived || '0');
    return received > total ? received - total : 0;
  }, [amountReceived, total, paymentType]);

  // ─── Filter Products ──────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = selectedCategory === 'all' || p.categoryId === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [products, searchQuery, selectedCategory]);

  // ─── Checkout Logic ───────────────────────────────────────────────────────
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseId) {
      toast.error('No hay almacén configurado.');
      return;
    }
    if (paymentType === 'cash' && parseFloat(amountReceived || '0') < total) {
      toast.error('El monto recibido es menor al total.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        warehouseId,
        ecfType: '32', // Consumo por defecto para POS
        paymentType,
        lines: cart.map(item => ({
          productId: item.id,
          productName: item.name,
          quantity: item.cartQuantity,
          unitPrice: typeof item.price === 'string' ? parseFloat(item.price) : item.price,
          discount: 0,
          taxRate: typeof item.taxRate === 'string' ? parseFloat(item.taxRate) : item.taxRate,
        })),
      };

      const res = await fetch('/api/v1/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al procesar la venta');
      }

      // Success
      setSuccessData(data.data);
      toast.success('Venta registrada exitosamente');
      clearCart();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetPOS = () => {
    setSuccessData(null);
    setShowCheckout(false);
    setAmountReceived('');
    setPaymentType('cash');
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <RefreshCw className="w-8 h-8 text-[#001e40] animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] bg-gray-50 flex overflow-hidden fixed top-14 left-0 right-0 z-40 md:left-72">
      {/* ── LEFT PANEL (Products) ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
        {/* Header / Search */}
        <div className="bg-white p-4 border-b border-gray-200 flex flex-col gap-4 shadow-sm z-10">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar producto por nombre o código..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-100 border-transparent rounded-xl focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-400 outline-none transition-all"
              />
            </div>
          </div>
          
          {/* Categories */}
          <div className="flex overflow-x-auto gap-2 pb-1 custom-scrollbar">
            <button
              onClick={() => setSelectedCategory('all')}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors border',
                selectedCategory === 'all' ? 'bg-[#001e40] text-white border-[#001e40]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              )}
            >
              Todos
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={clsx(
                  'px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors border',
                  selectedCategory === cat.id ? 'bg-[#001e40] text-white border-[#001e40]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map(product => {
              const stockNum = getSafeStock(product);
              const outOfStock = stockNum <= 0;
              return (
                <button
                  key={product.id}
                  disabled={outOfStock}
                  onClick={() => addToCart(product)}
                  className={clsx(
                    'bg-white rounded-xl p-4 border shadow-sm text-left flex flex-col h-full transition-all relative overflow-hidden',
                    outOfStock ? 'opacity-50 cursor-not-allowed border-gray-200' : 'border-gray-200 hover:border-amber-400 hover:shadow-md active:scale-[0.98]'
                  )}
                >
                  <div className="flex-1">
                    <p className="text-[10px] font-mono text-gray-500 mb-1">{product.code}</p>
                    <h3 className="font-bold text-[#001e40] leading-tight mb-2 line-clamp-2">{product.name}</h3>
                  </div>
                  <div className="mt-auto pt-3 border-t border-gray-50 flex items-end justify-between">
                    <p className="font-bold text-lg text-amber-600">{fmt(product.price)}</p>
                    <span className={clsx(
                      'text-[10px] font-bold px-2 py-0.5 rounded',
                      outOfStock ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                    )}>
                      {outOfStock ? 'Agotado' : `${stockNum} disp.`}
                    </span>
                  </div>
                </button>
              );
            })}
            {filteredProducts.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-500">
                <Tag className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No se encontraron productos.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL (Cart) ── */}
      <div className="w-96 bg-white border-l border-gray-200 flex flex-col shadow-xl z-20">
        {/* Cart Header */}
        <div className="p-4 border-b border-gray-200 bg-[#001e40] text-white flex justify-between items-center">
          <h2 className="font-display font-bold text-lg flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-amber-400" />
            Ticket de Venta
          </h2>
          {cart.length > 0 && (
            <button onClick={clearCart} className="p-2 text-white/70 hover:text-red-400 transition-colors" title="Vaciar Carrito">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar bg-gray-50/50">
          <AnimatePresence>
            {cart.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                <ShoppingCart className="w-16 h-16 opacity-20" />
                <p className="text-sm font-semibold">El carrito está vacío</p>
              </motion.div>
            ) : (
              cart.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20, transition: { duration: 0.15 } }}
                  className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm mb-2"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-sm text-[#001e40] leading-tight pr-4">{item.name}</h4>
                    <button onClick={() => removeFromCart(item.id)} className="text-gray-400 hover:text-red-500 p-1 -m-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex justify-between items-end">
                    <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                      <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 bg-white rounded flex items-center justify-center shadow-sm text-gray-600 hover:text-[#001e40]">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center font-bold text-sm font-mono">{item.cartQuantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 bg-white rounded flex items-center justify-center shadow-sm text-gray-600 hover:text-[#001e40]">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-[#001e40]">{fmt((typeof item.price === 'string' ? parseFloat(item.price) : item.price) * item.cartQuantity)}</p>
                      <p className="text-[10px] text-gray-500 font-mono">{fmt(item.price)} c/u</p>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Cart Totals & Actions */}
        <div className="bg-white border-t border-gray-200 p-4 shadow-[0_-4px_15px_rgba(0,0,0,0.02)]">
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span className="font-mono font-semibold">{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>ITBIS</span>
              <span className="font-mono font-semibold">{fmt(taxTotal)}</span>
            </div>
            <div className="h-px bg-gray-200 my-2" />
            <div className="flex justify-between items-end">
              <span className="font-bold text-gray-800">Total a Pagar</span>
              <span className="font-mono text-3xl font-black text-[#001e40] tracking-tight">{fmt(total)}</span>
            </div>
          </div>
          
          <button
            disabled={cart.length === 0}
            onClick={() => setShowCheckout(true)}
            className={clsx(
              "w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg",
              cart.length === 0 ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none" : "bg-amber-400 hover:bg-amber-500 text-[#001e40] hover:shadow-amber-400/20 active:scale-[0.98]"
            )}
          >
            <ShoppingCart className="w-5 h-5" />
            COBRAR
          </button>
        </div>
      </div>

      {/* ── CHECKOUT MODAL ── */}
      <AnimatePresence>
        {showCheckout && !successData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#001e40]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 bg-[#001e40] text-white flex justify-between items-center">
                <h3 className="font-bold text-xl flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-amber-400" /> Procesar Pago
                </h3>
                <button onClick={() => setShowCheckout(false)} className="text-white/70 hover:text-white transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex flex-1 overflow-hidden">
                {/* Payment Methods */}
                <div className="w-1/3 bg-gray-50 border-r border-gray-200 p-4 flex flex-col gap-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Método de Pago</p>
                  {[
                    { id: 'cash', label: 'Efectivo', icon: <Wallet className="w-5 h-5" /> },
                    { id: 'credit', label: 'Tarjeta', icon: <CreditCard className="w-5 h-5" /> },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setPaymentType(m.id as any)}
                      className={clsx(
                        "p-4 rounded-xl border-2 flex flex-col items-center gap-3 transition-all",
                        paymentType === m.id ? "border-[#001e40] bg-[#001e40]/5 text-[#001e40]" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                      )}
                    >
                      {m.icon}
                      <span className="font-bold text-sm">{m.label}</span>
                    </button>
                  ))}
                </div>

                {/* Amount Entry */}
                <form onSubmit={handleCheckout} className="w-2/3 p-8 flex flex-col justify-between">
                  <div>
                    <div className="text-center mb-8">
                      <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest">Total a Cobrar</p>
                      <p className="text-5xl font-black font-mono text-[#001e40] mt-2">{fmt(total)}</p>
                    </div>

                    {paymentType === 'cash' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-2">Monto Recibido</label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">RD$</span>
                            <input
                              type="number"
                              step="0.01"
                              min={total}
                              value={amountReceived}
                              onChange={(e) => setAmountReceived(e.target.value)}
                              className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl pl-12 pr-4 py-4 text-2xl font-mono font-bold focus:border-amber-400 focus:ring-0 outline-none transition-colors"
                              placeholder="0.00"
                              autoFocus
                              required
                            />
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center p-4 bg-gray-100 rounded-xl border border-gray-200">
                          <span className="font-bold text-gray-600">Cambio (Devuelta)</span>
                          <span className="text-2xl font-black font-mono text-emerald-600">{fmt(changeDue)}</span>
                        </div>
                        
                        {/* Quick amount buttons */}
                        <div className="grid grid-cols-4 gap-2 mt-4">
                          {[100, 500, 1000, 2000].map(amt => (
                            <button
                              type="button"
                              key={amt}
                              onClick={() => setAmountReceived(amt.toString())}
                              className="py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-[#001e40] hover:bg-amber-50 hover:border-amber-200 transition-colors"
                            >
                              ${amt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {paymentType === 'credit' && (
                      <div className="p-8 text-center bg-blue-50 border border-blue-100 rounded-xl">
                        <CreditCard className="w-12 h-12 text-blue-400 mx-auto mb-4" />
                        <p className="font-bold text-blue-900">Pago con Tarjeta</p>
                        <p className="text-sm text-blue-700 mt-2">Pase la tarjeta por el verifone y confirme el pago para continuar.</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-4 mt-8">
                    <button
                      type="button"
                      onClick={() => setShowCheckout(false)}
                      className="flex-1 py-4 font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || (paymentType === 'cash' && parseFloat(amountReceived || '0') < total)}
                      className="flex-[2] py-4 font-bold text-[#001e40] bg-amber-400 rounded-xl hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors shadow-lg shadow-amber-400/20"
                    >
                      {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                      {submitting ? 'Procesando...' : 'Confirmar Venta'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SUCCESS MODAL ── */}
      <AnimatePresence>
        {successData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#001e40]/80 backdrop-blur-md z-[60] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center flex flex-col items-center"
            >
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-black text-[#001e40] mb-2">¡Venta Exitosa!</h2>
              <p className="text-gray-500 mb-6 font-mono text-sm">NCF: {successData.ncf || 'Pendiente'}</p>
              
              <div className="w-full bg-gray-50 rounded-2xl p-4 mb-8">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-500 text-sm">Total Cobrado</span>
                  <span className="font-mono font-bold text-lg">{fmt(successData.total)}</span>
                </div>
                {paymentType === 'cash' && (
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                    <span className="text-gray-500 text-sm">Devuelta</span>
                    <span className="font-mono font-bold text-emerald-600">{fmt(changeDue)}</span>
                  </div>
                )}
              </div>

              <div className="w-full space-y-3">
                <button
                  onClick={resetPOS}
                  className="w-full py-4 bg-[#001e40] text-white rounded-xl font-bold hover:bg-[#003366] transition-colors"
                >
                  Nueva Venta
                </button>
              </div>

              {/* Hidden Print Trigger (Simulated for real environments) */}
              <div className="hidden">
                {/* 
                  Invoice print integration goes here. 
                  <InvoiceTicketPrint invoiceId={successData.id} autoPrint={true} />
                */}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
