import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
      <Loader2 className="h-10 w-10 text-[#001e40] dark:text-[#c5a059] animate-spin mb-4" />
      <p className="text-slate-600 dark:text-slate-400 font-medium animate-pulse">Cargando tienda...</p>
    </div>
  );
}
