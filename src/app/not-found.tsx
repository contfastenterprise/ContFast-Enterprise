"use client";

import Link from 'next/link';
import { FileQuestion, Home, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-8 md:p-12 text-center relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#c5a059] opacity-10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-[#001e40] opacity-5 rounded-full blur-3xl"></div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-24 h-24 bg-slate-50 rounded-2xl flex items-center justify-center mb-8 shadow-inner border border-slate-100">
            <FileQuestion className="h-12 w-12 text-[#c5a059]" />
          </div>

          <h1 className="text-7xl font-black text-[#001e40] mb-2 tracking-tight">404</h1>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Página no encontrada</h2>
          
          <p className="text-slate-500 mb-10 leading-relaxed">
            Lo sentimos, no hemos podido encontrar la página que buscas. 
            Es posible que el enlace esté roto o la dirección haya sido escrita incorrectamente.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button
              onClick={() => router.back()}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95"
            >
              <ArrowLeft className="h-5 w-5" />
              Regresar
            </button>
            
            <Link href="/" className="flex-1">
              <button className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#001e40] text-white font-semibold hover:bg-[#00142a] shadow-md hover:shadow-lg transition-all active:scale-95">
                <Home className="h-5 w-5 text-[#c5a059]" />
                Inicio
              </button>
            </Link>
          </div>
        </div>
      </div>
      
      {/* Footer Branding */}
      <div className="mt-12 text-center text-sm font-medium text-slate-400">
        <p>ContFast Enterprise &copy; {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
