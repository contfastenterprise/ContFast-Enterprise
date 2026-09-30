'use client';

/**
 * El historico de cierres: la lista, sus filtros, exportarla, ver una sesion y
 * dar por revisada una diferencia (lote 176). Salio de `page.tsx` al partirla
 * (lote 229), sin cambiar una linea; lo unico nuevo es `recargarCaja`, porque
 * aprobar una diferencia recarga la caja, que vive en `useCaja`.
 */
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { motivoDeCarga } from '@/components/ui/estado-carga';
//  Lote 230: el estado antes que el cuerpo (el lector del lote 227).
import { leerRespuesta } from '@/utils/leerRespuesta';
import { formatDateTimeDisplay } from '@/utils/fechasLocales';
import type { HistorySession } from '../caja';

export function useHistorialCaja({ recargarCaja }: { recargarCaja: () => Promise<void> }) {
  const [history, setHistory] = useState<HistorySession[]>([]);
  // P2-37: el fallo de carga NO se limpia solo. Mientras este puesto, la lista
  // enseña el error en vez de su mensaje de vacio.
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  // Lote 176: la sesion cuya diferencia se esta dando por revisada.
  const [aprobando, setAprobando] = useState<string | null>(null);

  const aprobarDiferencia = async (id: string) => {
    setAprobando(id);
    try {
      const res = await fetch(`/api/v1/cash/sessions/${id}/approve`, { method: 'POST' });
      const leido = await leerRespuesta(res);
      if (!leido.bien) throw new Error(leido.mensaje || 'No se pudo aprobar.');
      toast.success('Diferencia dada por revisada', {
        description: 'El aviso del panel se apaga solo la próxima vez que se actualice.',
      });
      await recargarCaja();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo aprobar.');
    } finally {
      setAprobando(null);
    }
  };
  // History View Modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  // History filters
  const [histDateFrom, setHistDateFrom] = useState('');
  const [histStatus, setHistStatus] = useState('');
  const loadHistory = useCallback(async () => {
    setErrorCarga(null);
    try {
      const res = await fetch('/api/v1/cash/sessions');
      const leido = await leerRespuesta<{ data: HistorySession[] }>(res);
      if (leido.bien) {
        setHistory(leido.cuerpo.data || []);
      } else {
        setHistory([]);
        setErrorCarga(motivoDeCarga(null, leido.mensaje));
      }
    } catch (err) {
      // El catch no ligaba el error, asi que no habia ni que registrar.
      setHistory([]);
      setErrorCarga(motivoDeCarga(err));
      toast.error('Error al cargar historial.');
    }
  }, []);
  const handleExportHistory = () => {
    if (history.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    const headers = ['Terminal', 'Usuario', 'Apertura', 'Cierre', 'Fondo Inicial', 'Saldo Esperado', 'Saldo Real', 'Diferencia', 'Estado'];
    const csvContent = [
      headers.join(','),
      ...history.map(h => [
        h.registerName,
        h.userId,
        formatDateTimeDisplay(h.createdAt),
        h.closedAt ? formatDateTimeDisplay(h.closedAt) : 'Abierto',
        h.initialBalance || 0,
        h.expectedBalance || 0,
        h.actualBalance || 0,
        h.difference || 0,
        h.status === 'open' ? 'Abierto' : 'Cerrado'
      ].map(v => `"${v}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `historico_caja_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    //  Lote 230: soltar el fichero de la memoria una vez descargado (React Doctor).
    URL.revokeObjectURL(url);
    toast.success('Archivo exportado exitosamente');
  };

  return { history, setHistory, errorCarga, setErrorCarga, aprobando, setAprobando, aprobarDiferencia, showViewModal, setShowViewModal, selectedSession, setSelectedSession, histDateFrom, setHistDateFrom, histStatus, setHistStatus, loadHistory, handleExportHistory };
}

export type HistorialCaja = ReturnType<typeof useHistorialCaja>;
