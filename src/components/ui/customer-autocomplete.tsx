"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, X } from 'lucide-react';
import clsx from 'clsx';

interface CustomerAutocompleteProps {
  dbCustomers: any[];
  customerId: string;
  customerName: string;
  onSelect: (customer: any) => void;
  onTextChange?: (text: string) => void;
  onCreateNew?: () => void;
  onClear?: () => void;
  placeholder?: string;
}

export const CustomerAutocomplete: React.FC<CustomerAutocompleteProps> = ({
  dbCustomers,
  customerId,
  customerName,
  onSelect,
  onTextChange,
  onCreateNew,
  onClear,
  placeholder = "Ej: Distribuidora Comercial S.A."
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

  const displayValue = searchQuery !== null ? searchQuery : customerName;

  // Filter local customers
  const query = (searchQuery || '').toLowerCase().trim();
  const filteredCustomers = dbCustomers.filter(c => {
    if (!query) return true;
    return (
      c.name?.toLowerCase().includes(query) ||
      c.rncCedula?.toLowerCase().includes(query) ||
      c.phone?.toLowerCase().includes(query)
    );
  });

  return (
    <div ref={containerRef} className="relative customer-autocomplete-container w-full">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={displayValue}
            onFocus={() => {
              setIsOpen(true);
              setSearchQuery(customerName);
            }}
            onChange={(e) => {
              const val = e.target.value;
              setSearchQuery(val);
              if (onTextChange) {
                onTextChange(val);
              }
              setIsOpen(true);
            }}
            className="w-full rounded-lg bg-white border border-slate-300 py-2 px-3 pr-8 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-xs transition-all placeholder:text-on-surface-variant/80"
            placeholder={placeholder}
          />
          {customerId ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onClear) onClear();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100 transition-all outline-none"
              title="Borrar cliente seleccionado"
            >
              <X className="h-4 w-4 text-slate-400 hover:text-rose-500" />
            </button>
          ) : (
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          )}

          {/* Customer Autocomplete Dropdown */}
          {isOpen && (() => {
            return (
              <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-2xl divide-y divide-slate-100 text-sm">
                {filteredCustomers.length === 0 ? (
                  <div className="p-3 text-slate-500 text-center">No se encontraron clientes</div>
                ) : (
                  filteredCustomers.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onSelect(c);
                        setIsOpen(false);
                        setSearchQuery(null);
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-100/80 rounded transition-colors flex flex-col gap-0.5 outline-none"
                    >
                      <span className="font-semibold text-[#003366]">{c.name}</span>
                      <span className="text-xs text-slate-400 font-mono">
                        RNC: {c.rncCedula || '-'} {c.phone ? `| Tel: ${c.phone}` : ''}
                      </span>
                    </button>
                  ))
                )}
              </div>
            );
          })()}
        </div>
        {onCreateNew && (
          <button
            type="button"
            onClick={onCreateNew}
            className="flex items-center justify-center p-2 bg-amber-500 hover:bg-amber-600 border border-amber-600 rounded-lg text-slate-900 transition-all shadow-sm shrink-0 h-9 w-9"
            title="Nuevo Cliente"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
