import React from 'react';
import { AIChatBox } from '@/components/ui/AIChatBox';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Co-pilot | ContFast Enterprise',
  description: 'Asistente de Inteligencia Artificial para el ERP ContFast',
};

export default function AIPage() {
  return (
    <div className="h-full min-h-[calc(70vh-6rem)] border border-slate-200 bg-slate-50/30 p-4 md:p-8 relative overflow-hidden flex flex-col items-center justify-start rounded-xl shadow-sm">
      {/* Elementos de fondo sutiles */}
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] opacity-50 pointer-events-none" />

      {/* Título de la sección */}
      <div className="w-full max-w-5xl mb-6 mt-6 relative z-10 text-center md:text-left">
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
          AI <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">Co-pilot</span>
        </h1>
        <p className="text-slate-600 mt-2 text-sm md:text-base max-w-xl">
          Tu asistente inteligente empresarial con acceso directo y seguro a los datos de tu compañía.
          Pídele análisis, gestión de inventario, o reportes financieros en lenguaje natural.
        </p>
      </div>

      {/* Contenedor principal del chat */}
      <div className="w-full relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <AIChatBox />
      </div>
    </div>
  );
}
