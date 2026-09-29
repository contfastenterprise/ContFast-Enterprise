'use client';

/**
 * "Aplicar Despacho por Código": se escribe el NCF o el numero de conduce y se
 * aprueba. Salio de `page.tsx` al partirla (lote 226), con su estado y su
 * accion tal cual; al aplicar avisa a la pagina para que recargue la lista.
 */
import { useState } from 'react';
import { FileCheck, RefreshCw, Truck } from 'lucide-react';
import { toast } from 'sonner';

export function AplicarPorCodigo({ onAplicado }: { onAplicado: () => void }) {
  const [applyCode, setApplyCode] = useState('');
  const [applying, setApplying] = useState(false);

  const handleApplyCode = async () => {
    if (!applyCode.trim()) {
      toast.error('Debe ingresar un código de factura o conduce.');
      return;
    }
    setApplying(true);
    try {
      const res = await fetch('/api/v1/delivery-notes/apply-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: applyCode }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.alreadyApproved) {
          toast.warning(data.message || 'El conduce ya está aprobado.');
        } else {
          toast.success(data.message || 'Código aplicado con éxito.');
        }
        setApplyCode('');
        // Refresh delivery notes list
        onAplicado();
      } else {
        toast.error(data.error?.message || 'Error al aplicar el código.');
      }
    } catch (error) {
      toast.error('Error de red al aplicar el código.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="bg-[#c5a059]/10 p-3 rounded-lg text-[#c5a059]">
          <Truck className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-md font-bold text-slate-900">Aplicar Despacho por Código</h3>
          <p className="text-xs text-slate-500">Digita el NCF de la factura o el código de conduce para aprobar y descontar stock automáticamente.</p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 items-stretch md:items-center w-full md:w-auto">
        <input
          type="text"
          placeholder="Ej: E310000000001 o CON-2026-000001"
          value={applyCode}
          onChange={(e) => setApplyCode(e.target.value)}
          className="h-8 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors w-full sm:w-80 font-mono"
        />
        <button
          onClick={handleApplyCode}
          disabled={applying}
          className="bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] font-bold h-8 px-3 py-1.5 rounded-lg shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 text-xs shrink-0 disabled:opacity-50"
        >
          {applying ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <FileCheck className="h-4 w-4" />
          )}
          <span>Aplicar Despacho</span>
        </button>
      </div>
    </div>
  );
}
