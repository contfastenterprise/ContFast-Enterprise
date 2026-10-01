'use client';

/**
 * Los favoritos de un visitante, en su navegador (lote 231).
 *
 * Se leen en un EFECTO y no en el inicializador del estado: el servidor no
 * tiene `localStorage`, y leerlo mientras se pinta daba un HTML distinto en
 * los dos lados — el error de hidratacion del lote 195. Hasta leer, `listo` es
 * `false`, y quien pinta "no tienes favoritos" tiene que esperarlo, o lo diria
 * un instante a quien si los tiene.
 *
 * Todas las instancias (el corazon de cada tarjeta, el contador de la cabecera,
 * la lista) se enteran de los cambios por un evento de ventana, y de los de
 * otra pestana por `storage`.
 */
import { useCallback, useEffect, useState } from 'react';
import { alternarFavorito, claveDeFavoritos, EVENTO_FAVORITOS, leerFavoritos } from '@/services/storefront/favoritos';

function leer(clave: string): string[] {
  try {
    return leerFavoritos(window.localStorage.getItem(clave));
  } catch {
    return [];
  }
}

export function useFavoritos(empresaSlug: string) {
  const clave = claveDeFavoritos(empresaSlug);
  const [lista, setLista] = useState<string[]>([]);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const recargar = () => setLista(leer(clave));
    const deOtraPestana = (e: StorageEvent) => { if (e.key === clave) recargar(); };
    recargar();
    setListo(true);
    window.addEventListener(EVENTO_FAVORITOS, recargar);
    window.addEventListener('storage', deOtraPestana);
    return () => {
      window.removeEventListener(EVENTO_FAVORITOS, recargar);
      window.removeEventListener('storage', deOtraPestana);
    };
  }, [clave]);

  const alternar = useCallback((id: string) => {
    //  Se parte de lo GUARDADO, no del estado: otra tarjeta puede haber
    //  cambiado la lista en el mismo instante.
    const nueva = alternarFavorito(leer(clave), id);
    try { window.localStorage.setItem(clave, JSON.stringify(nueva)); } catch { /* navegador sin almacenamiento */ }
    setLista(nueva);
    window.dispatchEvent(new Event(EVENTO_FAVORITOS));
  }, [clave]);

  return { lista, listo, alternar };
}
