'use client';

import React, { useState, forwardRef, useImperativeHandle, useCallback, useEffect } from 'react';
import { Trash2, Calculator, Layers, Scissors, Info } from 'lucide-react';
import { parseFraction, decimalToFraccion } from '@/utils/calculos';
import { windowProfiles } from '@/utils/profilesRegistry';
import { toast } from 'sonner';

export interface TablaDesgloseHandle {
  agregarFila: () => void;
  getDatos: () => any[];
  limpiarTabla: () => void;
}

interface ItemDesglose {
  id: string;
  tipo: string;
  cantidad: number;
  vias: number;
  ancho: string;
  altura: string;
  cabezal: string;
  llavin: string;
  riel: string;
  lateral: string;
  vidrio: string;
}

interface Props {
  ancho: string;
  altura: string;
  cantidad: number;
  vias: number;
  limpiarCampos: () => void;
  tipoCorredera: number;
  onDataChange?: (datos: ItemDesglose[]) => void;
}

const TablaDesglose = forwardRef<TablaDesgloseHandle, Props>(
  ({ ancho, altura, cantidad, vias, limpiarCampos, tipoCorredera, onDataChange }, ref) => {
    const [filas, setFilas] = useState<ItemDesglose[]>([]);

    const titulos = ['Tradicional', 'P-65', 'P-92'];

    const triggerDataChange = useCallback((updated: ItemDesglose[]) => {
      if (onDataChange) {
        onDataChange(updated);
      }
    }, [onDataChange]);

    useEffect(() => {
      const saved = localStorage.getItem('cf_desglose_ventanas');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setFilas(parsed);
          if (onDataChange) {
            onDataChange(parsed);
          }
        } catch (e) {
          console.error('Failed to parse saved breakdown rows', e);
        }
      }
    }, []);

    const agregarFila = useCallback(() => {
      if (ancho === "" || altura === "") {
        toast.error("Por favor, introduzca un formato válido para el Ancho y la Altura.");
        return;
      }
      if (cantidad < 1) {
        toast.error("Por favor, introduzca una cantidad válida (mayor o igual a 1).");
        return;
      }

      const intAncho = parseFraction(ancho);
      const intAltura = parseFraction(altura);

      if (intAncho <= 0 || intAltura <= 0) {
        toast.error("Las medidas deben ser mayores que cero.");
        return;
      }

      const sistemaKey = titulos[tipoCorredera];
      const profileSystem = windowProfiles[sistemaKey];

      if (!profileSystem) {
        toast.error("Sistema de ventana no soportado.");
        return;
      }

      // Calculate cuts
      const cuts = profileSystem.calculate(intAncho, intAltura, cantidad, vias);

      // Render fractions texts
      const cabezal = `${cuts.cabezal.label} ${decimalToFraccion(cuts.cabezal.value)}`;
      const llavin = `${cuts.llavin.label} ${decimalToFraccion(cuts.llavin.value)}`;
      const riel = `${cuts.riel.label} ${decimalToFraccion(cuts.riel.value)}`;
      const lateral = `${cuts.lateral.label} ${decimalToFraccion(cuts.lateral.value)}`;

      let vidrioText = '';
      if (vias === 3) {
        const vW1 = cuts.vidrio.valueWidth;
        const vH = cuts.vidrio.valueHeight;
        
        let offset = 0.625; // default 5/8 for Tradicional
        if (sistemaKey === 'P-65') offset = -0.25;
        if (sistemaKey === 'P-92') offset = -0.375;

        const vW2 = vW1 + offset;

        vidrioText = `(2x) ${decimalToFraccion(vW1)} x ${decimalToFraccion(vH)} y (1x) ${decimalToFraccion(vW2)} x ${decimalToFraccion(vH)}`;
      } else {
        vidrioText = `${cuts.vidrio.label} ${decimalToFraccion(cuts.vidrio.valueWidth)} x ${decimalToFraccion(cuts.vidrio.valueHeight)}`;
      }

      const nuevaFila: ItemDesglose = {
        id: Math.random().toString(36).substring(2, 9),
        tipo: sistemaKey,
        cantidad,
        vias,
        ancho,
        altura,
        cabezal,
        llavin,
        riel,
        lateral,
        vidrio: vidrioText,
      };

      const updated = [...filas, nuevaFila];
      setFilas(updated);
      localStorage.setItem('cf_desglose_ventanas', JSON.stringify(updated));
      triggerDataChange(updated);
      limpiarCampos();
      toast.success("Registro añadido");
    }, [ancho, altura, cantidad, vias, tipoCorredera, filas, limpiarCampos, triggerDataChange]);

    const limpiarTabla = useCallback(() => {
      setFilas([]);
      localStorage.removeItem('cf_desglose_ventanas');
      triggerDataChange([]);
    }, [triggerDataChange]);

    useImperativeHandle(ref, () => ({
      agregarFila,
      getDatos: () => filas,
      limpiarTabla,
    }), [agregarFila, filas, limpiarTabla]);

    const eliminarFila = (id: string) => {
      if (window.confirm("¿Seguro que desea eliminar este registro de corte?")) {
        const updated = filas.filter((f) => f.id !== id);
        setFilas(updated);
        localStorage.setItem('cf_desglose_ventanas', JSON.stringify(updated));
        triggerDataChange(updated);
        toast.success("Registro eliminado");
      }
    };

    return (
      <div className="w-full space-y-4">
        {filas.length === 0 ? (
          <div className="text-center py-16 text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 rounded-full bg-white text-slate-300 shadow-xs border border-slate-100">
                <Calculator className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-slate-700">Sin cortes calculados</p>
                <p className="text-xs max-w-[280px]">Introduce las medidas arriba y haz clic en "Add" para generar las tarjetas de producción.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 w-full overflow-x-auto pb-2">
            {filas.map((fila) => (
              <div 
                key={fila.id} 
                className="bg-white rounded-xl border border-slate-150 shadow-xs hover:shadow-md transition-all p-4 flex flex-row items-center justify-between gap-4 group min-w-[900px]"
              >
                {/* 1. Bloque de Identificación y Medidas Base (Horizontal) */}
                <div className="flex items-center gap-4 min-w-[240px]">
                  {/* Burbuja de Cantidad */}
                  <div className="w-11 h-11 rounded-xl bg-[#003366]/5 border border-[#003366]/10 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold text-[#003366]/60 uppercase leading-none">Cant</span>
                    <span className="font-black text-lg text-[#003366] leading-tight">{fila.cantidad}</span>
                  </div>

                  {/* Detalles de Sistema y Vías */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                        fila.tipo === 'P-65' ? 'bg-blue-100 text-blue-800' :
                        fila.tipo === 'P-92' ? 'bg-purple-100 text-purple-800' :
                        'bg-emerald-100 text-emerald-800'
                      }`}>
                        {fila.tipo}
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                        {fila.vias} Vías
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-800 font-mono">
                      W: {fila.ancho} x H: {fila.altura}
                    </div>
                  </div>
                </div>

                {/* 2. Bloque de Medidas del Vidrio */}
                <div className="bg-[#005E63]/5 border border-[#005E63]/10 rounded-xl px-4 py-2.5 min-w-[220px] max-w-full">
                  <div className="text-[9px] font-bold text-[#005E63]/70 uppercase tracking-widest mb-0.5">Medida Cristal (Vidrio)</div>
                  <div className="flex items-center gap-1.5 font-bold text-[#005E63] text-xs">
                    <Layers className="h-4 w-4 shrink-0" />
                    <span className="font-mono">{fila.vidrio}</span>
                  </div>
                </div>

                {/* 3. Bloque de Cortes de Perfiles en Fila Horizontal */}
                <div className="flex-1 w-auto">
                  <div className="grid grid-cols-4 gap-2.5">
                    <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 flex flex-col justify-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Cabezal</span>
                      <span className="font-mono text-slate-700 font-bold text-xs flex items-center gap-1 mt-0.5">
                        <Scissors className="h-3 w-3 text-slate-400 shrink-0" /> {fila.cabezal.replace('Cabezal', '')}
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 flex flex-col justify-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Llavín</span>
                      <span className="font-mono text-slate-700 font-bold text-xs flex items-center gap-1 mt-0.5">
                        <Scissors className="h-3 w-3 text-slate-400 shrink-0" /> {fila.llavin.replace('Llavin', '').replace('Llavín', '')}
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 flex flex-col justify-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Riel</span>
                      <span className="font-mono text-slate-700 font-bold text-xs flex items-center gap-1 mt-0.5">
                        <Scissors className="h-3 w-3 text-slate-400 shrink-0" /> {fila.riel.replace('Rieles', '').replace('Riel', '')}
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 flex flex-col justify-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Lateral</span>
                      <span className="font-mono text-slate-700 font-bold text-xs flex items-center gap-1 mt-0.5">
                        <Scissors className="h-3 w-3 text-slate-400 shrink-0" /> {fila.lateral.replace('Lateral', '')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 4. Botón de Eliminar */}
                <div className="self-center">
                  <button
                    onClick={() => eliminarFila(fila.id)}
                    className="p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-red-50 transition-all"
                    title="Eliminar registro"
                  >
                    <Trash2 className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

TablaDesglose.displayName = 'TablaDesglose';

export default TablaDesglose;
