'use client';

/**
 * La portada de la tienda publica de esta empresa (lote 235): el anuncio de
 * arriba, el titulo, el texto y la imagen. Decision del dueno al redisenar la
 * tienda (lote 231).
 *
 * Vive en su propia pestana de Configuracion, "Tienda" (pedido del dueno), y
 * se vale sola -- carga lo suyo y guarda lo suyo con su propio boton, contra
 * `/api/v1/company/settings/portada` -- en vez de colgar del formulario grande
 * de la empresa. Alli un ajuste nuevo tiene seis
 * sitios que tocar y ya se quedo uno sin escribir (lotes 178 y 200); aqui lo
 * que se ve es lo que se manda y lo que se manda es lo que se guarda.
 *
 * VACIO NO ES UN ERROR: cada campo vacio usa lo de siempre, y el ejemplo de
 * cada campo ensena que es "lo de siempre".
 */
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, ImagePlus, Loader2, Save, Store, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { leerRespuesta } from '@/utils/leerRespuesta';
import { reducirImagen } from '@/utils/reducirImagen';
import { PESO_MAXIMO_DEL_ORIGINAL } from '@/services/productos/fotoDeProducto';
import { LIMITES_DE_PORTADA, type PortadaGuardada } from '@/services/storefront/portada';

/** La portada ocupa media pantalla: algo mas grande que la foto de un producto. */
const LADO_DE_LA_PORTADA = 1600;
const TIPOS = 'image/jpeg,image/png,image/webp';

type Datos = { portada: PortadaGuardada; porDefecto: { titulo: string; texto: string }; tienda: string };
type Formulario = { anuncio: string; titulo: string; texto: string; imagenUrl: string };

const campo = 'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors';

function Contador({ valor, tope }: { valor: string; tope: number }) {
  const pasa = valor.length > tope;
  return <span className={pasa ? 'text-[10px] font-semibold text-rose-600' : 'text-[10px] text-slate-400'}>{valor.length} / {tope}</span>;
}

