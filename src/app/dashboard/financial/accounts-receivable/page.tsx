import React from 'react';
import { Metadata } from 'next';
import AccountsReceivableDashboard from './components/AccountsReceivableDashboard';
import { getReceivablesDashboardData } from '@/actions/receivables';
import { CabeceraDePagina } from '@/components/ui/cabecera-de-pagina';

export const metadata: Metadata = {
  title: 'Cuentas por Cobrar | ContFast Enterprise',
  description: 'Módulo avanzado de gestión de cartera y cuentas por cobrar.',
};

export default async function AccountsReceivablePage() {
  const data = await getReceivablesDashboardData();
  
  if (!data || !data.success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-neutral-500">
        <h2 className="text-xl font-semibold mb-2">Error al cargar datos</h2>
        <p>{data?.error || 'Ha ocurrido un error inesperado al cargar las cuentas por cobrar.'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full min-h-screen bg-surface dark:bg-surface-dark pb-10">
      <div className="px-6 py-6 border-b border-outline-variant/20 bg-surface-container-lowest">
        <CabeceraDePagina
          titulo="Cuentas por Cobrar"
          descripcion="Gestión integral de cartera, reportes de antigüedad y proyecciones de cobro."
        />
      </div>
      
      <div className="p-6 w-full max-w-[1600px] mx-auto">
        <AccountsReceivableDashboard initialData={data.data} />
      </div>
    </div>
  );
}
