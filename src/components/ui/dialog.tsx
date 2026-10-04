"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "framer-motion";
import { abrirVentana, cerrarVentana, esLaDeArriba, siguienteFoco } from "./ventanasAbiertas";

/**
 * La ventana de la casa (lote 214; lote 276, auditoria de UI). Las ventanas escritas a mano de la
 * aplicacion pasan a ser esta, asi que aqui vive lo que una ventana tiene que hacer y ninguna de las
 * escritas a mano hacia entera:
 *
 * - se anuncia como ventana (`role="dialog"`, `aria-modal`, titulo y descripcion enlazados);
 * - al abrirse lleva el foco dentro, Tab no se sale de ella, y al cerrarse devuelve el foco a donde
 *   estaba (el boton que la abrio);
 * - Escape cierra SOLO la de arriba (con una encima de otra cerraban todas);
 * - `bloqueada`: mientras se guarda no se cierra ni con Escape, ni pulsando fuera, ni con la X;
 * - `cerrarAlPulsarFuera` (por defecto si): un formulario con datos escritos lo pone en `false`;
 * - el bloqueo del desplazamiento de la pagina cuenta ventanas: cerrar la de arriba no lo devuelve
 *   con la de abajo abierta.
 *
 * El pie: `AccionesDeFormulario` dentro de `footer` (o los botones en orden [Cancelar] [Principal]).
 */
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Un icono de lucide delante del titulo. */
  icono?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl" | "full";
  className?: string;
  /** Mientras es `true` (guardando), la ventana no se cierra por ningun camino. */
  bloqueada?: boolean;
  /** Pulsar el fondo cierra. Por defecto si; un formulario con datos escritos lo pone en `false`. */
  cerrarAlPulsarFuera?: boolean;
  /** El cuerpo sin relleno (tablas a todo el ancho, visores). */
  sinRelleno?: boolean;
  /** Una ventana que se abre ENCIMA de otra va en una capa mas alta. */
  capa?: 50 | 60 | 70 | 100;
}

const maxWidthClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
  full: "max-w-[95vw]",
};
const capas = { 50: "z-50", 60: "z-[60]", 70: "z-[70]", 100: "z-[100]" };
const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  icono,
  children,
  footer,
  maxWidth = "lg",
  className = "",
  bloqueada = false,
  cerrarAlPulsarFuera = true,
  sinRelleno = false,
  capa = 50,
}: ModalProps) {
  const id = React.useId();
  const idTitulo = `${id}-titulo`;
  const idDescripcion = `${id}-descripcion`;
  const caja = React.useRef<HTMLDivElement>(null);
  //  Lo ultimo de las props, en una referencia: los oyentes se ponen una vez por apertura y leen
  //  siempre el valor de ahora (si no, un `bloqueada` que cambia a mitad no se veria).
  const actual = React.useRef({ onClose, bloqueada });
  React.useEffect(() => {
    actual.current = { onClose, bloqueada };
  });
  const cerrar = React.useCallback(() => {
    if (!actual.current.bloqueada) actual.current.onClose();
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    const previo = document.activeElement as HTMLElement | null;
    if (abrirVentana(id)) document.body.style.overflow = "hidden";
    //  El foco entra en la ventana: al primer campo o boton del CUERPO (no a la X de la cabecera).
    const t = window.setTimeout(() => {
      const cuerpo = caja.current?.querySelector<HTMLElement>("[data-cuerpo-ventana]");
      const primero = cuerpo?.querySelector<HTMLElement>(ENFOCABLES) ?? caja.current?.querySelector<HTMLElement>(ENFOCABLES);
      (primero ?? caja.current)?.focus();
    }, 0);
    const alTeclear = (e: KeyboardEvent) => {
      if (!esLaDeArriba(id)) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        cerrar();
        return;
      }
      if (e.key === "Tab" && caja.current) {
        const lista = [...caja.current.querySelectorAll<HTMLElement>(ENFOCABLES)].filter((x) => x.offsetParent !== null);
        const i = siguienteFoco(lista.length, lista.indexOf(document.activeElement as HTMLElement), e.shiftKey);
        e.preventDefault();
        (i === -1 ? caja.current : lista[i]).focus();
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", alTeclear);
      if (cerrarVentana(id)) document.body.style.overflow = "";
      //  El foco vuelve a donde estaba (el boton que abrio la ventana), si sigue en la pagina.
      if (previo && document.contains(previo)) previo.focus();
    };
  }, [isOpen, id, cerrar]);

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {isOpen && (
          <div className={cn("fixed inset-0 flex items-center justify-center p-4 sm:p-6 overflow-y-auto", capas[capa])}>
            {/* Backdrop */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={cerrarAlPulsarFuera ? cerrar : undefined}
              aria-hidden="true"
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Modal Container */}
            <m.div
              ref={caja}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? idTitulo : undefined}
              aria-describedby={description ? idDescripcion : undefined}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn(
                "relative z-10 w-full bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh] outline-none",
                maxWidthClasses[maxWidth],
                className
              )}
            >
              {/* Header */}
              {(title || description) && (
                <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-[#003366] bg-[#003366]">
                  <div className="space-y-1 min-w-0">
                    {title && (
                      <h2 id={idTitulo} className="text-lg font-bold text-white flex items-center gap-2">
                        {icono && <span aria-hidden="true" className="shrink-0 text-[#C5A059] [&_svg]:size-5">{icono}</span>}
                        <span className="min-w-0">{title}</span>
                      </h2>
                    )}
                    {description && (
                      <p id={idDescripcion} className="text-xs text-slate-300">
                        {description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={cerrar}
                    disabled={bloqueada}
                    aria-label="Cerrar"
                    className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-white"
                    title="Cerrar (Esc)"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              )}

              {!title && !description && (
                <button
                  type="button"
                  onClick={cerrar}
                  disabled={bloqueada}
                  aria-label="Cerrar"
                  className="absolute top-4 right-4 z-20 rounded-lg p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Cerrar (Esc)"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              )}

              {/* Body Content */}
              <div data-cuerpo-ventana className={cn("overflow-y-auto flex-1", !sinRelleno && "p-6")}>{children}</div>

              {/* Footer */}
              {footer && (
                <div className="flex items-center justify-end gap-3 p-4 px-6 bg-white border-t border-slate-200">
                  {footer}
                </div>
              )}
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
