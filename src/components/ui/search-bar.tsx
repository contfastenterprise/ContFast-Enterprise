"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, X, CircleDot } from "lucide-react";
import { cn } from "@/utils/cn";

export interface SearchBarProps {
  placeholder?: string;
  /** Called when user submits or selects a suggestion */
  onSearch?: (query: string) => void;
  /** Called on every keystroke for real-time filtering */
  onChange?: (query: string) => void;
  /** Controlled value from outside */
  value?: string;
  /** Optional list of suggestion strings */
  suggestions?: string[];
  className?: string;
}

const SearchBar = ({
  placeholder = "Buscar...",
  onSearch,
  onChange,
  value,
  suggestions = [],
  className,
}: SearchBarProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [internalQuery, setInternalQuery] = useState(value ?? "");
  const [isFocused, setIsFocused] = useState(false);
  const [activeSuggestions, setActiveSuggestions] = useState<string[]>([]);

  // Sync controlled value
  useEffect(() => {
    if (value !== undefined) {
      setInternalQuery(value);
    }
  }, [value]);

  const searchQuery = value !== undefined ? value : internalQuery;

  // Filter suggestions
  useEffect(() => {
    if (suggestions.length > 0 && searchQuery.trim()) {
      setActiveSuggestions(
        suggestions.filter((item) =>
          item.toLowerCase().includes(searchQuery.toLowerCase())
        )
      );
    } else {
      setActiveSuggestions([]);
    }
  }, [searchQuery, suggestions]);

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (value === undefined) {
      setInternalQuery(val);
    }
    onChange?.(val);
  };

  const handleClear = () => {
    if (value === undefined) {
      setInternalQuery("");
    }
    onChange?.("");
    onSearch?.("");
    setActiveSuggestions([]);
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchQuery);
    }
    setIsFocused(false);
  };

  const handleSelectSuggestion = (suggestion: string) => {
    if (value === undefined) {
      setInternalQuery(suggestion);
    }
    onChange?.(suggestion);
    onSearch?.(suggestion);
    setIsFocused(false);
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <form onSubmit={handleSubmit} className="relative w-full">
        <Search className="absolute left-3 top-3.5 w-4 h-4 text-neutral-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          className="w-full pl-9 pr-9 py-2.5 border border-outline-variant/20 rounded-xl bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] text-sm text-primary transition-all placeholder:text-neutral-400"
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
      </form>

      {isFocused && activeSuggestions.length > 0 && (
        <div className="absolute z-55 mt-1.5 w-full bg-surface-bright border border-outline-variant/20 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-outline-variant/10">
          {activeSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleSelectSuggestion(suggestion)}
              className="w-full text-left px-4 py-3 hover:bg-surface-container-highest transition-colors flex items-center gap-2 outline-none"
            >
              <CircleDot className="w-4 h-4 text-[#c5a059]" />
              <span className="text-sm font-medium text-primary">{suggestion}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export { SearchBar };