export function PortadaDeLaTienda() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null);
  const [f, setF] = useState<Formulario>({ anuncio: '', titulo: '', texto: '', imagenUrl: '' });
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const enCurso = useRef(false);
  const fichero = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const leido = await leerRespuesta<{ data: Datos }>(await fetch('/api/v1/company/settings/portada'));
        if (!vivo) return;
        if (!leido.bien) { setErrorDeCarga(leido.mensaje || 'No se pudo cargar la portada.'); return; }
        const d = leido.cuerpo.data;
        setDatos(d);
        setF({ anuncio: d.portada.anuncio ?? '', titulo: d.portada.titulo ?? '', texto: d.portada.texto ?? '', imagenUrl: d.portada.imagenUrl ?? '' });
      } catch {
        if (vivo) setErrorDeCarga('No se pudo cargar la portada. Revisa la conexión.');
      }
    })();
    return () => { vivo = false; };
  }, []);

  const cambiar = (clave: keyof Formulario, valor: string) => setF((prev) => ({ ...prev, [clave]: valor }));

  const subir = async (file: File | undefined) => {
    if (!file || enCurso.current) return;
    if (file.size > PESO_MAXIMO_DEL_ORIGINAL) { toast.error('La imagen pesa más de 25 MB. Elige otra.'); return; }
    enCurso.current = true;
    setSubiendo(true);
    try {
      let reducida: File;
      try { reducida = await reducirImagen(file, LADO_DE_LA_PORTADA); }
      catch (e) { toast.error(e instanceof Error && e.message ? e.message : 'No se pudo preparar la imagen.'); return; }
      const cuerpo = new FormData();
      cuerpo.append('file', reducida);
      const leido = await leerRespuesta<{ data: { imageUrl: string } }>(await fetch('/api/v1/company/settings/portada/imagen', { method: 'POST', body: cuerpo }));
      if (!leido.bien) { toast.error(leido.mensaje || 'No se pudo subir la imagen.'); return; }
      cambiar('imagenUrl', leido.cuerpo.data.imageUrl);
      toast.success('Imagen subida. Se guarda al guardar la portada.');
    } catch {
      toast.error('No se pudo subir la imagen. Revisa la conexión.');
    } finally {
      enCurso.current = false;
      setSubiendo(false);
      if (fichero.current) fichero.current.value = '';
    }
  };

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      const leido = await leerRespuesta<{ data: { portada: PortadaGuardada } }>(await fetch('/api/v1/company/settings/portada', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
      }));
      if (!leido.bien) {
        toast.error(leido.mensaje || 'No se pudo guardar la portada.');
        return;
      }
      //  Se queda con lo GUARDADO, no con lo escrito: el servidor recorta y junta espacios.
      const p = leido.cuerpo.data.portada;
      setF({ anuncio: p.anuncio ?? '', titulo: p.titulo ?? '', texto: p.texto ?? '', imagenUrl: p.imagenUrl ?? '' });
      toast.success('Portada guardada. Ya se ve en la tienda.');
    } catch {
      toast.error('No se pudo guardar la portada. Revisa la conexión.');
    } finally {
      setGuardando(false);
    }
  };

  const pasaDelTope = (['anuncio', 'titulo', 'texto'] as const).some((k) => f[k].length > LIMITES_DE_PORTADA[k]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Store className="w-5 h-5 text-[#003366]" />
          <h3 className="font-bold text-[#003366]">Portada de la tienda</h3>
        </div>
        {datos && (
          <a href={datos.tienda} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-[#003366] hover:underline">
            Ver la tienda <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        )}
      </div>

      <div className="p-4">
        {errorDeCarga ? (
          <p role="alert" className="text-xs font-medium text-rose-600">{errorDeCarga}</p>
        ) : !datos ? (
          <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando la portada…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-5">
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
                  placeholder={datos.porDefecto.titulo} className={campo} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="portada-texto" className="text-xs font-semibold text-[#001e40]">Texto</label>
                  <Contador valor={f.texto} tope={LIMITES_DE_PORTADA.texto} />
                </div>
                <textarea id="portada-texto" value={f.texto} onChange={(e) => cambiar('texto', e.target.value)} rows={4}
                  placeholder={datos.porDefecto.texto} className={`${campo} resize-none`} />
              </div>
            </div>

            <div className="space-y-1">
              <span id="etiqueta-portada-imagen" className="block text-xs font-semibold text-[#001e40]">Imagen</span>
              <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                {f.imagenUrl
                  ? <img src={f.imagenUrl} alt="Imagen de la portada" className="h-full w-full object-cover" />
                  : <div className="flex flex-col items-center text-slate-400"><ImagePlus className="h-7 w-7 opacity-40" aria-hidden="true" /><span className="mt-1 text-[10px]">Vacía: el logo</span></div>}
                {subiendo && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/70" role="status" aria-label="Subiendo la imagen">
                    <Loader2 className="h-5 w-5 animate-spin text-[#001e40]" />
                  </div>
                )}
              </div>
              <input ref={fichero} id="portada-imagen" type="file" accept={TIPOS} aria-labelledby="etiqueta-portada-imagen" className="sr-only"
                onChange={(e) => subir(e.target.files?.[0])} />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => fichero.current?.click()} disabled={subiendo}
                  className="text-xs font-bold text-[#c5a059] hover:text-[#d4b069] disabled:opacity-50">
                  {f.imagenUrl ? 'Cambiar' : 'Subir imagen'}
                </button>
                {f.imagenUrl && (
                  <button type="button" onClick={() => cambiar('imagenUrl', '')} disabled={subiendo}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600 disabled:opacity-50">
                    <Trash2 className="h-3 w-3" aria-hidden="true" /> Quitar
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-500">JPG, PNG o WebP. Se reduce sola al subirla; mejor apaisada.</p>
            </div>

            <div className="md:col-span-2 flex justify-end border-t border-slate-200 pt-3">
              <button type="button" onClick={guardar} disabled={guardando || subiendo || pasaDelTope}
                className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar portada
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
