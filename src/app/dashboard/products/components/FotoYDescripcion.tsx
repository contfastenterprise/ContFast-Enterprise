'use client';

/**
 * La foto y la descripcion de un producto, que es lo que la tienda publica
 * ensena de el (lote 234). Reportado por el dueno: "no hay opcion para agregar
 * imagen, para que se pueda ver en el catalogo".
 *
 * La foto se REDUCE en el navegador y se SUBE al elegirla
 * (`POST /api/v1/products/image`), y aqui solo queda
 * su direccion; se guarda con el producto al pulsar Guardar, igual al crear que
 * al editar. Quitarla la deja vacia, y el servidor la borra del producto.
 *
 * Va en un fichero aparte a proposito: `products/page.tsx` ya pasa de 2.500
 * lineas, y esto no necesita nada de su estado salvo los dos valores.
 */
import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { leerRespuesta } from '@/utils/leerRespuesta';
import { reducirImagen } from '@/utils/reducirImagen';
import { PESO_MAXIMO_DEL_ORIGINAL } from '@/services/productos/fotoDeProducto';

const TIPOS = 'image/jpeg,image/png,image/webp';

export function FotoYDescripcion({ imageUrl, description, error, alCambiarFoto, alCambiarDescripcion }: {
  imageUrl: string; description: string; error?: string;
  alCambiarFoto: (url: string) => void; alCambiarDescripcion: (texto: string) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  //  Un ref y no el estado: dos elecciones seguidas llegan antes de repintar.
  const enCurso = useRef(false);
  const campo = useRef<HTMLInputElement>(null);

  const subir = async (file: File | undefined) => {
    if (!file || enCurso.current) return;
    if (file.size > PESO_MAXIMO_DEL_ORIGINAL) {
      toast.error('La imagen pesa más de 25 MB. Elige otra.');
      return;
    }
    enCurso.current = true;
    setSubiendo(true);
    try {
      //  Se REDUCE aqui antes de subir (lado mayor 1.200 px, WebP): una foto de
      //  movil de varios MB llega pesando 100-200 KB. El servidor no guarda nada
      //  de mas de 1 MB, se reduzca o no.
      let reducida: File;
      try {
        reducida = await reducirImagen(file);
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : 'No se pudo preparar la imagen.');
        return;
      }
      const cuerpo = new FormData();
      cuerpo.append('file', reducida);
      const leido = await leerRespuesta<{ data: { imageUrl: string } }>(await fetch('/api/v1/products/image', { method: 'POST', body: cuerpo }));
      if (!leido.bien) {
        toast.error(leido.mensaje || 'No se pudo subir la imagen.');
        return;
      }
      alCambiarFoto(leido.cuerpo.data.imageUrl);
      toast.success('Imagen subida. Se guarda al guardar el producto.');
    } catch {
      toast.error('No se pudo subir la imagen. Revisa la conexión.');
    } finally {
      enCurso.current = false;
      setSubiendo(false);
      //  Para poder elegir otra vez el MISMO fichero tras quitarlo.
      if (campo.current) campo.current.value = '';
    }
  };

  return (
    <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-[140px_1fr] gap-3 border-t border-slate-200 pt-3">
      <div className="space-y-1">
        <span id="etiqueta-foto-producto" className="block text-xs font-semibold text-[#001e40]">
          Imagen <span className="text-slate-500 font-normal">(tienda)</span>
        </span>
        <div className="relative flex aspect-square w-full max-w-[140px] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {imageUrl ? (
            <img src={imageUrl} alt="Imagen del producto" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-7 w-7 text-slate-300" aria-hidden="true" />
          )}
          {subiendo && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70" role="status" aria-label="Subiendo la imagen">
              <Loader2 className="h-5 w-5 animate-spin text-[#001e40]" />
            </div>
          )}
        </div>
        <input
          ref={campo}
          id="foto-producto"
          type="file"
          accept={TIPOS}
          aria-labelledby="etiqueta-foto-producto"
          className="sr-only"
          onChange={(e) => subir(e.target.files?.[0])}
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => campo.current?.click()} disabled={subiendo}
            className="text-xs font-bold text-[#c5a059] hover:text-[#d4b069] disabled:opacity-50">
            {imageUrl ? 'Cambiar' : 'Subir imagen'}
          </button>
          {imageUrl && (
            <button type="button" onClick={() => alCambiarFoto('')} disabled={subiendo}
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600 disabled:opacity-50">
              <Trash2 className="h-3 w-3" aria-hidden="true" /> Quitar
            </button>
          )}
        </div>
        <p className="text-[10px] text-slate-500">JPG, PNG o WebP. Se reduce sola al subirla; mejor cuadrada.</p>
        {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}
      </div>

      <div className="space-y-1">
        <label htmlFor="descripcion-producto" className="block text-xs font-semibold text-[#001e40]">
          Descripción <span className="text-slate-500 font-normal">(se ve en la tienda)</span>
        </label>
        <textarea
          id="descripcion-producto"
          value={description}
          onChange={(e) => alCambiarDescripcion(e.target.value)}
          rows={6}
          maxLength={2000}
          className="w-full resize-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none transition-colors"
        />
        <p className="text-[10px] text-slate-500">Material, medidas, acabado… lo que ayude a quien cotiza.</p>
      </div>
    </div>
  );
}
