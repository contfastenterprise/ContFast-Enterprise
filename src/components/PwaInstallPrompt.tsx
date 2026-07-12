'use client';

import { useState, useEffect } from 'react';
import { Download, X, Laptop } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Registrar Service Worker de forma segura
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const registerSW = () => {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => console.log('Service Worker registrado con éxito:', reg.scope))
          .catch((err) => console.error('Error al registrar Service Worker:', err));
      };

      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW);
      }
    }

    // Escuchar el evento antes de que se muestre el prompt nativo
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Solo mostrar después de 3 segundos para una mejor UX
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 3000);
      return () => clearTimeout(timer);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Detectar si la app ya está corriendo en modo standalone
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) {
      setIsVisible(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Mostrar el prompt nativo
    deferredPrompt.prompt();
    
    // Esperar la respuesta del usuario
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('El usuario aceptó instalar la PWA');
    } else {
      console.log('El usuario rechazó instalar la PWA');
    }
    
    // Limpiar el evento deferred
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="fixed bottom-6 right-6 z-[9999] max-w-sm w-full bg-slate-900/90 dark:bg-slate-950/95 backdrop-blur-md border border-slate-700/50 dark:border-slate-800/80 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 text-white"
      >
        <div className="flex items-start justify-between">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
              <Laptop className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-wide">Instalar ContFast</h3>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                Accede más rápido y trabaja sin distracciones instalando la aplicación en tu dispositivo.
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-white hover:bg-slate-800/50 p-1.5 rounded-lg transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleInstallClick}
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-md shadow-indigo-600/10 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Instalar ahora
          </button>
          <button
            onClick={handleDismiss}
            className="text-xs font-semibold py-2.5 px-4 rounded-xl border border-slate-700/80 hover:bg-slate-800/40 text-slate-200 transition-colors cursor-pointer"
          >
            Quizás luego
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
