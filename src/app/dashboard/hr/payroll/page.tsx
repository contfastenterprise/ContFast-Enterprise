'use client';

import { Banknote, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CabeceraDePagina } from '@/components/ui/cabecera-de-pagina';
import { useNominas } from './hooks/useNominas';
import { ListaDeNominas } from './components/ListaDeNominas';
import { DetalleDeLaNomina } from './components/DetalleDeLaNomina';
import { GenerarNomina } from './components/GenerarNomina';

/**
 * Lote 294: la pagina es el armazon. El estado y las acciones viven en `useNominas`; la
 * lista, el detalle (con sus acciones y sus volantes) y la ventana de generar, en
 * `components/`. Se partio sin cambiar lo que hace: ver `scratch/verificar_partir_nomina.ts`.
 */
export default function PayrollPage() {
  const h = useNominas();
  const { selectedPayroll, setSelectedPayroll, setShowCreateModal } = h;

  return (

    <div className="space-y-6">
      {/* Header */}
      <CabeceraDePagina
        titulo="Procesamiento de Nóminas"
        descripcion="Genera, calcula y aprueba las nóminas de tus colaboradores para la TSS y DGII."
        icono={<Banknote />}
        acciones={!selectedPayroll && (
          <Button
            type="button"
            className="shrink-0 self-start md:self-auto"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="h-4 w-4" /> Generar Nómina
          </Button>
        )}
      />

      {/* Back Button if in detail view */}
      {selectedPayroll && (
        <Button
          type="button"
          variant="link"
          className="h-auto px-0 text-xs"
          onClick={() => setSelectedPayroll(null)}
        >
          ← Volver al Historial de Nóminas
        </Button>
      )}

      {/* List View or Detail View */}
      {!selectedPayroll ? (
        <ListaDeNominas h={h} />
      ) : (
        /* Detail / Volantes View */
        <DetalleDeLaNomina h={h} />
      )}

      {/* Create Payroll Modal */}
      <GenerarNomina h={h} />
    </div>

  );
}
