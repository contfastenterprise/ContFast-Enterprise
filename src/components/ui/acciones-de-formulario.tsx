/**
 * El pie de un formulario o de una ventana (lote 270, auditoria de UI): [Cancelar] [Guardar],
 * alineados a la derecha, la principal LA ULTIMA. La auditoria encontro 35 pies en ese orden y 3 al
 * reves (pedidos a suplidor, compras y la tasa del dolar), con alturas de h-8 a py-3.5.
 *
 * En el movil se apilan con la principal ARRIBA y a todo el ancho (`flex-col-reverse`): es la que
 * se busca con el pulgar, y queda en el mismo sitio en todas las pantallas.
 *
 * `cancelar` es opcional (un formulario que no se puede abandonar no lo lleva). `type` de la
 * principal: `submit` si el formulario se envia con Enter, `button` si la accion es un clic.
 */
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export function AccionesDeFormulario({
  textoPrincipal, alPrincipal, tipoPrincipal = 'submit', principalInactiva, guardando, variantePrincipal = 'primary',
  iconoPrincipal, textoCancelar = 'Cancelar', alCancelar, children, separada = true,
}: {
  textoPrincipal: ReactNode;
  alPrincipal?: () => void;
  tipoPrincipal?: 'submit' | 'button';
  principalInactiva?: boolean;
  /** Muestra el giro en la principal y la desactiva (y Cancelar no, para poder salir). */
  guardando?: boolean;
  /** `destructive` para confirmar un borrado; el resto, `primary`. */
  variantePrincipal?: 'primary' | 'destructive';
  iconoPrincipal?: ReactNode;
  textoCancelar?: ReactNode;
  alCancelar?: () => void;
  /** Acciones de mas (entre Cancelar y la principal), p. ej. "Guardar como borrador". */
  children?: ReactNode;
  /** Linea por encima: si el pie va pegado a los campos. */
  separada?: boolean;
}) {
  return (
    <div className={`flex flex-col-reverse sm:flex-row sm:justify-end gap-2 ${separada ? 'pt-4 mt-2 border-t border-slate-200' : ''}`}>
      {alCancelar && (
        <Button type="button" variant="secondary" onClick={alCancelar} className="w-full sm:w-auto">
          {textoCancelar}
        </Button>
      )}
      {children}
      <Button
        type={tipoPrincipal}
        variant={variantePrincipal}
        onClick={alPrincipal}
        disabled={principalInactiva}
        isLoading={guardando}
        className="w-full sm:w-auto"
      >
        {!guardando && iconoPrincipal}
        {textoPrincipal}
      </Button>
    </div>
  );
}
