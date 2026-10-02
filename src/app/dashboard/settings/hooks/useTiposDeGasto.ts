'use client';

/**
 * Los tipos de gasto de Configuracion: la lista, el modal de crear/editar y
 * desactivar o eliminar. Sale de `settings/page.tsx` en el lote 238.
 *
 * Lote 239: las respuestas se leen con `leerRespuesta`, que mira el ESTADO
 * antes que el cuerpo. Lo que eso escondia aqui: si la lista no se podia leer
 * (un 403, un 5xx) la pantalla decia "No hay tipos de gastos registrados", que
 * es falso; ahora dice el motivo. Y guardar lleva guarda de re-entrada en un
 * `useRef`: dos clics seguidos creaban el tipo dos veces (el segundo, rechazado
 * por codigo repetido, dejaba un error en pantalla tras un guardado bueno).
 */
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/providers/confirm-provider';
import { leerRespuesta } from '@/utils/leerRespuesta';
import { esTipoEstandar, type TipoDeGasto } from '../ajustes';

const DIRECCION = '/api/v1/expenses/types';

export function useTiposDeGasto() {
  const confirm = useConfirm();
  // Expense Types States
  const [expenseTypes, setExpenseTypes] = useState<TipoDeGasto[]>([]);
  const [loadingExpenseTypes, setLoadingExpenseTypes] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<TipoDeGasto | null>(null);
  const [typeCode, setTypeCode] = useState('');
  const [typeName, setTypeName] = useState('');
  const [typeStatus, setTypeStatus] = useState<'active' | 'inactive'>('active');
  const [savingType, setSavingType] = useState(false);
  const guardandoYa = useRef(false);

  const fetchExpenseTypes = useCallback(async () => {
    setLoadingExpenseTypes(true);
    try {
      const leido = await leerRespuesta<{ data: TipoDeGasto[] }>(await fetch(DIRECCION));
      if (leido.bien) setExpenseTypes(leido.cuerpo.data || []);
      else toast.error(leido.mensaje || 'Error al cargar tipos de gastos');
    } catch (e) {
      console.error('Error loading expense types:', e);
      toast.error('Error al cargar tipos de gastos');
    } finally {
      setLoadingExpenseTypes(false);
    }
  }, []);

  const handleOpenTypeModal = (type: TipoDeGasto | null = null) => {
    if (type) {
      setEditingType(type);
      setTypeCode(type.code);
      setTypeName(type.name);
      setTypeStatus(type.status);
    } else {
      setEditingType(null);
      setTypeCode('');
      setTypeName('');
      setTypeStatus('active');
    }
    setShowTypeModal(true);
  };

  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardandoYa.current) return;
    if (!typeCode.trim() || typeCode.trim().length !== 2 || isNaN(Number(typeCode))) {
      return toast.error('El código debe tener exactamente 2 dígitos numéricos.');
    }
    if (!typeName.trim()) {
      return toast.error('El nombre del tipo de gasto es requerido.');
    }

    guardandoYa.current = true;
    setSavingType(true);
    try {
      const url = editingType ? `${DIRECCION}/${editingType.id}` : DIRECCION;
      const method = editingType ? 'PUT' : 'POST';
      const leido = await leerRespuesta(await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: typeCode,
          name: typeName,
          status: typeStatus
        })
      }));
      if (leido.bien) {
        toast.success(editingType ? 'Tipo de gasto actualizado con éxito.' : 'Tipo de gasto creado con éxito.');
        fetchExpenseTypes();
        setShowTypeModal(false);
      } else {
        toast.error(leido.mensaje || 'Error al guardar el tipo de gasto');
      }
    } catch (err) {
      console.error('Error saving expense type:', err);
      toast.error('Ocurrió un error al guardar');
    } finally {
      guardandoYa.current = false;
      setSavingType(false);
    }
  };

  const handleDeleteType = async (type: TipoDeGasto) => {
    const isStandard = esTipoEstandar(type.code);
    const confirmMessage = isStandard
      ? `¿Estás seguro de que deseas desactivar el tipo de gasto estándar "${type.code} - ${type.name}"? Los tipos de gastos estándares no se eliminan físicamente, solo se desactivan de los desplegables.`
      : `¿Estás seguro de que deseas eliminar permanentemente el tipo de gasto personalizado "${type.code} - ${type.name}"?`;

    await confirm({
      title: 'Confirmar eliminación',
      description: confirmMessage,
      action: async () => {
        try {
          const leido = await leerRespuesta(await fetch(`${DIRECCION}/${type.id}`, {
            method: 'DELETE'
          }));
          if (leido.bien) {
            toast.success(isStandard ? 'Tipo de gasto desactivado.' : 'Tipo de gasto eliminado.');
            fetchExpenseTypes();
          } else {
            toast.error(leido.mensaje || 'Error al eliminar');
          }
        } catch (err) {
          console.error('Error deleting type:', err);
          toast.error('Error al realizar la operación');
        }
      }
    });
  };

  return {
    expenseTypes, loadingExpenseTypes, showTypeModal, setShowTypeModal, editingType, typeCode, setTypeCode, typeName, setTypeName,
    typeStatus, setTypeStatus, savingType, fetchExpenseTypes, handleOpenTypeModal, handleSaveType, handleDeleteType,
  };
}

export type TiposDeGasto = ReturnType<typeof useTiposDeGasto>;
