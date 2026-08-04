import { Metadata } from 'next';
import { getPayablesDashboardData } from '@/actions/payables';
import AccountsPayableDashboard from './components/AccountsPayableDashboard';

export const metadata: Metadata = {
  title: 'Cuentas por Pagar | Dashboard Financiero',
  description: 'Gestión y control de Cuentas por Pagar y obligaciones financieras.',
};

export default async function AccountsPayablePage() {
  const data = await getPayablesDashboardData();

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 max-w-[1600px] mx-auto w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-4">
        <h2 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Cuentas por Pagar
        </h2>
        <div className="flex items-center space-x-2">
          {/* Aquí irían los botones de acción rápida, exportación, etc. */}
        </div>
      </div>
      
      <AccountsPayableDashboard initialData={data} />
    </div>
  );
}
