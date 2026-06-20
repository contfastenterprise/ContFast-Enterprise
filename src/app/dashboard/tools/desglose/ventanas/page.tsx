'use client';

import { useState, useEffect, useRef } from 'react';
import { Calculator, RotateCcw, Printer, Plus, Layers, Save, Trash2, LayoutGrid, Info, Check, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import TablaDesglose, { type TablaDesgloseHandle } from './TablaDesglose';

export default function DesgloseVentanasPage() {
  const [ancho, setAncho] = useState('');
  const [altura, setAltura] = useState('');
  const [cantidad, setCantidad] = useState<number>(1);
  const [vias, setVias] = useState<number>(2);
  const [tab, setTab] = useState<number>(0);
  const [enable, setEnable] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  
  // State to track items locally for statistics/reactive UI updates
  const [itemsCount, setItemsCount] = useState(0);
  const [totalWindowUnits, setTotalWindowUnits] = useState(0);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  const tablaRef = useRef<TablaDesgloseHandle>(null);
  const anchoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEnable(ancho !== '' && altura !== '');
  }, [ancho, altura]);

  // Load initial stats from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('cf_desglose_ventanas');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setItemsCount(parsed.length);
        setTotalWindowUnits(parsed.reduce((acc: number, item: any) => acc + (item.cantidad || 0), 0));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const handleDataChange = (updatedItems: any[]) => {
    setItemsCount(updatedItems.length);
    setTotalWindowUnits(updatedItems.reduce((acc, item) => acc + (item.cantidad || 0), 0));
  };

  const handleLimpiarCampos = () => {
    setAncho('');
    setAltura('');
    setCantidad(1);
    setVias(2);
  };

  const handleLimpiar = () => {
    if (window.confirm('¿Desea limpiar todos los campos e historial de corte?')) {
      handleLimpiarCampos();
      tablaRef.current?.limpiarTabla();
      localStorage.removeItem('cf_desglose_ventanas');
      setItemsCount(0);
      setTotalWindowUnits(0);
      toast.success('Historial y campos limpiados');
    }
  };

  const handleAdd = () => {
    if (tablaRef.current) {
      tablaRef.current.agregarFila();
    }
    anchoInputRef.current?.focus();
  };

  const getTablaDatos = () => {
    if (tablaRef.current) {
      return tablaRef.current.getDatos();
    }
    return [];
  };

  const handlePrint = async () => {
    const datos = getTablaDatos();
    if (datos.length === 0) {
      toast.error('No hay registros en la tabla para imprimir');
      return;
    }

    try {
      setIsPrinting(true);
      const res = await fetch('/api/v1/tools/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'desglose',
          data: datos
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

  const handleSaveDraft = () => {
    const datos = getTablaDatos();
    if (datos.length === 0) {
      toast.error('No hay datos para guardar');
      return;
    }
    localStorage.setItem('cf_desglose_ventanas', JSON.stringify(datos));
    const now = new Date();
    setLastSavedTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    toast.success('Datos guardados localmente');
  };

  const titulosSistemas = ['Tradicional', 'P-65', 'P-92'];

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 font-sans pb-16 w-full">
      {/* Header Fino de Contexto */}
      <div className="bg-[#002244] w-full px-6 py-2 flex justify-between items-center shadow-sm">
        <span className="text-white/80 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2">
          <Calculator className="h-3.5 w-3.5 text-[#C5A059]" /> Herramientas de Producción / Carpintería de Aluminio
        </span>
        {lastSavedTime && (
          <span className="text-white/60 text-[10px] flex items-center gap-1.5">
            <Check className="h-3 w-3 text-emerald-400" /> Borrador guardado: {lastSavedTime}
          </span>
        )}
      </div>

      <div className="p-6 w-full space-y-6">
        {/* Encabezado Principal Rediseñado */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-[#003366]/5 rounded-xl text-[#003366]">
                <Layers className="h-6 w-6" />
              </span>
              <h1 className="text-2xl font-bold text-[#003366] tracking-tight">
                Optimizador & Desglose de Ventanas
              </h1>
            </div>
            <p className="text-slate-500 text-sm pl-12">
              Cálculo técnico exacto de perfiles de aluminio y cristales para sistemas de correderas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleLimpiar}
              className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all text-xs font-semibold text-slate-600 bg-white shadow-xs"
            >
              <RotateCcw className="h-4 w-4" />
              Limpiar Todo
            </button>
            <button
              onClick={handleSaveDraft}
              className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all text-xs font-semibold text-slate-600 bg-white shadow-xs"
            >
              <Save className="h-4 w-4 text-[#C5A059]" />
              Guardar Borrador
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#005E63] text-white rounded-xl hover:bg-[#004d51] transition-all text-xs font-bold shadow-md hover:shadow-lg disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              {isPrinting ? 'Generando PDF...' : 'Imprimir'}
            </button>
          </div>
        </div>

        {/* 1. Fila Horizontal Superior: Configuración Técnica (Ancho Completo) */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <LayoutGrid className="w-4 h-4 text-[#003366]" />
            <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Configuración Técnica</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
            {/* Selector de Sistema */}
            <div className="md:col-span-3 space-y-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Sistema de Ventana</label>
              <div className="grid grid-cols-3 p-1 rounded-xl bg-slate-50 border border-slate-200/60">
                {['TRAD', 'P-65', 'P-92'].map((name, idx) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setTab(idx);
                      if (idx === 1 && vias === 4) {
                        setVias(2);
                      }
                    }}
                    className={`text-xs font-bold py-2 rounded-lg transition-all flex items-center justify-center ${
                      tab === idx
                        ? 'bg-[#003366] text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Cantidad */}
            <div className="md:col-span-2 space-y-2">
              <label htmlFor="cantidad" className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Cantidad (Pzas)</label>
              <input
                id="cantidad"
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none text-slate-900 focus:border-[#003366] focus:bg-white transition-all font-bold text-center"
              />
            </div>

            {/* Vías / Hojas */}
            <div className="md:col-span-2 space-y-2">
              <label htmlFor="vias" className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Vías / Hojas</label>
              <select
                id="vias"
                value={vias}
                onChange={(e) => setVias(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none text-slate-900 focus:border-[#003366] focus:bg-white transition-all font-bold text-center"
              >
                <option value="2">2 Vías (2 Hojas)</option>
                <option value="3">3 Vías (3 Hojas)</option>
                {(tab === 0 || tab === 2) && (
                  <option value="4">4 Vías (4 Hojas)</option>
                )}
              </select>
            </div>

            {/* Ancho */}
            <div className="md:col-span-2 space-y-2">
              <label htmlFor="ancho" className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Ancho (W)</label>
              <div className="relative">
                <input
                  id="ancho"
                  ref={anchoInputRef}
                  value={ancho}
                  onChange={(e) => setAncho(e.target.value)}
                  placeholder='Ej: 48"'
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-2.5 text-sm outline-none text-slate-900 focus:border-[#C5A059] focus:bg-white transition-all font-mono text-center font-bold"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">pulg</span>
              </div>
            </div>

            {/* Alto */}
            <div className="md:col-span-2 space-y-2">
              <label htmlFor="altura" className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Alto (H)</label>
              <div className="relative">
                <input
                  id="altura"
                  value={altura}
                  onChange={(e) => setAltura(e.target.value)}
                  placeholder='Ej: 60"'
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-2.5 text-sm outline-none text-slate-900 focus:border-[#C5A059] focus:bg-white transition-all font-mono text-center font-bold"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">pulg</span>
              </div>
            </div>

            {/* Botón de Agregar */}
            <div className="md:col-span-1">
              <button
                onClick={handleAdd}
                disabled={!enable}
                className="w-full py-2.5 px-4 bg-[#003366] hover:bg-[#002244] text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-1.5 text-sm"
              >
                <Plus className="h-5 w-5" />
                <span>Add</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. Fila Media: Planilla de Cortes Calculados (Ancho Completo, Justo debajo de la Configuración) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden w-full">
          <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-[#005E63]/10 rounded-lg text-[#005E63]">
                <Layers className="w-4 h-4" />
              </span>
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Planilla de Cortes Calculados</h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Autoguardado activo
            </span>
          </div>
          <div className="p-4 w-full">
            <TablaDesglose
              ancho={ancho}
              altura={altura}
              cantidad={cantidad}
              vias={vias}
              limpiarCampos={handleLimpiarCampos}
              tipoCorredera={tab}
              ref={tablaRef}
              onDataChange={handleDataChange}
            />
          </div>
        </div>

        {/* 3. Fila Inferior: Simulador SVG + Resumen Estadístico (Lado a Lado, Mitad y Mitad) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Simulador */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-between">
            <div className="w-full flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#C5A059]" /> Vista Preliminar de Ventana
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold uppercase">
                {titulosSistemas[tab]}
              </span>
            </div>

            {/* SVG Renderer */}
            <div className="my-6 relative w-full aspect-[4/3] flex items-center justify-center bg-slate-50/50 rounded-xl border border-slate-100 p-4">
              <svg viewBox="0 0 240 180" className="w-full h-full max-h-[160px] drop-shadow-xs">
                <line x1="30" y1="20" x2="210" y2="20" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,3" />
                <path d="M 30 20 L 35 17 M 30 20 L 35 23 M 210 20 L 205 17 M 210 20 L 205 23" stroke="#94a3b8" strokeWidth="1" />
                <text x="120" y="15" textAnchor="middle" fill="#475569" className="text-[10px] font-mono font-bold">
                  {ancho ? ancho : 'W'}
                </text>

                <line x1="225" y1="30" x2="225" y2="150" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,3" />
                <path d="M 225 30 L 222 35 M 225 30 L 228 35 M 225 150 L 222 145 M 225 150 L 228 145" stroke="#94a3b8" strokeWidth="1" />
                <text x="235" y="94" textAnchor="middle" fill="#475569" className="text-[10px] font-mono font-bold" transform="rotate(90, 235, 94)">
                  {altura ? altura : 'H'}
                </text>

                <rect x="30" y="30" width="180" height="120" rx="3" fill="none" stroke="#334155" strokeWidth="3" />
                
                {vias === 2 && (
                  <>
                    <rect x="33" y="33" width="89" height="114" fill="#f1f5f9" fillOpacity="0.7" stroke="#64748b" strokeWidth="2" />
                    <rect x="118" y="33" width="89" height="114" fill="#e2e8f0" fillOpacity="0.7" stroke="#475569" strokeWidth="2" />
                    <path d="M 60 90 L 95 90 M 70 85 L 60 90 L 70 95 M 85 85 L 95 90 L 85 95" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M 145 90 L 180 90 M 155 85 L 145 90 L 155 95 M 170 85 L 180 90 L 170 95" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
                  </>
                )}

                {vias === 3 && (
                  <>
                    <rect x="33" y="33" width="60" height="114" fill="#f1f5f9" fillOpacity="0.7" stroke="#64748b" strokeWidth="2" />
                    <rect x="91" y="33" width="58" height="114" fill="#cbd5e1" fillOpacity="0.7" stroke="#334155" strokeWidth="2" />
                    <rect x="147" y="33" width="60" height="114" fill="#e2e8f0" fillOpacity="0.7" stroke="#475569" strokeWidth="2" />
                    <path d="M 50 90 L 75 90 M 60 86 L 50 90 L 60 94" stroke="#64748b" strokeWidth="1.2" />
                    <path d="M 165 90 L 190 90 M 180 86 L 190 90 L 180 94" stroke="#475569" strokeWidth="1.2" />
                  </>
                )}

                {vias === 4 && (
                  <>
                    <rect x="33" y="33" width="45" height="114" fill="#f1f5f9" fillOpacity="0.7" stroke="#64748b" strokeWidth="2" />
                    <rect x="76" y="33" width="45" height="114" fill="#e2e8f0" fillOpacity="0.7" stroke="#475569" strokeWidth="2" />
                    <rect x="119" y="33" width="45" height="114" fill="#cbd5e1" fillOpacity="0.7" stroke="#475569" strokeWidth="2" />
                    <rect x="162" y="33" width="45" height="114" fill="#f1f5f9" fillOpacity="0.7" stroke="#64748b" strokeWidth="2" />
                  </>
                )}

                <text x="120" y="160" textAnchor="middle" fill="#94a3b8" className="text-[8px] uppercase font-bold tracking-widest">riel inferior</text>
                <text x="120" y="42" textAnchor="middle" fill="#94a3b8" className="text-[8px] uppercase font-bold tracking-widest">cabezal</text>
              </svg>
            </div>

            <div className="flex gap-2 text-[10px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100 w-full">
              <Info className="h-4 w-4 text-[#003366] shrink-0" />
              <p>El simulador representa la distribución de hojas. Los cálculos de corte consideran los solapes exactos del sistema seleccionado.</p>
            </div>
          </div>

          {/* Resumen Estadístico */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col justify-between">
            <div className="w-full flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-[#C5A059]" /> Resumen de Lote Activo
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold uppercase">
                Metricas Generales
              </span>
            </div>

            <div className="grid grid-cols-2 gap-6 w-full my-6">
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipos Diferentes</span>
                <div className="text-3xl font-black text-[#003366]">{itemsCount}</div>
              </div>
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Ventanas</span>
                <div className="text-3xl font-black text-[#C5A059]">{totalWindowUnits} ud</div>
              </div>
            </div>

            <div className="space-y-3 text-xs w-full border-t border-slate-100 pt-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Unidad de Medida:</span>
                <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">PULGADAS (FTE)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Algoritmo de Vidrio:</span>
                <span className="text-slate-800 font-bold">Desglose 2D optimizado con solapes</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
