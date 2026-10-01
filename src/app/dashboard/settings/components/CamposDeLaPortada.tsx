/**
 * Los tres textos de la portada de la tienda (lote 235; aparte desde el 236).
 * Solo pinta: el estado es de `usePortadaDeLaTienda`.
 */
import { LIMITES_DE_PORTADA } from '@/services/storefront/portada';
import type { DatosDePortada, FormularioDePortada } from '../hooks/usePortadaDeLaTienda';

const campo = 'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors';

function Contador({ valor, tope }: { valor: string; tope: number }) {
  const pasa = valor.length > tope;
  return <span className={pasa ? 'text-[10px] font-semibold text-rose-600' : 'text-[10px] text-slate-400'}>{valor.length} / {tope}</span>;
}

export function CamposDeLaPortada({ f, porDefecto, cambiar }: {
  f: FormularioDePortada; porDefecto: DatosDePortada['porDefecto']; cambiar: (clave: keyof FormularioDePortada, valor: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-600 leading-relaxed">
        Lo primero que ve quien entra a la tienda de esta empresa. Cada campo <strong>vacío usa lo de siempre</strong>,
        que es lo que aparece de ejemplo.
      </p>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label htmlFor="portada-anuncio" className="text-xs font-semibold text-[#001e40]">Anuncio de arriba</label>
          <Contador valor={f.anuncio} tope={LIMITES_DE_PORTADA.anuncio} />
        </div>
        <input id="portada-anuncio" type="text" value={f.anuncio} onChange={(e) => cambiar('anuncio', e.target.value)}
          placeholder="Vacío: sin barra de anuncio" className={campo} />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label htmlFor="portada-titulo" className="text-xs font-semibold text-[#001e40]">Título</label>
          <Contador valor={f.titulo} tope={LIMITES_DE_PORTADA.titulo} />
        </div>
        <input id="portada-titulo" type="text" value={f.titulo} onChange={(e) => cambiar('titulo', e.target.value)}
          placeholder={porDefecto.titulo} className={campo} />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label htmlFor="portada-texto" className="text-xs font-semibold text-[#001e40]">Texto</label>
          <Contador valor={f.texto} tope={LIMITES_DE_PORTADA.texto} />
        </div>
        <textarea id="portada-texto" value={f.texto} onChange={(e) => cambiar('texto', e.target.value)} rows={4}
          placeholder={porDefecto.texto} className={`${campo} resize-none`} />
      </div>
    </div>
  );
}
