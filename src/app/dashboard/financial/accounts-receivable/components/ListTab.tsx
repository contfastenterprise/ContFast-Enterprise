'use client';

/**
 * CxC: la tabla de cartera, que es la MISMA que la de su gemela.
 *
 * Este fichero es un envoltorio a proposito. Antes aqui habia 300 lineas que
 * hacian lo mismo que las 320 del otro lado, pero de otra forma, y con el
 * tiempo divergieron en comportamiento: una escondia las cuentas saldadas y la
 * otra no, una contaba los dias desde la emision y la otra desde el
 * vencimiento, y la paginacion de una era un adorno.
 *
 * Ahora la unica diferencia entre las dos pantallas es el `tipo`. Mientras eso
 * siga asi, no pueden volver a separarse sin que se note.
 */
import TablaCuentas from '@/components/financial/TablaCuentas';

export default function ListTab({ data, companyInfo }: { data: any[]; companyInfo?: any }) {
  return <TablaCuentas data={data} companyInfo={companyInfo} tipo="cobrar" />;
}
