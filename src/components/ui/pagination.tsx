import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "./button";
import { Select } from "./select";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className = "",
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const startItem = totalItems ? (currentPage - 1) * pageSize + 1 : undefined;
  const endItem = totalItems ? Math.min(currentPage * pageSize, totalItems) : undefined;

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 py-3 px-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 ${className}`}>
      {/* Items count & Page Size Selector */}
      <div className="flex items-center gap-4">
        {totalItems !== undefined && startItem !== undefined && endItem !== undefined ? (
          <span>
            Mostrando <strong className="font-semibold text-slate-900 dark:text-slate-100">{startItem}</strong> - <strong className="font-semibold text-slate-900 dark:text-slate-100">{endItem}</strong> de <strong className="font-semibold text-slate-900 dark:text-slate-100">{totalItems}</strong> registros
          </span>
        ) : (
          <span>
            Página <strong className="font-semibold text-slate-900 dark:text-slate-100">{currentPage}</strong> de <strong className="font-semibold text-slate-900 dark:text-slate-100">{safeTotalPages}</strong>
          </span>
        )}

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Filas:</span>
            <Select
              selectSize="sm"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="w-16 h-7 text-xs py-0 px-2"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          title="Primera página"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="gap-1 px-2.5"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Anterior</span>
        </Button>

        <span className="px-2 font-medium text-slate-700 dark:text-slate-300">
          {currentPage} / {safeTotalPages}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= safeTotalPages}
          className="gap-1 px-2.5"
        >
          <span className="hidden sm:inline">Siguiente</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(safeTotalPages)}
          disabled={currentPage >= safeTotalPages}
          title="Última página"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
