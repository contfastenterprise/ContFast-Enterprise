/**
 * Configuracion > Empresa: el formulario entero, con su unico boton de guardar.
 * Sale de `settings/page.tsx` en el lote 238, movido tal cual: solo pinta.
 */
import { CheckCircle2, RefreshCw } from 'lucide-react';
import type { Ajustes } from '../hooks/useAjustes';
import { IdentidadFiscal } from './IdentidadFiscal';
import { IntegracionMseller } from './IntegracionMseller';
import { ParametrosOperativos } from './ParametrosOperativos';

export function FormularioEmpresa({ a }: { a: Ajustes }) {
  return (
          <form onSubmit={a.handleSave} className="space-y-6">
            <IdentidadFiscal a={a} />
            <IntegracionMseller a={a} />
            <ParametrosOperativos a={a} />

            <div className="flex justify-end pt-4">
              <button type="submit" disabled={a.submitting} className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm">
                {a.submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} Guardar Cambios
              </button>
            </div>
          </form>
  );
}
