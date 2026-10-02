'use client';

/**
 * Las cuentas puente de Configuracion: el catalogo, lo elegido y guardar.
 * Sale de `settings/page.tsx` en el lote 238. `cargar` lo llama `useAjustes`
 * al terminar de leer los ajustes, como hacia la pagina.
 *
 * Lote 239 -- GUARDAR DECIA "guardadas exitosamente" SIN MIRAR NADA. Mandaba
 * una peticion por cuenta y no leia ninguna respuesta: con un 403 o un 500 en
 * todas, el aviso era el mismo verde. Ahora se mira cada una y, si alguna no
 * se guardo, se dice cuantas y por que.
 */
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { leerRespuesta } from '@/utils/leerRespuesta';
import { avisoDeCuentasPuente } from '../ajustes';

type Cuenta = { id: string; code: string; name: string; type: string; isTransactional: boolean };
type Enlace = { mappingKey: string; accountId: string };

export function useCuentasPuente() {
  // Mappings Tab States
  const [accounts, setAccounts] = useState<Cuenta[]>([]);
  const [draftMappings, setDraftMappings] = useState<Record<string, string>>({});
  const [mappingSubmitting, setMappingSubmitting] = useState(false);
  const guardandoYa = useRef(false);

  const cargar = useCallback(async () => {
    try {
      const [cuentas, enlaces] = await Promise.all([
        fetch('/api/v1/accounting/accounts').then((r) => leerRespuesta<{ data: Cuenta[] }>(r)),
        fetch('/api/v1/accounting/mappings').then((r) => leerRespuesta<{ data: Enlace[] }>(r)),
      ]);
      if (cuentas.bien) setAccounts(cuentas.cuerpo.data);
      if (enlaces.bien) {
        setDraftMappings(Object.fromEntries(enlaces.cuerpo.data.map((e) => [e.mappingKey, e.accountId])));
      }
    } catch (err) {
      console.error('Error al cargar contabilidad', err);
    }
  }, []);

  const handleSaveMappings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardandoYa.current) return;
    guardandoYa.current = true;
    setMappingSubmitting(true);
    try {
      // Lote 171: una clave sin cuenta elegida no se manda. Antes se enviaba
      // el `accountId` vacio, que no enlaza nada y solo genera una peticion
      // fallida por cada puente que el contador no haya configurado todavia.
      const elegidas = Object.entries(draftMappings).filter(([, accountId]) => !!accountId);
      const resultados = await Promise.all(elegidas.map(async ([key, accountId]) =>
        leerRespuesta(await fetch('/api/v1/accounting/mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mappingKey: key, accountId })
        }))
      ));
      const aviso = avisoDeCuentasPuente(resultados.map((r) => ({ bien: r.bien, mensaje: r.bien ? undefined : r.mensaje })));
      if (aviso.bien) toast.success(aviso.texto);
      else toast.error(aviso.texto);
    } catch (error) {
      toast.error('Error al guardar las cuentas puente');
    } finally {
      guardandoYa.current = false;
      setMappingSubmitting(false);
    }
  };

  return { accounts, draftMappings, setDraftMappings, mappingSubmitting, cargar, handleSaveMappings };
}

export type Puentes = ReturnType<typeof useCuentasPuente>;
