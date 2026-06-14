'use client';

import { useState, useEffect, useRef } from 'react';
import { Calculator, RotateCcw, Printer, Plus, Layers, Save, Trash2 } from 'lucide-react';
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

  const tablaRef = useRef<TablaDesgloseHandle>(null);
  const anchoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEnable(ancho !== '' && altura !== '');
  }, [ancho, altura]);

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
      toast.success('Historial limpiado');
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
    toast.success('Datos guardados localmente');
  };

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20 max-w-7xl mx-auto w-full">
      {/* Header header box */}
      <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-end items-center shadow-inner">
        <span className="text-white text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
          <Calculator className="h-3 w-3" /> Herramientas de Producción
        </span>
      </div>

      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-[#003366] flex items-center gap-2">
              Desglose de Ventanas
            </h1>
            <p className="text-on-surface-variant/70 text-sm mt-1">
              Cálculo automático de cortes para sistemas de ventanas corredizas
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleLimpiar}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors text-xs font-bold text-slate-700 bg-white"
            >
              <RotateCcw className="h-4 w-4" />
              Reiniciar
            </button>
            <button
              onClick={handleSaveDraft}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors text-xs font-bold text-slate-700 bg-white"
            >
              <Save className="h-4 w-4" />
              Guardar Borrador
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#005E63] text-white rounded-lg hover:bg-[#005E63]/90 transition-colors text-xs font-bold shadow-sm disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              {isPrinting ? 'Generando...' : 'Imprimir Reporte'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Panel de Entrada (Sidebar) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#003366]" />
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Configuración</h3>
              </div>
              <div className="p-6 space-y-5">
                {/* Selección de Sistema */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Sistema de Aluminio</label>
                  <div className="grid grid-cols-3 p-1 rounded-lg bg-slate-100 border border-slate-200">
                    {['TRAD', 'P-65', 'P-92'].map((name, idx) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setTab(idx);
                          // Reset vias if P-65 (only supports 2 and 3 vias)
                          if (idx === 1 && vias === 4) {
                            setVias(2);
                          }
                        }}
                        className={`text-xs font-bold py-2 rounded-md transition-all ${
                          tab === idx
                            ? 'bg-white text-[#003366] shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cantidad y Vías */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="cantidad" className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Cantidad</label>
                    <input
                      id="cantidad"
                      type="number"
                      min={1}
                      value={cantidad}
                      onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-slate-900 bg-white font-semibold text-center"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="vias" className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Vías</label>
                    <select
                      id="vias"
                      value={vias}
                      onChange={(e) => setVias(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-slate-900 bg-white font-semibold"
                    >
                      <option value="2">2 Vías</option>
                      <option value="3">3 Vías</option>
                      {(tab === 0 || tab === 2) && (
                        <option value="4">4 Vías</option>
                      )}
                    </select>
                  </div>
                </div>

                {/* Dimensiones */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label htmlFor="ancho" className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Ancho Base (Ancho)</label>
                    <input
                      id="ancho"
                      ref={anchoInputRef}
                      value={ancho}
                      onChange={(e) => setAncho(e.target.value)}
                      placeholder='Ej: 36 1/4"'
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 outline-none focus:border-[#C5A059] text-slate-900 bg-white font-mono text-center text-lg font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="altura" className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Altura</label>
                    <input
                      id="altura"
                      value={altura}
                      onChange={(e) => setAltura(e.target.value)}
                      placeholder='Ej: 48 1/2"'
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 outline-none focus:border-[#C5A059] text-slate-900 bg-white font-mono text-center text-lg font-bold"
                    />
                  </div>
                </div>

                <button
                  onClick={handleAdd}
                  disabled={!enable}
                  className="w-full py-3 rounded-lg bg-[#003366] hover:bg-[#003366]/90 text-white font-bold transition-all shadow-sm active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2 mt-4"
                >
                  <Plus className="h-5 w-5" />
                  Agregar a Tabla
                </button>
              </div>
            </div>
          </div>

          {/* Tabla de Resultados (Main) */}
          <div className="lg:col-span-8 space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Cortes Calculados</h3>
              </div>
              <div className="p-1">
                <TablaDesglose
                  ancho={ancho}
                  altura={altura}
                  cantidad={cantidad}
                  vias={vias}
                  limpiarCampos={handleLimpiarCampos}
                  tipoCorredera={tab}
                  ref={tablaRef}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
