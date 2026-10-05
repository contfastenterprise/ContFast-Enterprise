'use client';

/**
 * Lote 294: los volantes de la nomina abierta, uno por colaborador (movil y escritorio),
 * movidos tal cual desde `page.tsx`.
 */
import { FileText } from 'lucide-react';
import type { EstadoNominas } from '../hooks/useNominas';

export function VolantesDeLaNomina({ h }: { h: EstadoNominas }) {
  const { selectedPayroll, payrollDetailsList } = h;
  //  Solo se pinta con una nomina elegida (la pagina lo decide); esto lo dice al compilador.
  if (!selectedPayroll) return null;

  return (
    <>
      {/* Mobile View */}
      <div className="md:hidden flex flex-col divide-y divide-slate-100 bg-white border border-slate-200 rounded-lg">
        {payrollDetailsList.map((d) => (
          <div key={d.id} className="flex flex-col p-4 hover:bg-slate-50 transition-colors gap-3">
            <div className="flex justify-between items-start">
              <div className="flex flex-col">
                <span className="font-semibold text-sm text-slate-800">{d.firstName} {d.lastName}</span>
                <span className="font-mono font-bold text-xs text-[#003366]">{d.employeeCode}</span>
              </div>
              <a
                href={`/api/v1/hr/payroll/${selectedPayroll.id}/receipts?employeeId=${d.employeeId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 p-1.5 rounded-lg bg-[#003366]/10 text-[#003366] font-semibold text-[10px] uppercase"
              >
                <FileText className="h-3 w-3" /> Volante
              </a>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-semibold uppercase">Salario Base</span>
                <span className="font-medium text-slate-700">{parseFloat(d.baseSalary).toLocaleString('es-DO')}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-semibold uppercase">H. Ext / Bonos</span>
                <span className="font-medium text-slate-700">
                  {(parseFloat(d.overtimeAmount) + parseFloat(d.bonusAmount) + parseFloat(d.commissionAmount)) > 0 
                    ? (parseFloat(d.overtimeAmount) + parseFloat(d.bonusAmount) + parseFloat(d.commissionAmount)).toLocaleString('es-DO') 
                    : '-'}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-red-400 font-semibold uppercase">Deducciones (TSS/ISR)</span>
                <span className="font-mono text-red-600">
                  {(parseFloat(d.afp) + parseFloat(d.sfs) + parseFloat(d.isr) + parseFloat(d.otherDeductions)).toLocaleString('es-DO')}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-[#003366] font-bold uppercase">Sueldo Neto</span>
                <span className="font-mono font-bold text-[#003366] text-sm">{parseFloat(d.netSalary).toLocaleString('es-DO')}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop View */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-200">
              <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Código</th>
              <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Colaborador</th>
              <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Salario Base</th>
              <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">H. Extras</th>
              <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Bonos/Comis.</th>
              <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right text-red-500">AFP</th>
              <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right text-red-500">SFS</th>
              <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right text-red-500">ISR</th>
              <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right text-red-500">Otros Desc</th>
              <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right font-bold text-[#003366]">Sueldo Neto</th>
              <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Recibo</th>
            </tr>
          </thead>
          <tbody>
            {payrollDetailsList.map((d) => (
              <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50 text-slate-800">
                <td className="px-4 py-2.5 font-mono">{d.employeeCode}</td>
                <td className="px-4 py-2.5 font-medium">{d.firstName} {d.lastName}</td>
                <td className="px-4 py-2.5 text-right">{parseFloat(d.baseSalary).toLocaleString('es-DO')}</td>
                <td className="px-4 py-2.5 text-right">{parseFloat(d.overtimeAmount) > 0 ? parseFloat(d.overtimeAmount).toLocaleString('es-DO') : '-'}</td>
                <td className="px-4 py-2.5 text-right">{(parseFloat(d.bonusAmount) + parseFloat(d.commissionAmount)) > 0 ? (parseFloat(d.bonusAmount) + parseFloat(d.commissionAmount)).toLocaleString('es-DO') : '-'}</td>
                <td className="px-4 py-2.5 text-right text-red-600 font-mono">{parseFloat(d.afp) > 0 ? parseFloat(d.afp).toLocaleString('es-DO') : '-'}</td>
                <td className="px-4 py-2.5 text-right text-red-600 font-mono">{parseFloat(d.sfs) > 0 ? parseFloat(d.sfs).toLocaleString('es-DO') : '-'}</td>
                <td className="px-4 py-2.5 text-right text-red-600 font-mono">{parseFloat(d.isr) > 0 ? parseFloat(d.isr).toLocaleString('es-DO') : '-'}</td>
                <td className="px-4 py-2.5 text-right text-red-600 font-mono">{parseFloat(d.otherDeductions) > 0 ? parseFloat(d.otherDeductions).toLocaleString('es-DO') : '-'}</td>
                <td className="px-4 py-2.5 text-right font-bold text-[#003366] font-mono">{parseFloat(d.netSalary).toLocaleString('es-DO')}</td>
                <td className="px-4 py-2.5 text-right">
                  <a
                    href={`/api/v1/hr/payroll/${selectedPayroll.id}/receipts?employeeId=${d.employeeId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block p-1 hover:bg-slate-100 rounded text-slate-500"
                  >
                    <FileText className="h-4 w-4" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
