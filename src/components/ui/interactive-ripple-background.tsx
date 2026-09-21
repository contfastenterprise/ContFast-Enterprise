// Original animated background with ripple effect
// Creates interactive ripples that respond to user interaction

import { cn } from "@/utils/cn";
// `useEffect` ya no hace falta: lo unico que lo usaba era el intervalo de las
// ondas automaticas, retirado en el lote 173.
import { useState, useRef } from "react";

interface Ripple {
  x: number;
  y: number;
  id: number;
  timestamp: number;
}

export const RippleBackground = ({ children }: { children?: React.ReactNode }) => {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const rippleIdRef = useRef(0);

  const createRipple = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    // Lote 173: quien tiene activado "reducir movimiento" en su sistema lo
    // tiene activado por algo -- mareo, vertigo, migrañas --, y una onda que
    // se expande 400px por la pantalla es justo lo que evita. No se le crea.
    if (typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newRipple: Ripple = {
      x,
      y,
      id: rippleIdRef.current++,
      timestamp: Date.now()
    };

    setRipples(prev => [...prev, newRipple]);

    // Remove ripple after animation completes
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== newRipple.id));
    }, 2000);
  };

  // LAS ONDAS AUTOMATICAS SE RETIRARON (lote 173).
  //
  // Aqui habia un `setInterval` de 3 segundos que creaba una onda al azar,
  // PARA SIEMPRE, con su `setTimeout` para retirarla: veinte renders de React
  // por minuto en una pantalla donde solo se escriben dos campos, mientras la
  // pestaña este abierta. En el movil de un cajero eso es bateria.
  //
  // Las ondas al hacer clic se quedan: son las que dan la gracia, duran dos
  // segundos y las pide la persona. Lo que se va es la animacion perpetua que
  // nadie pidio.

  return (
    <div
      ref={containerRef}
      className="relative w-full min-h-screen bg-background  overflow-hidden cursor-pointer"
      onClick={createRipple}
    >
      {/* Ripple effects */}
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className="absolute pointer-events-none"
          style={{
            left: ripple.x,
            top: ripple.y,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div className="absolute inset-0 rounded-full border-2 border-gray-400/30 dark:border-gray-500/25 animate-ripple" />
          <div
            className="absolute inset-0 rounded-full border-2 border-gray-400/20 dark:border-gray-500/15 animate-ripple"
            style={{ animationDelay: '0.2s' }}
          />
          <div
            className="absolute inset-0 rounded-full border-2 border-gray-400/10 dark:border-gray-500/5 animate-ripple"
            style={{ animationDelay: '0.4s' }}
          />
        </div>
      ))}

      {/* Content */}
      <div className="relative z-10 w-full min-h-screen flex flex-col justify-center items-center">
        {children || (
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <h2 className="text-4xl font-bold text-gray-800 dark:text-gray-100 mb-4">
                Interactive Ripple Background
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Click anywhere to create ripples
              </p>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes ripple {
          0% {
            width: 0;
            height: 0;
            opacity: 1;
          }
          100% {
            width: 400px;
            height: 400px;
            opacity: 0;
          }
        }
        
        .animate-ripple {
          animation: ripple 2s ease-out forwards;
        }
      `}</style>
    </div>
  );
};
