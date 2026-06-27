'use client';

import Link from 'next/link';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 text-center shadow-2xl relative z-10"
      >
        <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-8 h-8 text-rose-500 animate-pulse" />
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2 font-sans">
          Acceso Denegado
        </h1>
        <p className="text-rose-400 font-medium mb-4 text-sm uppercase tracking-wider">
          Error 403 — Prohibido
        </p>
        
        <p className="text-slate-300 text-sm leading-relaxed mb-8">
          No posee los permisos o privilegios de acceso necesarios para ingresar a este recurso del sistema.
          Si considera que esto es un error, por favor contacte a su administrador de sistemas.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 rounded-xl transition duration-200 shadow-lg shadow-indigo-600/20 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            <Home className="w-4 h-4" />
            Volver al Dashboard
          </Link>
          
          <button
            onClick={() => window.history.back()}
            className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-300 font-semibold py-3 px-4 rounded-xl transition duration-200 focus:outline-none focus:ring-2 focus:ring-slate-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Regresar a la página anterior
          </button>
        </div>
      </motion.div>
    </div>
  );
}
