'use client';

/**
 * El estado de la portada de la tienda (lotes 235 y 236): lo que se carga, lo
 * que se escribe, subir la imagen y guardar.
 *
 * Es un hook que crea la PAGINA de Configuracion, y no estado dentro de la
 * tarjeta, por dos motivos (lote 236):
 *
 *  · la portada se pide AL PULSAR la pestana "Tienda" (`cargar`), no en un
 *    efecto al montar la tarjeta. Mismo criterio que el visor del conduce
 *    (lote 224): lo que se pide por una accion del usuario se pide en esa accion;
 *  · lo escrito SOBREVIVE a cambiar de pestana. Con el estado dentro de la
 *    tarjeta, ir a "Empresa" y volver la desmontaba y se perdia lo escrito sin
 *    guardar. Por eso `cargar` no vuelve a pedir lo que ya tiene.
 *
 * Las guardas de re-entrada son `useRef` y no el estado: dos clics seguidos
 * llegan antes de volver a pintar y los dos verian el estado en `false`
 * (lo mismo que "Aplicar Despacho" en el lote 227).
 */
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { leerRespuesta } from '@/utils/leerRespuesta';
import { reducirImagen } from '@/utils/reducirImagen';
import { PESO_MAXIMO_DEL_ORIGINAL } from '@/services/productos/fotoDeProducto';
import { LIMITES_DE_PORTADA, type PortadaGuardada } from '@/services/storefront/portada';

/** La portada ocupa media pantalla: algo mas grande que la foto de un producto. */
const LADO_DE_LA_PORTADA = 1600;
const DIRECCION = '/api/v1/company/settings/portada';

export type DatosDePortada = { portada: PortadaGuardada; porDefecto: { titulo: string; texto: string }; tienda: string };
export type FormularioDePortada = { anuncio: string; titulo: string; texto: string; imagenUrl: string };

const aFormulario = (p: PortadaGuardada): FormularioDePortada =>
  ({ anuncio: p.anuncio ?? '', titulo: p.titulo ?? '', texto: p.texto ?? '', imagenUrl: p.imagenUrl ?? '' });

export function usePortadaDeLaTienda() {
  const [datos, setDatos] = useState<DatosDePortada | null>(null);
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null);
  const [f, setF] = useState<FormularioDePortada>({ anuncio: '', titulo: '', texto: '', imagenUrl: '' });
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const cargada = useRef(false);
  const cargando = useRef(false);
  const subiendoYa = useRef(false);
  const guardandoYa = useRef(false);

  const cargar = useCallback(async () => {
    //  Ya cargada: no se vuelve a pedir, o pisaria lo escrito sin guardar.
    if (cargada.current || cargando.current) return;
    cargando.current = true;
    setErrorDeCarga(null);
    try {
      const leido = await leerRespuesta<{ data: DatosDePortada }>(await fetch(DIRECCION));
      if (!leido.bien) { setErrorDeCarga(leido.mensaje || 'No se pudo cargar la portada.'); return; }
      cargada.current = true;
      setDatos(leido.cuerpo.data);
      setF(aFormulario(leido.cuerpo.data.portada));
    } catch {
      setErrorDeCarga('No se pudo cargar la portada. Revisa la conexión.');
    } finally {
      cargando.current = false;
    }
  }, []);

  const cambiar = useCallback((clave: keyof FormularioDePortada, valor: string) => setF((prev) => ({ ...prev, [clave]: valor })), []);

  /** Termina siempre, haya salido bien o no: quien llama limpia entonces su campo de fichero. */
  const subir = useCallback(async (file: File | undefined) => {
    if (!file || subiendoYa.current) return;
    if (file.size > PESO_MAXIMO_DEL_ORIGINAL) { toast.error('La imagen pesa más de 25 MB. Elige otra.'); return; }
    subiendoYa.current = true;
    setSubiendo(true);
    try {
      let reducida: File;
      try { reducida = await reducirImagen(file, LADO_DE_LA_PORTADA); }
      catch (e) { toast.error(e instanceof Error && e.message ? e.message : 'No se pudo preparar la imagen.'); return; }
      const cuerpo = new FormData();
      cuerpo.append('file', reducida);
      const leido = await leerRespuesta<{ data: { imageUrl: string } }>(await fetch(`${DIRECCION}/imagen`, { method: 'POST', body: cuerpo }));
      if (!leido.bien) { toast.error(leido.mensaje || 'No se pudo subir la imagen.'); return; }
      const { imageUrl } = leido.cuerpo.data;
      setF((prev) => ({ ...prev, imagenUrl: imageUrl }));
      toast.success('Imagen subida. Se guarda al guardar la portada.');
    } catch {
      toast.error('No se pudo subir la imagen. Revisa la conexión.');
    } finally {
      subiendoYa.current = false;
      setSubiendo(false);
    }
  }, []);

  const guardar = useCallback(async () => {
    if (guardandoYa.current) return;
    guardandoYa.current = true;
    setGuardando(true);
    try {
      const leido = await leerRespuesta<{ data: { portada: PortadaGuardada } }>(await fetch(DIRECCION, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
      }));
      if (!leido.bien) { toast.error(leido.mensaje || 'No se pudo guardar la portada.'); return; }
      //  Se queda con lo GUARDADO, no con lo escrito: el servidor recorta y junta espacios.
      setF(aFormulario(leido.cuerpo.data.portada));
      toast.success('Portada guardada. Ya se ve en la tienda.');
    } catch {
      toast.error('No se pudo guardar la portada. Revisa la conexión.');
    } finally {
      guardandoYa.current = false;
      setGuardando(false);
    }
  }, [f]);

  const pasaDelTope = (['anuncio', 'titulo', 'texto'] as const).some((k) => f[k].length > LIMITES_DE_PORTADA[k]);

  return { datos, errorDeCarga, f, guardando, subiendo, pasaDelTope, cargar, cambiar, subir, guardar };
}

export type PortadaDeAjustes = ReturnType<typeof usePortadaDeLaTienda>;
