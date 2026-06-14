'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Maximize, Plus, Trash2, RotateCw, Calculator, Info, AlertTriangle, Printer, Save } from 'lucide-react';
import { toast } from 'sonner';
import { parseFraction, formatFraction } from '@/utils/calculos';
import { optimizeGlassCutting, type GlassPiece } from '@/utils/cuttingOptimizer';

export default function GlassCuttingPage() {
  // Main sheet dimensions in inches (stored as strings for fraction entry)
  const [sheetWidthInput, setSheetWidthInput] = useState<string>('96');
  const [sheetHeightInput, setSheetHeightInput] = useState<string>('72');
  const [bladeWidthInput, setBladeWidthInput] = useState<string>('0.125'); // default 1/8"

  // List of pieces to cut
  const [pieces, setPieces] = useState<GlassPiece[]>([]);

  // New piece entry
  const [newWidth, setNewWidth] = useState<string>('');
  const [newHeight, setNewHeight] = useState<string>('');
  const [newQty, setNewQty] = useState<string>('1');
  const [newLabel, setNewLabel] = useState<string>('');
  const [isPrinting, setIsPrinting] = useState(false);

  // Load from localstorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('cf_glass_cutting_pieces');
    if (saved) {
      try {
        setPieces(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load pieces from localStorage', e);
      }
    }
  }, []);

  const saveToLocalStorage = (updatedPieces: GlassPiece[]) => {
    localStorage.setItem('cf_glass_cutting_pieces', JSON.stringify(updatedPieces));
  };

  // Parsed numeric values for calculations
  const sheetWidth = useMemo(() => parseFraction(sheetWidthInput), [sheetWidthInput]);
  const sheetHeight = useMemo(() => parseFraction(sheetHeightInput), [sheetHeightInput]);
  const bladeWidth = useMemo(() => parseFraction(bladeWidthInput), [bladeWidthInput]);

  const addPiece = () => {
    const widthVal = parseFraction(newWidth);
    const heightVal = parseFraction(newHeight);

    if (!newWidth || !newHeight || widthVal <= 0 || heightVal <= 0) {
      toast.error("Medidas de corte inválidas");
      return;
    }

    const id = Math.random().toString(36).substring(2, 9);
    const colors = [
      '#005E63', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
      '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#d946ef', '#14b8a6'
    ];
    const randomColor = colors[pieces.length % colors.length];

    const newPiece: GlassPiece = {
      id,
      width: widthVal,
      height: heightVal,
      quantity: Number(newQty) || 1,
      label: newLabel || `Corte ${pieces.length + 1}`,
      color: randomColor
    };

    const updated = [...pieces, newPiece];
    setPieces(updated);
    saveToLocalStorage(updated);

    setNewWidth('');
    setNewHeight('');
    setNewLabel('');
    setNewQty('1');
    toast.success('Pieza agregada a la lista');
  };

  const removePiece = (id: string) => {
    const updated = pieces.filter(p => p.id !== id);
    setPieces(updated);
    saveToLocalStorage(updated);
    toast.success('Pieza eliminada');
  };

  const clearAll = () => {
    if (window.confirm('¿Desea limpiar todo el listado de cortes?')) {
      setPieces([]);
      localStorage.removeItem('cf_glass_cutting_pieces');
      toast.success('Listado limpiado');
    }
  };

  // Optimization Logic utilizing external module
  const optimizationResult = useMemo(() => {
    if (sheetWidth <= 0 || sheetHeight <= 0) {
      return { sheets: [], unplaced: [], totalUsedArea: 0, totalSheets: 0 };
    }
    return optimizeGlassCutting(pieces, sheetWidth, sheetHeight, bladeWidth);
  }, [pieces, sheetWidth, sheetHeight, bladeWidth]);

  const handlePrint = async () => {
    if (optimizationResult.sheets.length === 0) {
      toast.error("No hay cortes para imprimir");
      return;
    }

    try {
      setIsPrinting(true);
      const res = await fetch('/api/v1/tools/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'corte',
          data: optimizationResult.sheets,
          sheetWidth,
          sheetHeight
        })
      });

      const result = await res.json();
      if (res.ok && result.url) {
        window.open(result.url, '_blank');
        toast.success('Reporte generado exitosamente');
      } else {
        throw new Error(result.error || 'Error al generar PDF');
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20 max-w-7xl mx-auto w-full">
      {/* Header bar */}
      <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-end items-center shadow-inner">
        <span className="text-white text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
          <Calculator className="h-3 w-3" /> Herramientas de Producción
        </span>
      </div>

      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-[#003366] flex items-center gap-2">
              Optimizador de Corte de Vidrio
            </h1>
            <p className="text-on-surface-variant/70 text-sm mt-1">
              Planifica y distribuye cortes de vidrio de forma eficiente en pulgadas (in)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors text-xs font-bold text-slate-700 bg-white"
            >
              Limpiar Todo
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#005E63] text-white rounded-lg hover:bg-[#005E63]/90 transition-colors text-xs font-bold shadow-sm disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              {isPrinting ? 'Generando...' : 'Imprimir Patrón'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Sidebar */}
          <div className="xl:col-span-4 space-y-6">
            {/* Plancha Principal */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-2">
                <Maximize className="w-4 h-4 text-[#003366]" />
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Lámina de Vidrio</h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Ancho (pulg)</label>
                    <input
                      type="text"
                      value={sheetWidthInput}
                      onChange={(e) => setSheetWidthInput(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-slate-900 bg-white font-semibold font-mono text-center"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Alto (pulg)</label>
                    <input
                      type="text"
                      value={sheetHeightInput}
                      onChange={(e) => setSheetHeightInput(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-slate-900 bg-white font-semibold font-mono text-center"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Grosor de Sierra / Desperdicio (in)</label>
                  <input
                    type="text"
                    value={bladeWidthInput}
                    onChange={(e) => setBladeWidthInput(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-slate-900 bg-white font-semibold font-mono text-center"
                  />
                </div>
              </div>
            </div>

            {/* Agregar Cortes */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Agregar Cortes Requeridos</h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Etiqueta / Nombre</label>
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Ej: Ventana Cocina"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-slate-900 bg-white font-semibold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Ancho (pulg)</label>
                    <input
                      type="text"
                      value={newWidth}
                      onChange={(e) => setNewWidth(e.target.value)}
                      placeholder='Ej: 24 1/2'
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-slate-900 bg-white font-semibold font-mono text-center"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Alto (pulg)</label>
                    <input
                      type="text"
                      value={newHeight}
                      onChange={(e) => setNewHeight(e.target.value)}
                      placeholder='Ej: 36'
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-slate-900 bg-white font-semibold font-mono text-center"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="w-24 space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Cant.</label>
                    <input
                      type="number"
                      min={1}
                      value={newQty}
                      onChange={(e) => setNewQty(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-slate-900 bg-white font-semibold text-center"
                    />
                  </div>
                  <div className="flex-1 flex items-end">
                    <button
                      onClick={addPiece}
                      className="w-full py-2 bg-[#003366] text-white font-bold rounded-lg hover:bg-[#003366]/90 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" /> Agregar
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Listado de Requerimientos */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden max-h-[350px] overflow-y-auto">
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-3">
                <h3 className="font-bold text-slate-500 text-xs uppercase tracking-wider">Listado de Cortes</h3>
              </div>
              <div className="p-4 space-y-2">
                {pieces.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                    <Info className="w-5 h-5 mx-auto mb-1 opacity-40" />
                    <p className="text-xs">No hay piezas en el listado</p>
                  </div>
                ) : (
                  pieces.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-6 rounded-full" style={{ backgroundColor: p.color }} />
                        <div>
                          <div className="text-xs font-bold text-slate-800 uppercase">{p.label}</div>
                          <div className="text-[10px] text-slate-500">
                            {formatFraction(p.width)}" x {formatFraction(p.height)}" <span className="text-[#005E63] font-bold">x{p.quantity}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removePiece(p.id)}
                        className="p-1 text-slate-400 hover:text-red-500 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Main View Area */}
          <div className="xl:col-span-8 space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#003366]/5 border border-[#003366]/10 text-center flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Planchas Necesarias</span>
                <span className="text-2xl font-black text-[#003366]">{optimizationResult.totalSheets}</span>
              </div>
              <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/10 text-center flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Piezas Cortadas</span>
                <span className="text-2xl font-black text-green-600">
                  {optimizationResult.sheets.reduce((acc, s) => acc + s.placed.length, 0)}
                </span>
              </div>
              <div className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/10 text-center flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Piezas Sin Colocar</span>
                <span className="text-2xl font-black text-yellow-600">{optimizationResult.unplaced.length}</span>
              </div>
            </div>

            <div className="space-y-6">
              {optimizationResult.sheets.map((sheet, idx) => (
                <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-row items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">Plancha #{idx + 1}</h3>
                      <p className="text-[10px] text-slate-500 tracking-wider uppercase mt-0.5">
                        Aprovechamiento: <span className="text-[#005E63] font-bold">{(100 - sheet.wastePercent).toFixed(1)}%</span>
                      </p>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded bg-slate-200 text-slate-700">
                      Eficiencia: {(100 - sheet.wastePercent).toFixed(0)}%
                    </span>
                  </div>
                  <div className="p-6 bg-slate-100/30 flex items-center justify-center min-h-[350px] relative">
                    {sheetWidth > 0 && sheetHeight > 0 ? (
                      <div
                        className="relative border-2 border-slate-300 shadow bg-white overflow-hidden"
                        style={{
                          width: '100%',
                          maxWidth: '600px',
                          aspectRatio: `${sheetWidth} / ${sheetHeight}`,
                          position: 'relative'
                        }}
                      >
                        {sheet.placed.map((p, pIdx) => (
                          <div
                            key={pIdx}
                            className="absolute border border-black/20 flex flex-col items-center justify-center overflow-hidden hover:brightness-105 transition-all cursor-help"
                            style={{
                              left: `${(p.x / sheetWidth) * 100}%`,
                              top: `${(p.y / sheetHeight) * 100}%`,
                              width: `${((p.rotated ? p.height : p.width) / sheetWidth) * 100}%`,
                              height: `${((p.rotated ? p.width : p.height) / sheetHeight) * 100}%`,
                              backgroundColor: p.color || '#005E63',
                              opacity: 0.95
                            }}
                            title={`${p.label}: ${p.width}" x ${p.height}"`}
                          >
                            <div className="flex flex-col items-center p-0.5 text-center text-white font-bold leading-none">
                              <span className="text-[8px] sm:text-[10px] uppercase drop-shadow truncate max-w-full">
                                {p.label}
                              </span>
                              <span className="text-[7px] sm:text-[8px] opacity-90 drop-shadow whitespace-nowrap">
                                {formatFraction(p.width)}"* {formatFraction(p.height)}"
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{formatFraction(sheetWidth)}" ANCHO</div>
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] font-bold text-slate-400 tracking-widest uppercase">{formatFraction(sheetHeight)}" ALTO</div>
                  </div>
                </div>
              ))}
            </div>

            {optimizationResult.unplaced.length > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-500" />
                <div>
                  <h4 className="font-bold text-sm">Piezas no colocadas</h4>
                  <p className="text-xs mt-1">
                    Hay {optimizationResult.unplaced.length} piezas que no caben en la plancha debido a que sus dimensiones superan el tamaño máximo de {sheetWidth}" x {sheetHeight}".
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
