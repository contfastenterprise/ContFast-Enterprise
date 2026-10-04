import * as React from "react";
import { buttonVariants, type VariantesDeBoton } from "./button-variants";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

/**
 * El boton de la casa: las variantes y su porque viven en `button-variants.ts` (React Doctor: un
 * fichero de componentes solo exporta componentes, o la recarga en caliente se pierde).
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantesDeBoton {
  asChild?: boolean;
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading, children, disabled, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isLoading || disabled}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading && <Loader2 className="animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

/**
 * Un boton de solo icono. `aria-label` es obligatorio por tipo: sin el, un lector de pantalla dice
 * "boton" y nada mas (la auditoria conto 213 asi). El mismo texto sale como globo (`title`).
 */
export interface IconButtonProps extends Omit<ButtonProps, "size" | "aria-label"> {
  "aria-label": string;
  size?: "icon" | "icon-sm";
}
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = "ghost", size = "icon-sm", title, ...props }, ref) => (
    <Button ref={ref} variant={variant} size={size} title={title ?? props["aria-label"]} {...props} />
  )
);
IconButton.displayName = "IconButton";

export { Button, IconButton };
