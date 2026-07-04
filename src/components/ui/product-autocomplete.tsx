"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
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
}

export const ProductAutocomplete: React.FC<ProductAutocompleteProps> = ({
  dbProducts,
  categories,
  warehouses,
  valueName,
  hasProduct,
  onSelect,
  onTextChange,
  placeholder = "Escriba para buscar o seleccionar..."
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
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
      <div className="relative">
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
          className={clsx(
            "w-full rounded-lg bg-white border border-slate-300 py-1.5 px-3 text-[#003366] focus:border-[#C5A059] outline-none text-xs transition-all",
            !hasProduct && "pr-8"
          )}
          placeholder={placeholder}
          required
        />
        {!hasProduct && (
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        )}

        {/* Autocomplete Dropdown Panel */}
        {isOpen && (() => {
          return (
            <div className="absolute left-0 z-50 mt-1 max-h-60 w-[200%] md:w-[600px] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-2xl divide-y divide-slate-100 text-sm">
              {/* Sticky Dropdown Table Header */}
              <div className="sticky top-0 bg-slate-100 border-b border-slate-200 px-3 py-1.5 flex items-center justify-between text-[10px] font-bold text-[#003366] uppercase tracking-wider z-10">
                <span className="w-1/2">Producto / SKU</span>
                <div className="flex gap-4 w-1/2 justify-end">
                  {warehouses.map(w => (
                    <span key={w.id} className="w-20 text-right truncate" title={w.name}>
                      {w.name}
                    </span>
                  ))}
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
                      {prods.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            onSelect(p);
                            setIsOpen(false);
                            setSearchQuery(null);
                          }}
                          className="w-full text-left px-2 py-1.5 hover:bg-slate-100/80 rounded transition-colors flex items-center justify-between outline-none border-b border-slate-100"
                        >
                          <div className="flex flex-col min-w-0 w-1/2 pr-2">
                            <span className="font-semibold text-[#003366] truncate">{p.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono truncate">
                              {p.sku ? `SKU: ${p.sku}` : ''} {p.barcode ? `| Bar: ${p.barcode}` : ''}
                            </span>
                          </div>
                          <div className="flex gap-4 w-1/2 justify-end text-xs text-slate-500 font-mono shrink-0">
                            {warehouses.map(w => {
                              const inv = p.inventory?.find((i: any) => i.warehouseId === w.id);
                              const qty = inv ? parseFloat(inv.quantity) : 0;
                              return (
                                <span key={w.id} className="w-20 text-right whitespace-nowrap">
                                  {qty.toFixed(2)}
                                </span>
                              );
                            })}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
};
