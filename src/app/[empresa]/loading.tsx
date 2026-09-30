import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <Loader2 className="h-10 w-10 text-slate-900 animate-spin mb-4" />
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500 animate-pulse">Cargando tienda...</p>
    </div>
  );
}
