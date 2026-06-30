"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/utils/cn";

export interface AutocompleteItem {
  id: string;
  name: string;
  subLabel?: string;
}

export interface AutocompleteSelectProps {
  items: AutocompleteItem[];
  value: string;
  onChange: (id: string, name: string) => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  dropdownClassName?: string;
}

export const AutocompleteSelect = ({
  items,
  value,
  onChange,
  placeholder = "Buscar...",
  loading = false,
  disabled = false,
  className,
  inputClassName,
  dropdownClassName,
}: AutocompleteSelectProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync searchQuery with the selected item name when value changes
  useEffect(() => {
    if (!value) {
      setSearchQuery("");
      return;
    }
    const selectedItem = items.find((item) => item.id === value);
    if (selectedItem) {
      setSearchQuery(selectedItem.name);
    }
  }, [value, items]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        // If query was typed but not selected, revert to current selection name
        const currentItem = items.find((item) => item.id === value);
        setSearchQuery(currentItem ? currentItem.name : "");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [value, items]);

  // Filter items based on search query
  const filteredItems = React.useMemo(() => {
    if (!searchQuery.trim() || items.find((i) => i.name === searchQuery && i.id === value)) {
      return items;
    }
    const query = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        (item.subLabel && item.subLabel.toLowerCase().includes(query))
    );
  }, [searchQuery, items, value]);

  const handleSelect = (item: AutocompleteItem) => {
    onChange(item.id, item.name);
    setSearchQuery(item.name);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("", "");
    setSearchQuery("");
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative flex items-center">
        <Search className="absolute left-3 top-3.5 w-4 h-4 text-neutral-400 pointer-events-none" />
        <input
          type="text"
          placeholder={loading ? "Cargando..." : placeholder}
          disabled={disabled || loading}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className={cn(
            "w-full pl-9 pr-9 py-2.5 border border-outline-variant/20 rounded-xl bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] text-sm text-primary transition-all",
            inputClassName
          )}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-3.5 hover:text-neutral-700 outline-none"
            title="Limpiar"
          >
            <X className="w-4 h-4 text-neutral-400 hover:text-rose-500 transition-colors" />
          </button>
        )}
      </div>

      {isOpen && filteredItems.length > 0 && (
        <div
          className={cn(
            "absolute z-50 mt-1.5 w-full bg-surface-bright border border-outline-variant/20 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-outline-variant/10",
            dropdownClassName
          )}
        >
          {filteredItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item)}
              className={cn(
                "w-full text-left px-4 py-3 hover:bg-surface-container-highest transition-colors flex flex-col gap-0.5 outline-none",
                value === item.id && "bg-[#c5a059]/10"
              )}
            >
              <span className="text-sm font-medium text-primary">{item.name}</span>
              {item.subLabel && (
                <span className="text-xs text-neutral-500 font-mono">
                  {item.subLabel}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
