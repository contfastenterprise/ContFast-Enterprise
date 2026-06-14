'use client';

import React, { useState, forwardRef, useImperativeHandle, useCallback, useEffect } from 'react';
import { Trash2, Calculator } from 'lucide-react';
import { parseFraction, decimalToFraccion, formatFraction } from '@/utils/calculos';
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
}

const TablaDesglose = forwardRef<TablaDesgloseHandle, Props>(
  ({ ancho, altura, cantidad, vias, limpiarCampos, tipoCorredera }, ref) => {
    const [filas, setFilas] = useState<ItemDesglose[]>([]);

    const titulos = ['Tradicional', 'P-65', 'P-92'];

    // Load from localstorage on mount
    useEffect(() => {
      const saved = localStorage.getItem('cf_desglose_ventanas');
      if (saved) {
        try {
          setFilas(JSON.parse(saved));
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

      // Calculate cuts using the registry (Extremely scalable!)
      const cuts = profileSystem.calculate(intAncho, intAltura, cantidad, vias);

      // Render fractions texts
      const cabezal = `${cuts.cabezal.label} ${decimalToFraccion(cuts.cabezal.value)}`;
      const llavin = `${cuts.llavin.label} ${decimalToFraccion(cuts.llavin.value)}`;
      const riel = `${cuts.riel.label} ${decimalToFraccion(cuts.riel.value)}`;
      const lateral = `${cuts.lateral.label} ${decimalToFraccion(cuts.lateral.value)}`;

      let vidrioText = '';
      if (vias === 3) {
        // Special render for 3 vias (mixed glass sizes)
        const vW1 = cuts.vidrio.valueWidth;
        const vH = cuts.vidrio.valueHeight;
        
        let offset = 0.625; // default 5/8 for Tradicional
        if (sistemaKey === 'P-65') offset = -0.25;
        if (sistemaKey === 'P-92') offset = -0.375;

        const vW2 = vW1 + offset;

        vidrioText = `(2 * ${cantidad}) ${decimalToFraccion(vW1)} x ${decimalToFraccion(vH)} y (1 * ${cantidad}) ${decimalToFraccion(vW2)} x ${decimalToFraccion(vH)}`;
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
      limpiarCampos();
      toast.success("Registro añadido a la tabla");
    }, [ancho, altura, cantidad, vias, tipoCorredera, filas, limpiarCampos]);

    const limpiarTabla = useCallback(() => {
      setFilas([]);
      localStorage.removeItem('cf_desglose_ventanas');
    }, []);

    useImperativeHandle(ref, () => ({
      agregarFila,
      getDatos: () => filas,
      limpiarTabla,
    }), [agregarFila, filas, limpiarTabla]);

    const eliminarFila = (id: string) => {
      if (window.confirm("¿Seguro que desea eliminar esta fila?")) {
        const updated = filas.filter((f) => f.id !== id);
        setFilas(updated);
        localStorage.setItem('cf_desglose_ventanas', JSON.stringify(updated));
        toast.success("Fila eliminada");
      }
    };

    return (
      <div className="w-full overflow-hidden border border-slate-200 rounded-xl shadow-sm bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-xs tracking-wider uppercase">
                <th className="py-4 px-4 w-[60px] text-center">Cant.</th>
                <th className="py-4 px-4 w-[110px]">Sistema</th>
                <th className="py-4 px-4 w-[130px]">Medida Base</th>
                <th className="py-4 px-4 w-[80px] text-center">Vías</th>
                <th className="py-4 px-4 w-[240px] bg-slate-100/60 text-[#005E63]">Medidas Vidrio</th>
                <th className="py-4 px-4">Perfiles (Corte)</th>
                <th className="py-4 px-4 w-[80px] text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-400">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 rounded-full bg-slate-100 text-slate-300">
                        <Calculator className="w-10 h-10" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-bold text-slate-700">Lista de cortes vacía</p>
                        <p className="text-xs max-w-[280px]">Agregue medidas desde el panel izquierdo para generar el desglose técnico.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filas.map((fila) => (
                  <tr key={fila.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900 text-center text-base">{fila.cantidad}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        fila.tipo === 'P-65' ? 'bg-blue-100 text-blue-700' :
                        fila.tipo === 'P-92' ? 'bg-purple-100 text-purple-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {fila.tipo}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-600">
                      {fila.ancho} x {fila.altura}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-600 text-xs font-black border border-slate-200">
                        {fila.vias}
                      </span>
                    </td>
                    <td className="py-3 px-4 bg-slate-100/30">
                      <div className="space-y-0.5">
                        <span className="font-bold text-[#005E63] text-xs leading-tight block">
                          {fila.vidrio}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Ancho x Alto</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 py-1 text-xs">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Cabezal</span>
                          <span className="font-mono text-slate-600 font-semibold">{fila.cabezal}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Lateral</span>
                          <span className="font-mono text-slate-600 font-semibold">{fila.lateral}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Llavín</span>
                          <span className="font-mono text-slate-600 font-semibold">{fila.llavin}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Rieles</span>
                          <span className="font-mono text-slate-600 font-semibold">{fila.riel}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => eliminarFila(fila.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                        title="Eliminar fila"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
);

TablaDesglose.displayName = 'TablaDesglose';

export default TablaDesglose;
