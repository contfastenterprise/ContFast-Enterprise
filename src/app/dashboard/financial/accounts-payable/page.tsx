import { Metadata } from 'next';
import { getPayablesDashboardData } from '@/actions/payables';
import AccountsPayableDashboard from './components/AccountsPayableDashboard';
import { CabeceraDePagina } from '@/components/ui/cabecera-de-pagina';

export const metadata: Metadata = {
  title: 'Cuentas por Pagar | Dashboard Financiero',
  description: 'Gestión y control de Cuentas por Pagar y obligaciones financieras.',
};

export default async function AccountsPayablePage() {
  const data = await getPayablesDashboardData();

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 max-w-[1600px] mx-auto w-full">
      <div className="pb-4">
        <CabeceraDePagina titulo="Cuentas por Pagar" />
      </div>
      
      <AccountsPayableDashboard initialData={data} />
    </div>
  );
}
