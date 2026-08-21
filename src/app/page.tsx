import { redirect } from 'next/navigation';

/**
 * La raíz del sistema redirige al Login principal de ContFast Enterprise.
 * Las tiendas de cada empresa se acceden desde /<slug-empresa>
 */
export default function RootPage() {
  redirect('/auth/login');
}
