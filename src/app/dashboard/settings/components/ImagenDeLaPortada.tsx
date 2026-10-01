'use client';

/**
 * La imagen de la portada de la tienda (lote 235; aparte desde el 236): vista
 * previa, subir / cambiar y quitar. El estado es de `usePortadaDeLaTienda`;
 * aqui solo vive la referencia al campo de fichero.
 */
import { useRef } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';

const TIPOS = 'image/jpeg,image/png,image/webp';

export function ImagenDeLaPortada({ imagenUrl, subiendo, subir, quitar }: {
  imagenUrl: string; subiendo: boolean; subir: (file: File | undefined) => Promise<void>; quitar: () => void;
}) {
  const fichero = useRef<HTMLInputElement>(null);
  const alElegir = (file: File | undefined) => {
    //  Se vacia el campo al terminar: elegir otra vez el MISMO fichero tiene que volver a subirlo.
    void subir(file).finally(() => { if (fichero.current) fichero.current.value = ''; });
  };
  return (
    <div className="space-y-1">
      <span id="etiqueta-portada-imagen" className="block text-xs font-semibold text-[#001e40]">Imagen</span>
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {imagenUrl
          ? <img src={imagenUrl} alt="Imagen de la portada" className="h-full w-full object-cover" />
          : <div className="flex flex-col items-center text-slate-400"><ImagePlus className="h-7 w-7 opacity-40" aria-hidden="true" /><span className="mt-1 text-[10px]">Vacía: el logo</span></div>}
        {subiendo && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70" role="status" aria-label="Subiendo la imagen">
            <Loader2 className="h-5 w-5 animate-spin text-[#001e40]" />
          </div>
        )}
      </div>
      <input ref={fichero} id="portada-imagen" type="file" accept={TIPOS} aria-labelledby="etiqueta-portada-imagen" className="sr-only"
        onChange={(e) => alElegir(e.target.files?.[0])} />
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => fichero.current?.click()} disabled={subiendo}
          className="text-xs font-bold text-[#c5a059] hover:text-[#d4b069] disabled:opacity-50">
          {imagenUrl ? 'Cambiar' : 'Subir imagen'}
        </button>
        {imagenUrl && (
          <button type="button" onClick={quitar} disabled={subiendo}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600 disabled:opacity-50">
            <Trash2 className="h-3 w-3" aria-hidden="true" /> Quitar
          </button>
        )}
      </div>
      <p className="text-[10px] text-slate-500">JPG, PNG o WebP. Se reduce sola al subirla; mejor apaisada.</p>
    </div>
  );
}
