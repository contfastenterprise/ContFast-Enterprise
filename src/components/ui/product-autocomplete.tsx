"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import clsx from 'clsx';

interface ProductAutocompleteProps {
  dbProducts: any[];
  categories: any[];
  warehouses: any[];
  valueName: string;
  hasProduct: boolean;
  onSelect: (product: any) => void;
  onTextChange?: (text: string) => void;
  placeholder?: string;
  selectedWarehouseId?: string;
  onWarehouseChange?: (warehouseId: string) => void;
  onClear?: () => void;
}

export const ProductAutocomplete: React.FC<ProductAutocompleteProps> = ({
  dbProducts,
  categories,
  warehouses,
  valueName,
  hasProduct,
  onSelect,
  onTextChange,
  placeholder = "Escriba para buscar o seleccionar...",
  selectedWarehouseId,
  onWarehouseChange,
  onClear
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [localSelectedWarehouse, setLocalSelectedWarehouse] = useState<Record<string, string>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const displayValue = searchQuery !== null ? searchQuery : valueName;

  const getProductTotalStock = (p: any) => {
    return p.inventory?.reduce((acc: number, cur: any) => acc + (parseFloat(cur.quantity) || 0), 0) || 0;
  };

  const getActiveWarehouseId = (p: any) => {
    if (localSelectedWarehouse[p.id]) {
      return localSelectedWarehouse[p.id];
    }
    // Default to warehouse with highest stock
    let bestWarehouseId = warehouses[0]?.id;
    let maxStock = -1;
    warehouses.forEach(w => {
      const inv = p.inventory?.find((i: any) => i.warehouseId === w.id);
      const qty = inv ? parseFloat(inv.quantity) : 0;
      if (qty > maxStock) {
        maxStock = qty;
        bestWarehouseId = w.id;
      }
    });
    return bestWarehouseId;
  };

  // Filter local products
  const query = (searchQuery || '').toLowerCase().trim();
  const filteredProducts = dbProducts.filter(p => {
    if (!query) return true;
    return (
      p.name?.toLowerCase().includes(query) ||
      p.sku?.toLowerCase().includes(query) ||
      p.barcode?.toLowerCase().includes(query)
    );
  });

  // Group filtered products by category name
  const groupedProducts: Record<string, any[]> = {};
  filteredProducts.forEach(p => {
    const catName = categories.find(c => c.id === p.categoryId)?.name || 'Sin Categoría';
    if (!groupedProducts[catName]) {
      groupedProducts[catName] = [];
    }
    groupedProducts[catName].push(p);
  });

  return (
    <div ref={containerRef} className="relative product-autocomplete-container w-full">
      <div className="flex gap-1.5 items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={displayValue}
            onFocus={() => {
              setIsOpen(true);
              setSearchQuery(valueName);
            }}
            onChange={(e) => {
              const val = e.target.value;
              setSearchQuery(val);
              if (onTextChange) {
                onTextChange(val);
              }
              setIsOpen(true);
            }}
            className="w-full rounded-lg bg-white border border-slate-300 py-1.5 px-3 pr-8 text-[#003366] focus:border-[#C5A059] outline-none text-xs transition-all"
            placeholder={placeholder}
            required
          />
          {hasProduct ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onClear) onClear();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100 transition-all outline-none"
              title="Borrar artículo seleccionado"
            >
              <X className="h-3.5 w-3.5 text-slate-400 hover:text-rose-500" />
            </button>
          ) : (
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          )}

          {/* Autocomplete Dropdown Panel */}
          {isOpen && (() => {
            return (
              <div className="absolute left-0 z-50 mt-1 max-h-60 w-[200%] md:w-[600px] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-2xl divide-y divide-slate-100 text-sm">
                {/* Sticky Dropdown Table Header */}
                <div className="sticky top-0 bg-slate-100 border-b border-slate-200 px-3 py-1.5 flex flex-col gap-0.5 z-10 select-none">
                  <div className="flex items-center justify-between text-[10px] font-bold text-[#003366] uppercase tracking-wider">
                    <span className="w-1/2">Producto (Doble Clic para añadir)</span>
                    <span className="w-1/2 text-right text-[8px] text-[#C5A059] uppercase tracking-widest font-extrabold">Existencias en Almacenes</span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 uppercase tracking-wider border-t border-slate-200/60 pt-0.5 mt-0.5">
                    <span className="w-1/2 font-normal text-slate-400 text-[8px]">Nombre / SKU</span>
                    <div className="flex gap-4 w-1/2 justify-end">
                      {warehouses.map(w => (
                        <span key={w.id} className="w-20 text-right truncate" title={w.name}>
                          {w.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {Object.keys(groupedProducts).length === 0 ? (
                  <div className="p-3 text-slate-500 text-center">No se encontraron productos</div>
                ) : (
                  Object.entries(groupedProducts).map(([categoryName, prods]) => (
                    <div key={categoryName} className="p-1">
                      <div className="px-2 py-1 text-[10px] font-bold text-[#C5A059] uppercase bg-slate-50 rounded">
                        {categoryName}
                      </div>
                      <div className="space-y-0.5 mt-1">
                        {prods.map(p => {
                          const totalStock = getProductTotalStock(p);
                          const isOutOfStock = totalStock <= 0;
                          const activeWId = getActiveWarehouseId(p);

                          return (
                            <div
                              key={p.id}
                              className={clsx(
                                "w-full flex items-center justify-between border-b border-slate-100 py-0.5",
                                isOutOfStock ? "opacity-50 bg-slate-50/50" : "hover:bg-slate-50/50"
                              )}
                            >
                              {/* Product Info (Double click to select) */}
                              <button
                                type="button"
                                disabled={isOutOfStock}
                                onClick={() => {
                                  onSelect(p);
                                  if (onWarehouseChange && activeWId) {
                                    onWarehouseChange(activeWId);
                                  }
                                  setIsOpen(false);
                                  setSearchQuery(null);
                                }}
                                className="flex-1 text-left px-2 py-1.5 flex items-center min-w-0 pr-2 outline-none disabled:cursor-not-allowed select-none"
                                title="Clic para seleccionar"
                              >
                                <div className="flex flex-col min-w-0">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-semibold text-[#003366] truncate">{p.name}</span>
                                    {isOutOfStock && (
                                      <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold bg-rose-100 text-rose-800 uppercase shrink-0">
                                        Sin Stock
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-400 font-mono truncate">
                                    {p.sku ? `SKU: ${p.sku}` : ''} {p.barcode ? `| Bar: ${p.barcode}` : ''}
                                  </span>
                                </div>
                              </button>

                              {/* Warehouse Options (Single click checks, Double click selects) */}
                              <div className="flex gap-4 items-center pr-2">
                                {warehouses.map(w => {
                                  const inv = p.inventory?.find((i: any) => i.warehouseId === w.id);
                                  const qty = inv ? parseFloat(inv.quantity) : 0;
                                  const isSelected = activeWId === w.id && qty > 0;
                                  const isWarehouseDisabled = qty <= 0;

                                  return (
                                    <button
                                      key={w.id}
                                      type="button"
                                      disabled={isWarehouseDisabled}
                                      onClick={() => {
                                        setLocalSelectedWarehouse(prev => ({
                                          ...prev,
                                          [p.id]: w.id
                                        }));
                                      }}
                                      onDoubleClick={() => {
                                        onSelect(p);
                                        if (onWarehouseChange) {
                                          onWarehouseChange(w.id);
                                        }
                                        setIsOpen(false);
                                        setSearchQuery(null);
                                      }}
                                      className={clsx(
                                        "w-20 text-right font-mono flex items-center justify-end gap-1.5 px-1 py-1.5 rounded transition-colors text-xs outline-none select-none",
                                        isWarehouseDisabled
                                          ? "text-slate-300 cursor-not-allowed"
                                          : "hover:bg-slate-200/60 text-slate-700 font-semibold"
                                      )}
                                      title={`${w.name}: ${qty.toFixed(2)} (Doble clic para seleccionar)`}
                                    >
                                      <span>{qty.toFixed(2)}</span>
                                      <span className={clsx(
                                        "w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition-all",
                                        isSelected
                                          ? "border-amber-500 bg-amber-500 text-white text-[8px] font-bold"
                                          : isWarehouseDisabled
                                            ? "border-slate-200 bg-slate-50"
                                            : "border-slate-300 bg-white"
                                      )}>
                                        {isSelected && "✓"}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
