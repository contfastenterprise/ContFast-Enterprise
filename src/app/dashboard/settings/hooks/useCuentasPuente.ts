'use client';

/**
 * Las cuentas puente de Configuracion: el catalogo, lo elegido y guardar.
 * Sale de `settings/page.tsx` en el lote 238, movido tal cual. `cargar` lo
 * llama `useAjustes` al terminar de leer los ajustes, como hacia la pagina.
 */
import { useState } from 'react';
import { toast } from 'sonner';

export function useCuentasPuente() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [draftMappings, setDraftMappings] = useState<Record<string, string>>({});
  const [mappingSubmitting, setMappingSubmitting] = useState(false);

  const cargar = async () => {
        try {
          const [accRes, mapRes] = await Promise.all([
            fetch('/api/v1/accounting/accounts'),
            fetch('/api/v1/accounting/mappings')
          ]);
          const accData = await accRes.json();
          const mapData = await mapRes.json();
          if (accData.success) setAccounts(accData.data);
          if (mapData.success) {
            const m = mapData.data.reduce((acc: any, curr: any) => {
              acc[curr.mappingKey] = curr.accountId;
              return acc;
            }, {});
            setDraftMappings(m);
          }
        } catch (err) {
          console.error('Error al cargar contabilidad', err);
        }
  };

  const handleSaveMappings = async (e: React.FormEvent) => {
    e.preventDefault();
    setMappingSubmitting(true);
    try {
      // Lote 171: una clave sin cuenta elegida no se manda. Antes se enviaba
      // el `accountId` vacio, que no enlaza nada y solo genera una peticion
      // fallida por cada puente que el contador no haya configurado todavia.
      const promises = Object.entries(draftMappings).filter(([, accountId]) => !!accountId).map(([key, accountId]) =>
        fetch('/api/v1/accounting/mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mappingKey: key, accountId })
        })
      );
      await Promise.all(promises);
      toast.success('Cuentas puente guardadas exitosamente.');
    } catch (error) {
      toast.error('Error al guardar las cuentas puente');
    } finally {
      setMappingSubmitting(false);
    }
  };

  return { accounts, draftMappings, setDraftMappings, mappingSubmitting, cargar, handleSaveMappings };
}

export type Puentes = ReturnType<typeof useCuentasPuente>;
