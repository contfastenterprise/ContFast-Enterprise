/**
 * Configuracion > Empresa: el formulario entero, con su unico boton de guardar.
 * Sale de `settings/page.tsx` en el lote 238, movido tal cual: solo pinta.
 */
import { CheckCircle2, RefreshCw } from 'lucide-react';
import type { Ajustes } from '../hooks/useAjustes';
import { IdentidadFiscal } from './IdentidadFiscal';
import { IntegracionMseller } from './IntegracionMseller';
import { ParametrosOperativos } from './ParametrosOperativos';

import { Button } from '@/components/ui/button';
export function FormularioEmpresa({ a }: { a: Ajustes }) {
  return (
          <form onSubmit={a.handleSave} className="space-y-6">
            <IdentidadFiscal a={a} />
            <IntegracionMseller a={a} />
            <ParametrosOperativos a={a} />

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={a.submitting} className="flex">
                {a.submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} Guardar Cambios
              </Button>
            </div>
          </form>
  );
}
