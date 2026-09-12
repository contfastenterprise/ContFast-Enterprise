"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import clsx from 'clsx';
import { disponible, quedaAlgo, aCantidad } from '@/services/inventario/existencia';

interface ProductAutocompleteProps {
  dbProducts: any[];
  categories: any[];
  warehouses: any[];
  valueName: string;
  hasProduct: boolean;
  onSelect: (product: any) => void;
  onTextChange?: (text: string) => void;
  placeholder?: string;
  /**
   * El producto que la linea YA tiene. Sirve para dos cosas y las dos importan:
   *
   *  1. Saber a que producto pertenece `selectedWarehouseId`. El almacen que
   *     viene de fuera es el de la LINEA, y la linea tiene un producto: pintarlo
   *     como elegido en los demas productos de la lista no significaria nada.
   *  2. No volver a llamar a `onSelect` cuando el usuario solo cambia de
   *     almacen. `applyProductToLine` reescribe el precio desde la tarifa, asi
   *     que llamarlo de nuevo le borraria al usuario un precio puesto a mano.
   */
  selectedProductId?: string;
  /** El almacen que la linea ya tiene, o vacio si todavia no ha elegido ninguno. */
  selectedWarehouseId?: string;
  onWarehouseChange?: (warehouseId: string) => void;
  onClear?: () => void;
  showWarehouses?: boolean;
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
  selectedProductId,
  selectedWarehouseId,
  onWarehouseChange,
  onClear,
  showWarehouses = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [localSelectedWarehouse, setLocalSelectedWarehouse] = useState<Record<string, string>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updateCoords();
      window.addEventListener('scroll', updateCoords, true);
      window.addEventListener('resize', updateCoords);
    }
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        const dropdownElement = document.querySelector('.product-autocomplete-dropdown');
        if (dropdownElement && dropdownElement.contains(e.target as Node)) {
          return;
        }
        setIsOpen(false);
        setSearchQuery(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const displayValue = searchQuery !== null ? searchQuery : valueName;

  // ---------------------------------------------------------------------------
  // EXISTENCIA
  //
  // La cuenta NO se hace aqui. La hace `@/services/inventario/existencia`, que
  // es la misma que usa el servidor para aprobar un conduce y la misma que usa
  // el aviso en vivo de la pantalla de facturas.
  //
  // Aqui se respondia con una regla propia -- `minStock > 0 && cantidad <=
  // minStock` --, que es la que el servidor tenia ANTES de F1-04: con el minimo
  // en 0, que es el valor por defecto, un producto con CERO unidades pasaba sin
  // decir nada.
  //
  // Este sitio no conoce la cantidad pedida -- la linea todavia no la tiene --,
  // asi que lo unico que puede preguntar es `quedaAlgo`. Quien decide si
  // ALCANZA es el servidor, con la cantidad delante.
  // ---------------------------------------------------------------------------

  /** Un producto que no lleva inventario -- un servicio -- no esta en ningun almacen. */
  const llevaInventario = (p: any): boolean => p.tracksInventory !== false;

  const nivelEn = (p: any, wId: string) =>
    p.inventory?.find((i: any) => i.warehouseId === wId);

  const cantidadEn = (p: any, wId: string): number => aCantidad(nivelEn(p, wId)?.quantity);
  const minimoEn = (p: any, wId: string): number => aCantidad(nivelEn(p, wId)?.minStock);
  const disponibleEn = (p: any, wId: string): number => disponible(nivelEn(p, wId));

  /** Sin disponible = no queda nada que sacar. Un servicio nunca lo esta. */
  const sinDisponibleEn = (p: any, wId: string | undefined): boolean =>
    !!wId && llevaInventario(p) && !quedaAlgo(nivelEn(p, wId));

  // ---------------------------------------------------------------------------
  // EL ALMACEN DE UNA FILA SE DECIDE AQUI Y EN NINGUN OTRO SITIO
  //
  // Antes habia DOS decisiones y podian discrepar: el visto (el circulito) salia
  // del almacen con mas existencia, y el "este producto se puede elegir" salia de
  // `selectedWarehouseId`. Como en facturas ese prop nunca llega vacio -- la
  // pagina lo respalda con el almacen de la factura --, el visto podia estar en
  // el almacen B mientras el producto seguia gris por culpa del almacen A, y el
  // rotulo "Bajo Minimo" era el de un almacen que el usuario no estaba mirando.
  //
  // Ahora hay UNA sola funcion. Lo que decide el visto es lo mismo que decide el
  // aviso y lo mismo que se manda al formulario: no pueden discrepar porque no
  // hay dos sitios donde discrepar.
  // ---------------------------------------------------------------------------

  /** A falta de eleccion, el almacen del que MAS se puede sacar (no el que mas tiene). */
  const almacenConMasDisponible = (p: any): string | undefined => {
    let elegido: string | undefined = warehouses[0]?.id;
    let mayor = -Infinity;
    for (const w of warehouses) {
      const d = disponibleEn(p, w.id);
      if (d > mayor) {
        mayor = d;
        elegido = w.id;
      }
    }
    return elegido;
  };

  const almacenDeLaFila = (p: any): string | undefined => {
    // 1. Lo que el usuario acaba de pulsar aqui dentro.
    if (localSelectedWarehouse[p.id]) return localSelectedWarehouse[p.id];
    // 2. El almacen que la linea YA tiene, si esta fila es la del producto de la
    //    linea. Sin esto el desplegable mentia: una linea guardada con el almacen
    //    B se reabria con el visto en A.
    if (selectedProductId && p.id === selectedProductId && selectedWarehouseId) {
      return selectedWarehouseId;
    }
    // 3. Nadie ha elegido todavia.
    return almacenConMasDisponible(p);
  };

  /**
   * Elegir producto y almacen a la vez, que es lo unico que la linea entiende:
   * una linea con producto y sin almacen no se puede despachar.
   */
  const elegir = (p: any, wId: string | undefined, cerrar: boolean): void => {
    // Solo si cambia de producto: `applyProductToLine` reescribe el precio desde
    // la tarifa, y cambiar de almacen no es motivo para perder un precio puesto
    // a mano.
    if (p.id !== selectedProductId) onSelect(p);
    if (onWarehouseChange && wId) onWarehouseChange(wId);
    if (cerrar) {
      setIsOpen(false);
      setSearchQuery(null);
    }
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
            value={displayValue || ''}
            onFocus={() => {
              setIsOpen(true);
              setSearchQuery('');
            }}
            onChange={(e) => {
              const val = e.target.value;
              setSearchQuery(val);
              if (onTextChange) {
                onTextChange(val);
              }
              setIsOpen(true);
            }}
            className="w-full rounded-lg bg-white border border-slate-300 py-1.5 px-3 pr-8 text-[#003366] focus:border-[#C5A059] outline-none text-xs transition truncate"
            placeholder={placeholder}
            title={displayValue || placeholder}
            required
          />
          {hasProduct ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onClear) onClear();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100 transition outline-none"
              title="Borrar artículo seleccionado"
            >
              <X className="h-3.5 w-3.5 text-slate-400 hover:text-rose-500" />
            </button>
          ) : (
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          )}

          {/* Autocomplete Dropdown Panel */}
          {mounted && isOpen && createPortal(
            <div 
              style={{
                position: 'absolute',
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                width: `${showWarehouses ? Math.max(750, coords.width) : Math.max(500, coords.width)}px`,
                zIndex: 9999
              }}
              className="product-autocomplete-dropdown max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-2xl divide-y divide-slate-100 text-sm"
            >
              {/* Sticky Dropdown Table Header */}
              <div className="sticky top-0 bg-slate-100 border-b border-slate-200 px-3 py-1.5 flex flex-col gap-0.5 z-10 select-none">
                <div className="flex items-center justify-between gap-4 text-[10px] font-bold text-[#003366] uppercase tracking-wider">
                  <span className="flex-1 min-w-0">Producto — clic para añadirlo</span>
                  {showWarehouses && <span className="shrink-0 text-right text-[8px] text-[#C5A059] uppercase tracking-widest font-extrabold">Almacenes — clic para elegir de dónde sale</span>}
                </div>
                <div className="flex items-center justify-between gap-4 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-t border-slate-200/60 pt-0.5 mt-0.5">
                  <span className="flex-1 min-w-0 font-normal text-slate-400 text-[8px]">Nombre / SKU</span>
                  {showWarehouses && (
                    // Sin `w-1/2`: con cinco o mas almacenes el rotulo se
                    // encogia y dejaba de caer encima de su columna de numeros.
                    <div className="flex gap-4 justify-end shrink-0">
                      {warehouses.map(w => (
                        <span key={w.id} className="w-20 text-right truncate" title={w.name}>
                          {w.name}
                        </span>
                      ))}
                    </div>
                  )}
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
                        const wActivo = almacenDeLaFila(p);
                        const sinDisponible = sinDisponibleEn(p, wActivo);
                        const minActivo = wActivo ? minimoEn(p, wActivo) : 0;
                        const nombreActivo = warehouses.find(w => w.id === wActivo)?.name;

                        return (
                          <div
                            key={p.id}
                            className="w-full flex items-center justify-between gap-4 border-b border-slate-100 py-0.5 pr-2 hover:bg-slate-50/50"
                          >
                            {/* Product Info */}
                            <button
                              type="button"
                              onClick={() => elegir(p, wActivo, true)}
                              className="flex-1 text-left px-2 py-1.5 flex items-center min-w-0 outline-none select-none"
                              title={sinDisponible
                                ? `Clic para añadirlo. Aviso: no queda disponible${nombreActivo ? ` en ${nombreActivo}` : ''} — el conduce no se podrá aprobar hasta que entre mercancía.`
                                : 'Clic para añadirlo a la línea'}
                            >
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="font-semibold text-[#003366] break-words whitespace-normal">{p.name}</span>
                                  {/* Avisa, no prohibe: la propia pantalla de facturas ya
                                      dice que se puede facturar sin existencia y que lo
                                      que se frena es el conduce. Quien decide eso es el
                                      servidor, con la cantidad delante. */}
                                  {sinDisponible && (
                                    <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold bg-rose-100 text-rose-800 uppercase shrink-0">
                                      {minActivo > 0 ? `Bajo mínimo (mín: ${minActivo})` : 'Sin existencia'}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono truncate">
                                  {p.sku ? `SKU: ${p.sku}` : ''} {p.barcode ? `| Bar: ${p.barcode}` : ''}
                                </span>
                              </div>
                            </button>

                            {/* Almacenes: un clic elige, un doble clic elige y cierra. */}
                            {showWarehouses && (
                              <div className="flex gap-4 items-center justify-end shrink-0">
                                {warehouses.map(w => {
                                  const qty = cantidadEn(p, w.id);
                                  const minStk = minimoEn(p, w.id);
                                  const disp = disponibleEn(p, w.id);
                                  const isSelected = wActivo === w.id;
                                  const wSinDisponible = sinDisponibleEn(p, w.id);

                                  return (
                                    <button
                                      key={w.id}
                                      type="button"
                                      onClick={() => {
                                        setLocalSelectedWarehouse(prev => ({
                                          ...prev,
                                          [p.id]: w.id
                                        }));
                                        // Un clic YA elige. Antes solo movia el visto y
                                        // el formulario no se enteraba: el usuario veia
                                        // su almacen marcado y la linea se guardaba con
                                        // otro. No cierra, para poder comparar almacenes.
                                        elegir(p, w.id, false);
                                      }}
                                      onDoubleClick={() => elegir(p, w.id, true)}
                                      className={clsx(
                                        "w-20 text-right font-mono flex items-center justify-end gap-1.5 px-1 py-1.5 rounded transition-colors text-xs outline-none select-none hover:bg-slate-200/60",
                                        wSinDisponible ? "text-rose-600 font-semibold" : "text-slate-700 font-semibold"
                                      )}
                                      title={
                                        !llevaInventario(p)
                                          ? `${w.name}: es un servicio, no lleva inventario`
                                          : minStk > 0
                                            ? `${w.name}: ${qty.toFixed(2)} en almacén, ${minStk} a conservar — disponible ${disp.toFixed(2)}`
                                            : `${w.name}: ${qty.toFixed(2)} disponibles`
                                      }
                                    >
                                      <span>{qty.toFixed(2)}</span>
                                      <span className={clsx(
                                        "w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition",
                                        isSelected
                                          ? "border-amber-500 bg-amber-500 text-white text-[8px] font-bold"
                                          : "border-slate-300 bg-white"
                                      )}>
                                        {isSelected && "✓"}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>,
            document.body
          )}
        </div>
      </div>
    </div>
  );
};
