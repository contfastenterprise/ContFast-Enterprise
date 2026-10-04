import { cva, type VariantProps } from "class-variance-authority";

/**
 * El boton de la casa (lote 270, auditoria de UI). Antes de este lote habia DOS sistemas: este
 * componente, con colores del tema que no existian (lote 269) y una animacion de escala, y los
 * botones escritos a mano en las paginas — 712, de ellos 45 copias del primario azul marino, 34 del
 * secundario blanco y 19 del dorado de "Imprimir", todos `h-9 px-4 rounded-lg font-bold text-sm`.
 * Las variantes son ESAS clases, para que pasar una pagina al componente no cambie lo que se ve.
 *
 * Tamaños: `md` (h-9, el de la casa, por defecto), `sm` (h-8, barras de herramientas y tablas),
 * `lg` (h-10). Los de solo icono (`icon`, `icon-sm`) llevan SIEMPRE `aria-label`: el tipo lo exige
 * en `IconButton`.
 *
 * Sin `whileHover`/`whileTap`: los botones de la casa no crecen al pasar el raton, y dos
 * comportamientos para la misma accion es justo lo que la auditoria vino a quitar. Y sin
 * `whitespace-nowrap` (la plantilla de shadcn lo trae): los de la casa parten la linea, y un texto
 * largo en el movil que no puede partirse saca el boton de la pantalla.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-bold transition cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /** La accion principal de la pantalla o del formulario: una por grupo. */
        primary: "bg-primary text-primary-foreground hover:bg-primary-variant shadow-md hover:shadow-lg",
        default: "bg-primary text-primary-foreground hover:bg-primary-variant shadow-md hover:shadow-lg",
        /** Cancelar, volver, las acciones que acompañan a la principal. */
        secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 shadow-sm",
        /** Una accion del color de la marca sin peso de principal (añadir una linea, ver mas). */
        outline: "bg-transparent text-primary border border-primary/40 hover:border-primary hover:bg-primary/5",
        /** Acciones de fila y de barra de herramientas; casi siempre solo icono. */
        ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        /** Imprimir, exportar, descargar: lo que saca un documento. El dorado de la casa, con texto oscuro (blanco no pasa AA). */
        documento: "bg-[#C5A059] text-slate-950 hover:bg-[#b08c4a] shadow-sm hover:shadow-md",
        /** Eliminar, anular, dar de baja. */
        destructive: "bg-destructive text-destructive-foreground hover:bg-rose-700 shadow-sm",
        danger: "bg-destructive text-destructive-foreground hover:bg-rose-700 shadow-sm",
        success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
        /** Texto oscuro: blanco sobre ambar no llega a 3:1. */
        warning: "bg-amber-500 text-slate-950 hover:bg-amber-600 shadow-sm",
        link: "text-primary underline-offset-4 hover:underline h-auto px-0 font-semibold",
      },
      size: {
        md: "h-9 px-4 text-sm",
        default: "h-9 px-4 text-sm",
        sm: "h-8 px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 px-5 text-sm",
        icon: "size-9 p-0",
        "icon-sm": "size-8 p-0 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export type VariantesDeBoton = VariantProps<typeof buttonVariants>;
