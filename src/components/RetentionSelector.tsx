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
    <div className="bg-[#001733] border border-slate-700/50 rounded-xl p-5 text-white">
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
            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-primary focus:ring-primary focus:ring-2"
          />
          <span className="font-semibold text-sm">Aplicar retenciones fiscales</span>
        </label>
      </div>

      {enabled && (
        <div className="mt-4 space-y-4 border-t border-slate-700/50 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                RNC/Cédula Agente Retenedor
              </label>
              <input
                type="text"
                placeholder="RNC o Cédula"
                value={agentRnc}
                onChange={(e) => setAgentRnc(e.target.value.replace(/\D/g, '').substring(0, 11))}
                className="w-full bg-[#001122] border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-[#c5a059] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                Fecha de la Retención
              </label>
              <input
                type="date"
                value={retentionDate}
                onChange={(e) => setRetentionDate(e.target.value)}
                className="w-full bg-[#001122] border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-[#c5a059] outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">
              Seleccionar Retención a Aplicar
            </label>
            <div className="flex flex-wrap gap-2">
              {availableRetentions.map((ret) => (
                <button
                  key={ret.id}
                  type="button"
                  onClick={() => handleAdd(ret)}
                  className="flex items-center gap-1.5 bg-[#002855] hover:bg-[#003a7d] border border-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {ret.name}
                </button>
              ))}
            </div>
          </div>

          {applied.length > 0 ? (
            <div className="border border-slate-700 bg-[#001122] rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#002244] text-slate-300 font-bold border-b border-slate-700">
                    <th className="px-4 py-2.5">Retención</th>
                    <th className="px-4 py-2.5">Tipo</th>
                    <th className="px-4 py-2.5 text-center w-24">Porcentaje</th>
                    <th className="px-4 py-2.5 text-right w-32">Monto Retenido</th>
                    <th className="px-4 py-2.5 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {applied.map((item, index) => (
                    <tr key={index} className="hover:bg-[#001e3d]/40 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{item.retentionName}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.retentionType === 'ISR' ? 'bg-orange-900/50 text-orange-400 border border-orange-700/50' :
                          item.retentionType === 'ITBIS' ? 'bg-blue-900/50 text-blue-400 border border-blue-700/50' :
                          'bg-slate-900/50 text-slate-400 border border-slate-700/50'
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
                            className="w-14 bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5 text-center text-xs text-white focus:border-[#c5a059] outline-none"
                          />
                          <span>%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold font-mono">
                        RD$ {item.retentionAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemove(index)}
                          className="text-red-400 hover:text-red-300 transition-colors p-1 cursor-pointer"
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
            <div className="flex items-center gap-2 bg-[#002244]/50 border border-slate-700/50 p-4 rounded-lg text-slate-300 text-xs">
              <ShieldAlert className="w-4 h-4 text-[#c5a059] shrink-0" />
              <span>No ha seleccionado ninguna retención. Haga clic en una de las opciones superiores para agregarla.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
