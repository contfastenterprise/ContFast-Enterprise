'use client';

import { useState, useEffect, useRef } from 'react';
import { DoorOpen, RotateCcw, Printer, Plus, Layers, Save, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/providers/confirm-provider';
import TablaPuertaComercial, { type TablaPuertaHandle } from './TablaPuertaComercial';

export default function DesglosePuertasComercialesPage() {
  const confirm = useConfirm();
  const [ancho, setAncho] = useState('');
  const [altura, setAltura] = useState('');
  const [cantidad, setCantidad] = useState<number>(1);
  const [enable, setEnable] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  
  const [itemsCount, setItemsCount] = useState(0);
  const [totalDoorUnits, setTotalDoorUnits] = useState(0);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  const tablaRef = useRef<TablaPuertaHandle>(null);
  const anchoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEnable(ancho !== '' && altura !== '');
  }, [ancho, altura]);

  useEffect(() => {
    const saved = localStorage.getItem('cf_desglose_puertas_comerciales');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setItemsCount(parsed.length);
        setTotalDoorUnits(parsed.reduce((acc: number, item: any) => acc + (item.cantidad || 0), 0));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const handleDataChange = (updatedItems: any[]) => {
    setItemsCount(updatedItems.length);
    setTotalDoorUnits(updatedItems.reduce((acc, item) => acc + (item.cantidad || 0), 0));
  };

  const handleLimpiarCampos = () => {
    setAncho('');
    setAltura('');
    setCantidad(1);
  };

  const handleLimpiar = async () => {
    await confirm({
      title: 'Confirmar limpieza',
      description: '¿Desea limpiar todos los campos e historial de corte? Esta acción no se puede deshacer.',
      action: async () => {
        handleLimpiarCampos();
        tablaRef.current?.limpiarTabla();
        localStorage.removeItem('cf_desglose_puertas_comerciales');
        setItemsCount(0);
        setTotalDoorUnits(0);
      },
      onSuccessMessage: 'Historial y campos limpiados',
    });
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
          type: 'desglose_puerta_comercial',
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
    localStorage.setItem('cf_desglose_puertas_comerciales', JSON.stringify(datos));
    const now = new Date();
    setLastSavedTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    toast.success('Datos guardados localmente');
  };

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 font-sans pb-16 w-full">
      <div className="bg-[#002244] w-full px-6 py-2 flex justify-between items-center shadow-sm">
        <span className="text-white/80 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2">
          <DoorOpen className="h-3.5 w-3.5 text-[#C5A059]" /> Herramientas de Producción / Puertas Comerciales
        </span>
        {lastSavedTime && (
          <span className="text-white/60 text-[10px] flex items-center gap-1.5">
            <Check className="h-3 w-3 text-emerald-400" /> Borrador guardado: {lastSavedTime}
          </span>
        )}
      </div>

      <div className="p-6 w-full space-y-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-[#003366]/5 rounded-xl text-[#003366]">
                <Layers className="h-6 w-6" />
              </span>
              <h1 className="text-2xl font-bold text-[#003366] tracking-tight">
                Desglose de Puertas Comerciales
              </h1>
            </div>
            <p className="text-slate-500 text-sm pl-12">
              Cálculo técnico exacto de perfiles de aluminio y cristales para puertas comerciales.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:pl-0 pl-12">
            <button
              onClick={handleSaveDraft}
              className="px-4 py-2 bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 shadow-sm"
            >
              <Save className="h-4 w-4 text-slate-400" /> Borrador
            </button>
            <button
              onClick={handleLimpiar}
              className="px-4 py-2 bg-white text-slate-600 border border-slate-200 hover:border-red-200 hover:bg-red-50 hover:text-red-600 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 shadow-sm"
            >
              <RotateCcw className="h-4 w-4 text-slate-400 group-hover:text-red-500" /> Limpiar
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting || itemsCount === 0}
              className="px-5 py-2 bg-[#C5A059] hover:bg-[#B38D46] text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-sm shadow-[#C5A059]/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPrinting ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              {isPrinting ? 'Generando PDF...' : 'Generar PDF'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative">
              <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <div className="bg-blue-100/50 p-2 rounded-lg">
                  <Calculator className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-800 text-sm">Calculadora de Cortes</h2>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Puerta Comercial (1 hoja)</p>
                </div>
              </div>

              <div className="p-5 space-y-5">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider pl-1 block">
                        Ancho Base (in)
                      </label>
                      <input
                        ref={anchoInputRef}
                        type="text"
                        placeholder="Ej: 54 1/2"
                        className="w-full h-11 px-4 text-base font-medium rounded-xl border border-slate-200 focus:border-[#C5A059] focus:ring-2 focus:ring-[#C5A059]/10 bg-white text-slate-800 transition-all placeholder:text-slate-300"
                        value={ancho}
                        onChange={(e) => setAncho(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && enable) handleAdd();
                        }}
                      />
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider pl-1 block">
                        Altura Base (in)
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: 84 1/2"
                        className="w-full h-11 px-4 text-base font-medium rounded-xl border border-slate-200 focus:border-[#C5A059] focus:ring-2 focus:ring-[#C5A059]/10 bg-white text-slate-800 transition-all placeholder:text-slate-300"
                        value={altura}
                        onChange={(e) => setAltura(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && enable) handleAdd();
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider pl-1 block">
                      Cantidad de Puertas
                    </label>
                    <div className="flex bg-slate-50 border border-slate-200 rounded-xl overflow-hidden h-11">
                      <button 
                        className="w-12 flex items-center justify-center text-slate-500 hover:bg-slate-200/50 hover:text-slate-700 transition-colors font-medium border-r border-slate-200 active:bg-slate-200"
                        onClick={() => setCantidad(Math.max(1, cantidad - 1))}
                      >
                        -
                      </button>
                      <div className="flex-1 flex items-center justify-center bg-white font-bold text-slate-700 text-base">
                        {cantidad}
                      </div>
                      <button 
                        className="w-12 flex items-center justify-center text-slate-500 hover:bg-slate-200/50 hover:text-slate-700 transition-colors font-medium border-l border-slate-200 active:bg-slate-200"
                        onClick={() => setCantidad(cantidad + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleAdd}
                  disabled={!enable}
                  className="w-full h-12 bg-[#003366] hover:bg-[#002244] disabled:bg-slate-100 disabled:text-slate-400 disabled:border disabled:border-slate-200 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 mt-4 shadow-sm"
                >
                  <Plus className="h-5 w-5" />
                  Agregar al Desglose
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-800">Resumen Rápido</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Total Puertas</div>
                  <div className="text-2xl font-bold text-slate-800">{totalDoorUnits}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Renglones</div>
                  <div className="text-2xl font-bold text-[#003366]">{itemsCount}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 flex flex-col min-h-[500px]">
            <TablaPuertaComercial
              ref={tablaRef}
              ancho={ancho}
              altura={altura}
              cantidad={cantidad}
              limpiarCampos={handleLimpiarCampos}
              onDataChange={handleDataChange}
            />
            {itemsCount === 0 && (
              <div className="flex-1 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-12 text-center bg-white/50">
                <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <DoorOpen className="h-8 w-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-1">Sin registros</h3>
                <p className="text-slate-500 text-sm max-w-sm">
                  Ingresa las medidas base de las puertas comerciales (ancho y alto) y presiona "Agregar al Desglose" para generar los cortes automáticamente.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
