/**
 * La portada de la tienda publica de esta empresa (lote 235): el anuncio de
 * arriba, el titulo, el texto y la imagen. Decision del dueno al redisenar la
 * tienda (lote 231).
 *
 * Vive en su propia pestana de Configuracion, "Tienda" (pedido del dueno), y
 * guarda lo suyo con su propio boton, contra `/api/v1/company/settings/portada`,
 * en vez de colgar del formulario grande de la empresa. Alli un ajuste nuevo
 * tiene seis sitios que tocar y ya se quedo uno sin escribir (lotes 178 y 200);
 * aqui lo que se ve es lo que se manda y lo que se manda es lo que se guarda.
 *
 * Desde el lote 236 SOLO PINTA: el estado y las acciones son de
 * `usePortadaDeLaTienda`, que crea la pagina (ahi se explica por que).
 *
 * VACIO NO ES UN ERROR: cada campo vacio usa lo de siempre, y el ejemplo de
 * cada campo ensena que es "lo de siempre".
 */
import { ExternalLink, Loader2, Save, Store } from 'lucide-react';
import type { PortadaDeAjustes } from '../hooks/usePortadaDeLaTienda';
import { CamposDeLaPortada } from './CamposDeLaPortada';
import { ImagenDeLaPortada } from './ImagenDeLaPortada';

function Formulario({ portada: p, datos }: { portada: PortadaDeAjustes; datos: NonNullable<PortadaDeAjustes['datos']> }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-5">
      <CamposDeLaPortada f={p.f} porDefecto={datos.porDefecto} cambiar={p.cambiar} />
      <ImagenDeLaPortada imagenUrl={p.f.imagenUrl} subiendo={p.subiendo} subir={p.subir} quitar={() => p.cambiar('imagenUrl', '')} />
      <div className="md:col-span-2 flex justify-end border-t border-slate-200 pt-3">
        <button type="button" onClick={p.guardar} disabled={p.guardando || p.subiendo || p.pasaDelTope}
          className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed text-sm">
          {p.guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar portada
        </button>
      </div>
    </div>
  );
}

function Cuerpo({ portada: p }: { portada: PortadaDeAjustes }) {
  if (p.errorDeCarga) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-xs font-medium text-rose-600">
        <span>{p.errorDeCarga}</span>
        <button type="button" onClick={p.cargar} className="font-bold text-[#003366] hover:underline">Reintentar</button>
      </div>
    );
  }
  if (!p.datos) {
    return <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando la portada…</p>;
  }
  return <Formulario portada={p} datos={p.datos} />;
}

export function PortadaDeLaTienda({ portada }: { portada: PortadaDeAjustes }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Store className="w-5 h-5 text-[#003366]" />
          <h3 className="font-bold text-[#003366]">Portada de la tienda</h3>
        </div>
        {portada.datos && (
          <a href={portada.datos.tienda} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-[#003366] hover:underline">
            Ver la tienda <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
      <div className="p-4">
        <Cuerpo portada={portada} />
      </div>
    </div>
  );
}
