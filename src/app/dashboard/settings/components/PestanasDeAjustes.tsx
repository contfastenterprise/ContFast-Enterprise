/**
 * Las pestanas de Configuracion (lote 239). Eran seis botones escritos uno a
 * uno en la pagina, cada cual con su copia de las clases y de la condicion de
 * rol; ahora salen de `PESTANAS`. Solo pinta: cual esta activa y que pasa al
 * elegir una lo decide la pagina.
 */
import { PESTANAS, type PestanaDeAjustes } from '../ajustes';

export function PestanasDeAjustes({ activa, puedeConfigurar, alElegir }: {
  activa: PestanaDeAjustes; puedeConfigurar: boolean; alElegir: (pestana: PestanaDeAjustes) => void;
}) {
  return (
          <div className="flex border-b border-slate-200">
            {PESTANAS.filter((t) => !t.deConfiguracion || puedeConfigurar).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => alElegir(t.id)}
                className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 transition-colors -mb-px ${
                  activa === t.id
                    ? 'border-[#003366] text-[#003366]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {t.nombre}
              </button>
            ))}
          </div>
  );
}
