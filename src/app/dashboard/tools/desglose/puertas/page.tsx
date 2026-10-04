'use client';

import { useState, useEffect, useRef } from 'react';
import { DoorOpen, RotateCcw, Printer, Plus, Layers, Save, Check, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/providers/confirm-provider';
import TablaPuertaComercial, { type TablaPuertaHandle } from './TablaPuertaComercial';
import { formatTimeDisplay } from '@/utils/fechasLocales';
import { CabeceraDePagina } from '@/components/ui/cabecera-de-pagina';
import { Button } from '@/components/ui/button';

export default function DesglosePuertasComercialesPage() {
  const confirm = useConfirm();
  const [ancho, setAncho] = useState('');
  const [altura, setAltura] = useState('');
  const [cantidad, setCantidad] = useState<number>(1);
  const [hojas, setHojas] = useState<number>(1);
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
    setHojas(1);
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
    setLastSavedTime(formatTimeDisplay(now));
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
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <CabeceraDePagina
            titulo="Desglose de Puertas Comerciales"
            descripcion="Cálculo técnico exacto de perfiles de aluminio y cristales para puertas comerciales."
            icono={<Layers />}
            acciones={<>
            <Button
              type="button"
              variant="secondary"
              onClick={handleSaveDraft}
            >
              <Save className="h-4 w-4" /> Borrador
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              onClick={handleLimpiar}
            >
              <RotateCcw className="h-4 w-4" /> Limpiar
            </Button>
            <Button
              type="button"
              variant="documento"
              onClick={handlePrint}
              disabled={isPrinting || itemsCount === 0}
            >
              {isPrinting ? (
                <div className="h-4 w-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
              ) : (
                <Printer className="h-4 w-4" />
              )}
              {isPrinting ? 'Generando PDF...' : 'Generar PDF'}
            </Button>
          </>}
          />
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
                        className="w-full h-11 px-4 text-base font-medium rounded-xl border border-slate-200 focus:border-[#C5A059] focus:ring-2 focus:ring-[#C5A059]/10 bg-white text-slate-800 transition placeholder:text-slate-300"
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
                        className="w-full h-11 px-4 text-base font-medium rounded-xl border border-slate-200 focus:border-[#C5A059] focus:ring-2 focus:ring-[#C5A059]/10 bg-white text-slate-800 transition placeholder:text-slate-300"
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
                        type="button"
                        aria-label="Disminuir cantidad"
                        className="w-12 flex items-center justify-center text-slate-500 hover:bg-slate-200/50 hover:text-slate-700 transition-colors font-medium border-r border-slate-200 active:bg-slate-200"
                        onClick={() => setCantidad(Math.max(1, cantidad - 1))}
                      >
                        -
                      </button>
                      <div className="flex-1 flex items-center justify-center bg-white font-bold text-slate-700 text-base">
                        {cantidad}
                      </div>
                      <button
                        type="button"
                        aria-label="Aumentar cantidad"
                        className="w-12 flex items-center justify-center text-slate-500 hover:bg-slate-200/50 hover:text-slate-700 transition-colors font-medium border-l border-slate-200 active:bg-slate-200"
                        onClick={() => setCantidad(cantidad + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 mt-4">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider pl-1 block">
                      Variaciones (Hojas)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setHojas(1)}
                        className={`h-11 rounded-xl font-bold text-sm transition border ${
                          hojas === 1
                            ? 'bg-[#003366] border-[#003366] text-white shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        1 Hoja
                      </button>
                      <button
                        type="button"
                        onClick={() => setHojas(2)}
                        className={`h-11 rounded-xl font-bold text-sm transition border ${
                          hojas === 2
                            ? 'bg-[#003366] border-[#003366] text-white shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        2 Hojas
                      </button>
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  size="lg"
                  className="w-full mt-4"
                  onClick={handleAdd}
                  disabled={!enable}
                >
                  <Plus className="h-5 w-5" />
                  Agregar al Desglose
                </Button>
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
              hojas={hojas}
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
