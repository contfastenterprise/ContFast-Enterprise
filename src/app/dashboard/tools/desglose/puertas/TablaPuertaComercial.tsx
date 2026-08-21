import React, { useState, forwardRef, useImperativeHandle, useCallback, useEffect } from 'react';
import { Trash2, Calculator, Edit2, Check, X, Tag, Ruler, KeySquare } from 'lucide-react';
import { toast } from 'sonner';
import { parseFraction, decimalToFraccion } from '@/utils/calculos';
import { commercialDoorProfiles } from '@/utils/commercialDoorRegistry';

export interface TablaPuertaHandle {
  agregarFila: () => void;
  getDatos: () => ItemPuerta[];
  limpiarTabla: () => void;
}

export interface ItemPuerta {
  id: string;
  cantidad: number;
  ancho: string;
  alto: string;
  lateral: string;
  dintel: string;
  jamba: string;
  ruleta: string;
  vidrioW: string;
  vidrioH: string;
  variaciones: string;
}

interface Props {
  ancho: string;
  altura: string;
  cantidad: number;
  limpiarCampos: () => void;
  onDataChange?: (datos: ItemPuerta[]) => void;
}

const TablaPuertaComercial = forwardRef<TablaPuertaHandle, Props>(
  ({ ancho, altura, cantidad, limpiarCampos, onDataChange }, ref) => {
    const [filas, setFilas] = useState<ItemPuerta[]>([]);

    const triggerDataChange = useCallback((updated: ItemPuerta[]) => {
      if (onDataChange) onDataChange(updated);
    }, [onDataChange]);

    useEffect(() => {
      const saved = localStorage.getItem('cf_desglose_puertas_comerciales');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFilas(parsed);
            triggerDataChange(parsed);
          }
        } catch (e) {
          console.error(e);
        }
      }
    }, [triggerDataChange]);

    useImperativeHandle(ref, () => ({
      agregarFila: () => {
        const intAncho = parseFraction(ancho);
        const intAltura = parseFraction(altura);

        if (!intAncho || !intAltura) {
          toast.error("Las medidas de ancho y alto son requeridas.");
          return;
        }

        const profileSystem = commercialDoorProfiles["Puerta Comercial"];
        const cuts = profileSystem.calculate(intAncho, intAltura, cantidad);

        const lateral = `${cuts.lateral.label} ${decimalToFraccion(cuts.lateral.value)}`;
        const dintel = `${cuts.dintel.label} ${decimalToFraccion(cuts.dintel.value)}`;
        const jamba = `${cuts.jamba.label} ${decimalToFraccion(cuts.jamba.value)}`;
        const ruleta = `${cuts.ruleta.label} ${decimalToFraccion(cuts.ruleta.value)}`;
        
        const vidrioW = `${cuts.vidrio.labelWidth} ${decimalToFraccion(cuts.vidrio.valueWidth)}`;
        const vidrioH = `${cuts.vidrio.labelHeight} ${decimalToFraccion(cuts.vidrio.valueHeight)}`;

        const nuevaFila: ItemPuerta = {
          id: Math.random().toString(36).substring(2, 9),
          cantidad,
          ancho,
          alto: altura,
          lateral,
          dintel,
          jamba,
          ruleta,
          vidrioW,
          vidrioH,
          variaciones: "1 hoja",
        };

        const updated = [...filas, nuevaFila];
        setFilas(updated);
        localStorage.setItem('cf_desglose_puertas_comerciales', JSON.stringify(updated));
        triggerDataChange(updated);
        limpiarCampos();
        toast.success("Puerta añadida al desglose");
      },
      getDatos: () => filas,
      limpiarTabla: () => {
        setFilas([]);
        localStorage.removeItem('cf_desglose_puertas_comerciales');
      }
    }));

    const eliminarFila = (id: string) => {
      const updated = filas.filter(f => f.id !== id);
      setFilas(updated);
      if (updated.length === 0) {
        localStorage.removeItem('cf_desglose_puertas_comerciales');
      } else {
        localStorage.setItem('cf_desglose_puertas_comerciales', JSON.stringify(updated));
      }
      triggerDataChange(updated);
      toast.success("Registro eliminado");
    };

    if (filas.length === 0) return null;

    return (
      <div className="w-full">
        {/* Vista Mobile (Tarjetas) */}
        <div className="md:hidden space-y-4">
          {filas.map((fila, index) => (
            <div key={fila.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden relative group">
              <div className="bg-[#002244] px-4 py-2 flex justify-between items-center text-white">
                <span className="font-bold text-xs uppercase tracking-wider">Línea {index + 1}</span>
                <span className="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full">1 Hoja</span>
              </div>
              
              <div className="p-4 space-y-4">
                {/* 1. Medida Base */}
                <div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Medida Base</div>
                  <div className="grid grid-cols-2 gap-2 text-sm bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <div className="flex flex-col"><span className="text-slate-400 text-[10px] uppercase">Cant</span><span className="font-bold">{fila.cantidad}</span></div>
                    <div className="flex flex-col"><span className="text-slate-400 text-[10px] uppercase">A × H</span><span className="font-bold">{fila.ancho}" × {fila.alto}"</span></div>
                  </div>
                </div>
                
                {/* 2. Medidas de Cortes */}
                <div>
                  <div className="text-[9px] font-bold text-[#003366] uppercase tracking-widest mb-1 flex items-center gap-1"><Ruler className="h-3 w-3" /> Cortes de Perfiles</div>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs">
                    <div><span className="text-slate-400 block text-[10px]">Lateral</span><span className="font-mono font-semibold">{fila.lateral}</span></div>
                    <div><span className="text-slate-400 block text-[10px]">Dintel</span><span className="font-mono font-semibold">{fila.dintel}</span></div>
                    <div><span className="text-slate-400 block text-[10px]">Jamba</span><span className="font-mono font-semibold">{fila.jamba}</span></div>
                    <div><span className="text-slate-400 block text-[10px]">Ruleta</span><span className="font-mono font-semibold">{fila.ruleta}</span></div>
                  </div>
                </div>

                {/* 3. Cristal */}
                <div>
                  <div className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Cristal</div>
                  <div className="grid grid-cols-2 gap-2 text-xs bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
                    <div><span className="text-slate-400 block text-[10px]">Ancho</span><span className="font-mono font-semibold text-emerald-800">{fila.vidrioW}</span></div>
                    <div><span className="text-slate-400 block text-[10px]">Alto</span><span className="font-mono font-semibold text-emerald-800">{fila.vidrioH}</span></div>
                  </div>
                </div>
              </div>
              
              <button 
                onClick={() => eliminarFila(fila.id)}
                className="absolute top-10 right-4 h-8 w-8 bg-red-50 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Vista Desktop (Tabla) */}
        <div className="hidden md:block bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-[#002244] text-white/90">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider w-10 text-center">#</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-center">Cant</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-center border-r border-white/10">Base (A×H)</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">Lateral</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">Dintel</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">Jamba</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider border-r border-white/10">Ruleta</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider bg-emerald-900/30">Cri Ancho</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider bg-emerald-900/30 border-r border-white/10">Cri Alto</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-right w-16">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.map((fila, index) => (
                  <tr key={fila.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-3 text-center text-slate-400 font-medium text-xs">{index + 1}</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-700">{fila.cantidad}</td>
                    <td className="px-4 py-3 text-center border-r border-slate-100">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-xs border border-slate-200 shadow-sm">
                        {fila.ancho}" × {fila.alto}"
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-[#003366] text-xs">{fila.lateral}</td>
                    <td className="px-4 py-3 font-mono font-medium text-[#003366] text-xs">{fila.dintel}</td>
                    <td className="px-4 py-3 font-mono font-medium text-[#003366] text-xs">{fila.jamba}</td>
                    <td className="px-4 py-3 font-mono font-medium text-[#003366] text-xs border-r border-slate-100">{fila.ruleta}</td>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-700 text-xs bg-emerald-50/30">{fila.vidrioW}</td>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-700 text-xs bg-emerald-50/30 border-r border-slate-100">{fila.vidrioH}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => eliminarFila(fila.id)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Eliminar registro"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }
);

TablaPuertaComercial.displayName = 'TablaPuertaComercial';
export default TablaPuertaComercial;
