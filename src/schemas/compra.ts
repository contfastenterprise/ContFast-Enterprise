/**
 * El cuerpo de una compra / gasto, validado en UN sitio.
 *
 * Lo usan los tres: el alta (`POST /api/v1/expenses`), la edicion
 * (`PUT /api/v1/expenses/[id]`) y la pantalla de compras. Antes cada uno tenia
 * su propia cadena de `if` con sus propios mensajes: la pantalla soltaba un
 * aviso efimero sin marcar ningun campo, y el servidor repetia las mismas
 * reglas a mano.
 *
 * Las reglas condicionales van en el `superRefine` porque dependen unas de
 * otras: una compra formal exige suplidor y NCF con formato; un gasto menor no
 * puede llevar e-NCF; con monto general hacen falta subtotal, concepto y cuenta
 * contable, y sin monto general hacen falta lineas; y un cheque de garantia,
 * si viene, viene entero.
 *
 * `looseObject`: el cuerpo lleva mas campos de los que se validan (retenciones,
 * propina, ISC...) y no es cosa de este esquema rechazarlos.
 */
import { z } from 'zod';
import { isValidNcfFormat, isElectronicNcf } from '@/utils/ncfValidator';

const dinero = z.coerce.number();

export const esquemaLineaCompra = z.looseObject({
  productId: z.string().nullable().optional(),
  description: z.string().optional(),
  quantity: dinero,
  unitCost: dinero,
  subtotal: dinero,
  itbis: dinero,
  total: dinero,
});

export const esquemaChequeGarantia = z.looseObject({
  bankAccountId: z.string().min(1, 'Selecciona la cuenta bancaria del cheque'),
  checkNumber: z.string().trim().min(1, 'Ingresa el número de cheque'),
  dueDate: z.string().min(1, 'Selecciona la fecha de cobro del cheque'),
  amount: dinero.positive('El monto del cheque debe ser mayor a 0'),
});

export const esquemaCompra = z
  .looseObject({
    isMinorExpense: z.boolean().default(false),
    // La pantalla lo manda. Si un cliente no lo manda, se deduce mas abajo de
    // la forma del cuerpo: sin lineas y con cuenta contable es monto general.
    isGeneralAmount: z.boolean().default(false),
    supplierId: z.string().nullable().optional(),
    ncf: z.string().nullable().optional(),
    expenseType: z.string().min(1, 'Selecciona el tipo de gasto'),
    issueDate: z.string().min(1, 'Selecciona la fecha de la factura'),
    paymentMethod: z.string().min(1, 'Selecciona la forma de pago'),
    amount: dinero,
    itbis: dinero.optional(),
    description: z.string().nullable().optional(),
    debitAccountId: z.string().nullable().optional(),
    lines: z.array(esquemaLineaCompra).default([]),
    guaranteeCheck: esquemaChequeGarantia.nullable().optional(),
  })
  .superRefine((c, ctx) => {
    const ncf = (c.ncf ?? '').trim();

    if (!c.isMinorExpense) {
      if (!c.supplierId) {
        ctx.addIssue({ code: 'custom', path: ['supplierId'], message: 'Selecciona un suplidor' });
      }
      if (!ncf) {
        ctx.addIssue({ code: 'custom', path: ['ncf'], message: 'Ingresa el NCF de la factura' });
      } else if (!isValidNcfFormat(ncf)) {
        ctx.addIssue({
          code: 'custom',
          path: ['ncf'],
          message:
            'El formato del NCF es inválido. Debe ser NCF de 11 caracteres (ej. B0100000001) o e-NCF de 13 caracteres (ej. E310100000001).',
        });
      }
    } else if (ncf && isElectronicNcf(ncf)) {
      ctx.addIssue({
        code: 'custom',
        path: ['ncf'],
        message: 'Esta compra no puede guardarse como gasto menor ya que tiene e-NCF',
      });
    }

    const montoGeneral = c.isGeneralAmount || (c.lines.length === 0 && !!c.debitAccountId);
    if (montoGeneral) {
      if (!(c.amount > 0)) {
        ctx.addIssue({ code: 'custom', path: ['amount'], message: 'El subtotal de la compra debe ser mayor a 0' });
      }
      if (!(c.description ?? '').trim()) {
        ctx.addIssue({ code: 'custom', path: ['description'], message: 'El concepto general (descripción) es obligatorio' });
      }
      if (!c.debitAccountId) {
        ctx.addIssue({ code: 'custom', path: ['debitAccountId'], message: 'Selecciona la cuenta contable de costo/gasto' });
      }
    } else if (c.lines.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Agrega al menos una línea' });
    }
  });

export type Compra = z.infer<typeof esquemaCompra>;

/**
 * Los fallos como mapa campo -> mensaje, para pintarlos debajo de cada campo.
 *
 * Un campo puede fallar por mas de una regla; se queda con la primera, que es
 * la que hay que arreglar antes. La clave es la ruta con puntos
 * (`guaranteeCheck.checkNumber`), y es la misma que usa la pantalla en
 * `data-campo`.
 */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const clave = issue.path.map(String).join('.') || '_';
    if (!(clave in out)) out[clave] = issue.message;
  }
  return out;
}
