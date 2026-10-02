/**
 * Configuracion > Cuentas Puente (lotes 171 y 175).
 * Sale de `settings/page.tsx` en el lote 238, movido tal cual: solo pinta.
 */
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { GRUPOS_DE_PUENTES } from '@/services/accounting/cuentasDelSistema';
import type { Puentes } from '../hooks/useCuentasPuente';

export function CuentasPuente({ p }: { p: Puentes }) {
  return (
          <form onSubmit={p.handleSaveMappings} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-[#003366]">Parametrización de Cuentas Puente (Plantillas)</h3>
              <p className="text-sm text-slate-500 mt-1">Configura las cuentas por defecto que recibirán débitos/créditos de transacciones automatizadas en facturas, cobros y almacén.</p>
            </div>

            {/* Lote 171: las filas salen de CUENTAS_DEL_SISTEMA, no de una
                lista escrita aqui. Aqui habia 9 claves mientras la tabla tenia
                16: las retenciones, los anticipos de ISR y los otros impuestos
                los resolvia el codigo con un codigo de cuenta por defecto y no
                habia donde cambiarlos. Ahora la proxima clave aparece sola. */}
            {/* Lote 175: una tarjeta por bloque. Dieciseis desplegables
                seguidos no se leen: hay que saber cual es cual, y el orden
                1.1.01.01, 1.1.01.02, 1.1.02.01... es el del catalogo, no el de
                la cabeza de quien lo configura. Los bloques salen de la tabla
                (GRUPOS_DE_PUENTES), no de una lista aqui. */}
            <div className="space-y-4">
            {GRUPOS_DE_PUENTES.map((grupo) => (
            <div key={grupo.categoria} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-3">
                <h4 className="text-sm font-bold text-[#001e40]">{grupo.titulo}</h4>
                <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{grupo.descripcion}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {grupo.puentes.map((puente) => {
                // Todas las claves de la fila apuntan a la misma cuenta; se lee
                // de la primera que tenga valor para no perder lo ya guardado
                // si una empresa antigua solo tiene enlazada una de las dos.
                const valor = puente.claves.map(k => p.draftMappings[k]).find(Boolean) || '';
                // Solo cuentas del tipo que el sistema espera: apuntar "Ingresos
                // por Ventas" a un gasto descuadra el estado de resultados. La
                // ya elegida se deja SIEMPRE, aunque no encaje: si la quitara de
                // la lista, el desplegable se abriria en blanco y guardar
                // borraria el enlace sin que nadie lo pidiera.
                const elegibles = p.accounts.filter(acc =>
                  (acc.isTransactional && acc.type === puente.tipo) || acc.id === valor);
                return (
                  <div key={puente.codigo} className="space-y-1">
                    <label htmlFor={`puente-${puente.codigo}`} className="block text-xs font-bold text-slate-700 uppercase">{puente.etiqueta}</label>
                    <select
                      id={`puente-${puente.codigo}`}
                      value={valor}
                      onChange={e => p.setDraftMappings(prev => ({
                        ...prev,
                        ...Object.fromEntries(puente.claves.map(k => [k, e.target.value])),
                      }))}
                      disabled={p.mappingSubmitting}
                      className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 bg-slate-50 text-slate-800 focus:border-[#c5a059] outline-none"
                    >
                      <option value="" disabled>-- Seleccione cuenta puente --</option>
                      {elegibles.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 leading-tight">Sugerida: {puente.codigo}</p>
                  </div>
                );
              })}
              </div>
            </div>
            ))}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={p.mappingSubmitting}
                className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
              >
                {p.mappingSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Guardar Cuentas Puente
              </button>
            </div>
          </form>
  );
}
