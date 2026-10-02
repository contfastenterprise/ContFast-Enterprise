'use client';

/**
 * Los tipos de gasto de Configuracion: la lista, el modal de crear/editar y
 * desactivar o eliminar. Sale de `settings/page.tsx` en el lote 238, movido tal cual.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/providers/confirm-provider';

export function useTiposDeGasto() {
  const confirm = useConfirm();
  const [expenseTypes, setExpenseTypes] = useState<any[]>([]);
  const [loadingExpenseTypes, setLoadingExpenseTypes] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<any | null>(null);
  const [typeCode, setTypeCode] = useState('');
  const [typeName, setTypeName] = useState('');
  const [typeStatus, setTypeStatus] = useState<'active' | 'inactive'>('active');
  const [savingType, setSavingType] = useState(false);

  const fetchExpenseTypes = async () => {
    setLoadingExpenseTypes(true);
    try {
      const res = await fetch('/api/v1/expenses/types');
      const data = await res.json();
      if (data.success) {
        setExpenseTypes(data.data || []);
      }
    } catch (e) {
      console.error('Error loading expense types:', e);
      toast.error('Error al cargar tipos de gastos');
    } finally {
      setLoadingExpenseTypes(false);
    }
  };

  const handleOpenTypeModal = (type: any = null) => {
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
    if (!typeCode.trim() || typeCode.trim().length !== 2 || isNaN(Number(typeCode))) {
      return toast.error('El código debe tener exactamente 2 dígitos numéricos.');
    }
    if (!typeName.trim()) {
      return toast.error('El nombre del tipo de gasto es requerido.');
    }

    setSavingType(true);
    try {
      const url = editingType ? `/api/v1/expenses/types/${editingType.id}` : '/api/v1/expenses/types';
      const method = editingType ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: typeCode,
          name: typeName,
          status: typeStatus
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(editingType ? 'Tipo de gasto actualizado con éxito.' : 'Tipo de gasto creado con éxito.');
        fetchExpenseTypes();
        setShowTypeModal(false);
      } else {
        toast.error(data.error?.message || 'Error al guardar el tipo de gasto');
      }
    } catch (err) {
      console.error('Error saving expense type:', err);
      toast.error('Ocurrió un error al guardar');
    } finally {
      setSavingType(false);
    }
  };

  const handleDeleteType = async (type: any) => {
    const isStandard = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].includes(type.code);
    const confirmMessage = isStandard
      ? `¿Estás seguro de que deseas desactivar el tipo de gasto estándar "${type.code} - ${type.name}"? Los tipos de gastos estándares no se eliminan físicamente, solo se desactivan de los desplegables.`
      : `¿Estás seguro de que deseas eliminar permanentemente el tipo de gasto personalizado "${type.code} - ${type.name}"?`;

    await confirm({
      title: 'Confirmar eliminación',
      description: confirmMessage,
      action: async () => {
        try {
          const res = await fetch(`/api/v1/expenses/types/${type.id}`, {
            method: 'DELETE'
          });
          const data = await res.json();
          if (data.success) {
            toast.success(isStandard ? 'Tipo de gasto desactivado.' : 'Tipo de gasto eliminado.');
            fetchExpenseTypes();
          } else {
            toast.error(data.error?.message || 'Error al eliminar');
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
