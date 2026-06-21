'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

export interface RetentionItem {
  id?: string;
  name: string;
  percentage: number;
  type: 'ITBIS' | 'ISR' | 'OTRA';
  active: boolean;
}

export interface AppliedRetention {
  retentionId?: string;
  retentionName: string;
  retentionType: 'ITBIS' | 'ISR' | 'OTRA';
  retentionPercentage: number;
  retentionAmount: number;
  agentRnc?: string;
  retentionDate?: string;
}

interface RetentionSelectorProps {
  subtotal: number;
  discount: number;
  itbis: number;
  onChange: (retentions: AppliedRetention[], enabled: boolean) => void;
  defaultRnc?: string;
}

export default function RetentionSelector({ subtotal, discount, itbis, onChange, defaultRnc = '' }: RetentionSelectorProps) {
  const [enabled, setEnabled] = useState(false);
  const [availableRetentions, setAvailableRetentions] = useState<RetentionItem[]>([]);
  const [applied, setApplied] = useState<AppliedRetention[]>([]);
  const [agentRnc, setAgentRnc] = useState(defaultRnc);
  const [retentionDate, setRetentionDate] = useState('');

  // Set default date to current local date in YYYY-MM-DD
  useEffect(() => {
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000; // offset in milliseconds
    const localISOTime = (new Date(Date.now() - tzOffset)).toISOString().slice(0, 10);
    setRetentionDate(localISOTime);
  }, []);

  // Update default RNC if customer changes
  useEffect(() => {
    if (defaultRnc) {
      setAgentRnc(defaultRnc.replace(/\D/g, '').substring(0, 11));
    }
  }, [defaultRnc]);

  // Load available retentions
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/v1/retentions');
        const data = await res.json();
        if (data.success) {
          setAvailableRetentions(data.data || []);
        }
      } catch (err) {
        console.error('Error loading retentions:', err);
      }
    }
    load();
  }, []);

  // Update applied retention amounts when totals change
  useEffect(() => {
    if (!enabled) {
      onChange([], false);
      return;
    }

    const baseTaxable = subtotal - discount;
    const updated = applied.map(item => {
      let amount = 0;
      if (item.retentionType === 'ISR') {
        amount = Math.round((baseTaxable * (item.retentionPercentage / 100) + Number.EPSILON) * 100) / 100;
      } else if (item.retentionType === 'ITBIS') {
        amount = Math.round((itbis * (item.retentionPercentage / 100) + Number.EPSILON) * 100) / 100;
      } else {
        amount = Math.round((baseTaxable * (item.retentionPercentage / 100) + Number.EPSILON) * 100) / 100;
      }

      return {
        ...item,
        retentionAmount: amount,
        agentRnc: agentRnc || undefined,
        retentionDate: retentionDate || undefined,
      };
    });

    const totalInvoice = subtotal - discount + itbis;
    const totalRetAmount = updated.reduce((acc, curr) => acc + curr.retentionAmount, 0);

    if (totalRetAmount > totalInvoice) {
      toast.error('El total retenido no puede exceder el total de la factura');
      return;
    }

    setApplied(updated);
    onChange(updated, enabled);
  }, [subtotal, discount, itbis, enabled, agentRnc, retentionDate]);

  const handleAdd = (ret: RetentionItem) => {
    if (applied.some(item => item.retentionName === ret.name)) {
      toast.warning('Esta retención ya está agregada.');
      return;
    }

    const baseTaxable = subtotal - discount;
    let amount = 0;
    if (ret.type === 'ISR') {
      amount = Math.round((baseTaxable * (ret.percentage / 100) + Number.EPSILON) * 100) / 100;
    } else if (ret.type === 'ITBIS') {
      amount = Math.round((itbis * (ret.percentage / 100) + Number.EPSILON) * 100) / 100;
    } else {
      amount = Math.round((baseTaxable * (ret.percentage / 100) + Number.EPSILON) * 100) / 100;
    }

    const newItem: AppliedRetention = {
      retentionId: ret.id,
      retentionName: ret.name,
      retentionType: ret.type,
      retentionPercentage: ret.percentage,
      retentionAmount: amount,
      agentRnc: agentRnc || undefined,
      retentionDate: retentionDate || undefined,
    };

    const newApplied = [...applied, newItem];
    setApplied(newApplied);
    onChange(newApplied, enabled);
  };

  const handleRemove = (index: number) => {
    const newApplied = applied.filter((_, i) => i !== index);
    setApplied(newApplied);
    onChange(newApplied, enabled);
  };

  const handlePercentageChange = (index: number, newPct: number) => {
    if (newPct < 0 || newPct > 100) {
      toast.error('El porcentaje debe estar entre 0% y 100%');
      return;
    }

    const newApplied = [...applied];
    const baseTaxable = subtotal - discount;
    let amount = 0;
    if (newApplied[index].retentionType === 'ISR') {
      amount = Math.round((baseTaxable * (newPct / 100) + Number.EPSILON) * 100) / 100;
    } else if (newApplied[index].retentionType === 'ITBIS') {
      amount = Math.round((itbis * (newPct / 100) + Number.EPSILON) * 100) / 100;
    } else {
      amount = Math.round((baseTaxable * (newPct / 100) + Number.EPSILON) * 100) / 100;
    }

    newApplied[index] = {
      ...newApplied[index],
      retentionPercentage: newPct,
      retentionAmount: amount,
    };

    setApplied(newApplied);
    onChange(newApplied, enabled);
  };

  return (
    <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-5 text-slate-700">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              if (!e.target.checked) {
                setApplied([]);
              }
            }}
            className="w-4 h-4 rounded border-slate-300 bg-white text-[#003366] focus:ring-[#003366] focus:ring-2"
          />
          <span className="font-semibold text-sm text-[#003366]">Aplicar retenciones fiscales</span>
        </label>
      </div>

      {enabled && (
        <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
              Seleccionar Retención a Aplicar
            </label>
            <select
              value=""
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                const ret = availableRetentions.find(r => r.id === val);
                if (ret) {
                  handleAdd(ret);
                }
              }}
              className="w-full md:w-96 rounded-lg bg-white border border-slate-300 py-2 px-3 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-xs transition-all cursor-pointer font-medium"
            >
              <option value="">Seleccione una retención para agregar...</option>
              {availableRetentions.map((ret) => (
                <option key={ret.id} value={ret.id}>
                  {ret.name} ({ret.type} - {ret.percentage}%)
                </option>
              ))}
            </select>
          </div>

          {applied.length > 0 ? (
            <div className="border border-slate-200 bg-white rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <th className="px-4 py-2.5">Retención</th>
                    <th className="px-4 py-2.5">Tipo</th>
                    <th className="px-4 py-2.5 text-center w-24">Porcentaje</th>
                    <th className="px-4 py-2.5 text-right w-32">Monto Retenido</th>
                    <th className="px-4 py-2.5 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {applied.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{item.retentionName}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.retentionType === 'ISR' ? 'bg-orange-50 text-orange-600 border border-orange-200' :
                          item.retentionType === 'ITBIS' ? 'bg-blue-50 text-blue-600 border border-blue-200' :
                          'bg-slate-50 text-slate-600 border border-slate-200'
                        }`}>
                          {item.retentionType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={item.retentionPercentage}
                            onChange={(e) => handlePercentageChange(index, parseFloat(e.target.value) || 0)}
                            className="w-14 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-center text-xs text-[#003366] focus:border-[#c5a059] outline-none"
                          />
                          <span>%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold font-mono text-[#003366]">
                        RD$ {item.retentionAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemove(index)}
                          className="text-red-500 hover:text-red-600 transition-colors p-1 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-4 rounded-lg text-slate-500 text-xs">
              <ShieldAlert className="w-4 h-4 text-[#c5a059] shrink-0" />
              <span>No ha seleccionado ninguna retención. Haga clic en una de las opciones superiores para agregarla.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
