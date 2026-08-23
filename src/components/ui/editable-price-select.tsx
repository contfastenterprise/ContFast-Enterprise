'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

export interface PriceTierOption {
  name: string;
  label: string;
  price: number;
}

interface EditablePriceSelectProps {
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  isBelowCost?: boolean;
  pCost?: number;
  tiers?: PriceTierOption[];
  className?: string;
}

export function EditablePriceSelect({
  value,
  onChange,
  disabled = false,
  isBelowCost = false,
  pCost = 0,
  tiers = [],
  className,
}: EditablePriceSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const validTiers = tiers.filter((t) => t.price > 0);

  return (
    <div className="relative group" ref={containerRef}>
      <div className="relative flex items-center">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          disabled={disabled}
          placeholder="0.00"
          className={clsx(
            "w-full rounded-lg border py-1.5 pl-2 pr-7 outline-none text-xs transition",
            disabled
              ? "bg-slate-100 border-slate-300 text-[#003366]/50 cursor-not-allowed"
              : isBelowCost
              ? "bg-red-50 border-red-500 text-red-700 focus:border-red-600 focus:ring-1 focus:ring-red-500"
              : "bg-white border-slate-300 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059]/30",
            className
          )}
          min={0}
          step="any"
          required
        />
        {validTiers.length > 0 && !disabled && (
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="absolute right-1 text-slate-400 hover:text-[#003366] p-1 focus:outline-none transition-colors"
            tabIndex={-1}
            title="Seleccionar Nivel de Precio"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && validTiers.length > 0 && (
        <div className="absolute top-full right-0 mt-1 z-40 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1 text-xs overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50">
            Niveles de Precio
          </div>
          <div className="max-h-48 overflow-y-auto">
            {validTiers.map((tier, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onChange(tier.price);
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-left hover:bg-amber-50 flex items-center justify-between transition-colors border-b border-slate-50 last:border-0"
              >
                <span className="font-semibold text-slate-700">{tier.label}</span>
                <span className="font-mono text-slate-600 font-bold text-[11px]">
                  RD$ {tier.price.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isBelowCost && (
        <div className="absolute top-full left-0 mt-1 hidden group-hover:block z-30 w-52 p-2 bg-red-100 border border-red-200 text-red-800 text-[10px] rounded shadow-lg">
          El precio ingresado no es permitido (Mínimo: RD$ {pCost.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
        </div>
      )}
    </div>
  );
}
