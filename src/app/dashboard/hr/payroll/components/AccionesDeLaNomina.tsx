'use client';

/**
 * Lote 294: lo que se puede hacer con UNA nomina abierta (imprimir los volantes, recalcular,
 * aprobar), movido tal cual desde `page.tsx`. Lo que se ofrece lo decide `accionesDeNomina`,
 * la misma regla que aplica la API (lote 290).
 *
 * Aqui va la proxima accion por nomina (el pago, lote D del diseno): un boton mas en esta
 * fila, con su estado y su accion en `useNominas` (`h`).
 */
import { RefreshCw, Printer, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { accionesDeNomina } from '@/services/nomina/estadoDeNomina';
import type { EstadoNominas } from '../hooks/useNominas';

export function AccionesDeLaNomina({ h }: { h: EstadoNominas }) {
  const { selectedPayroll, payrollDetailsList, loadingDetails, handleRecalculate, handleApprove } = h;
  //  Solo se pinta con una nomina elegida (la pagina lo decide); esto lo dice al compilador.
  if (!selectedPayroll) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="documento"><a
        href={`/api/v1/hr/payroll/${selectedPayroll.id}/receipts`}
        target="_blank"
        rel="noreferrer"
      >
        <Printer className="h-4 w-4" /> Imprimir Todos los Volantes
      </a></Button>
      {accionesDeNomina(selectedPayroll.status, payrollDetailsList.length).recalcular && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleRecalculate(selectedPayroll.id)}
        >
          <RefreshCw className="h-4 w-4" /> Recalcular Todo
        </Button>
      )}
      {!loadingDetails && accionesDeNomina(selectedPayroll.status, payrollDetailsList.length).aprobar && (
        <Button
          type="button"
          onClick={() => handleApprove(selectedPayroll.id)}
        >
          <Award className="h-4 w-4" /> Aprobar Nómina
        </Button>
      )}
    </div>
  );
}
