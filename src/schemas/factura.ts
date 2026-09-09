/**
 * El cuerpo de una factura / nota, validado en UN sitio.
 *
 * Vivia dentro de src/app/api/v1/invoices/route.ts, asi que la pantalla no
 * podia usarlo: reimplementaba las reglas a mano en DOS sitios que ademas se
 * solapaban (`validateFormBasic` y la cadena de `handleSubmitTrigger`), y las
 * dos acababan en un unico toast "Error de validacion", sin marcar ningun
 * campo.
 *
 * Al sacarlo se le anaden las dos reglas que solo tenia la pantalla -- el RNC y
 * la razon social para e-31/e-45, y el motivo de la nota -- porque un POST
 * directo se las saltaba.
 *
 * Lo que NO esta aqui, a proposito: el stock minimo y el precio por debajo del
 * costo. No son reglas del cuerpo; se resuelven contra los productos, y el
 * servidor las comprueba por su cuenta con la base delante.
 */
import { z } from 'zod';
import { CODIGOS_EMITIBLES, TIPOS_COMPROBANTE } from '@/services/dgii/tiposComprobante';

export const esquemaFactura = z.object({
  customerId: z.string().uuid().optional(),
  // El mensaje va en las DOS comprobaciones: la de tipo (campo ausente) y la de
  // formato (presente pero no es un uuid). Puesto solo en la segunda, un cuerpo
  // sin almacen respondia "expected string, received undefined".
  warehouseId: z.string({ message: 'Debe seleccionar un almacén.' }).uuid('Debe seleccionar un almacén.'),
  cashSessionId: z.string().uuid().optional(),
  // Los codigos que el flujo de ventas emite, de la lista unica. El 44
  // (Regimenes Especiales) y el 46 (Exportaciones) no estaban y por eso una
  // secuencia de esos tipos se podia elegir en el formulario pero la emision
  // la rechazaba con "Tipo de e-CF invalido".
  ecfType: z.enum(CODIGOS_EMITIBLES, {
    message: `Tipo de e-CF inválido. Los admitidos son: ${TIPOS_COMPROBANTE.filter(t => t.emitible).map(t => `${t.codigo} (${t.corto})`).join(', ')}.`,
  }),
  paymentType: z.enum(['cash', 'credit', 'bank_transfer'], { message: 'Selecciona la forma de pago.' }),
  bankName: z.string().optional(),
  transactionNumber: z.string().optional(),
  notes: z.string().optional(),
  ignoreCommunicationError: z.boolean().optional(),
  modifiedNcf: z.string().length(13, 'El NCF modificado debe tener exactamente 13 caracteres').optional(),
  modifiedInvoiceId: z.string().uuid().optional(),
  indicadorNotaCredito: z.number().optional(),
  quoteId: z.string().uuid().optional(),
  lines: z.array(
    z.object({
      productId: z.string().uuid(),
      productName: z.string().min(1, 'El nombre del producto es requerido'),
      quantity: z.number().positive('La cantidad debe ser mayor a cero'),
      unitPrice: z.number().nonnegative('El precio unitario no puede ser negativo'),
      discount: z.number().nonnegative('El descuento no puede ser negativo').default(0),
      taxRate: z.number().nonnegative('La tasa de impuesto no puede ser negativa').default(0.18),
      //  Solo con taxRate 0. Sin valor, el envio la trata como exento, que es
      //  como se comporto siempre. Ver 0042.
      taxCategory: z.enum(['exento', 'tasa_cero']).nullish(),
      warehouseId: z.string().uuid().optional(),
    })
  , { message: 'La factura debe tener al menos una línea de producto' })
    .min(1, 'La factura debe tener al menos una línea de producto'),
  retentions: z.array(
    z.object({
      retentionId: z.string().uuid().optional(),
      retentionName: z.string(),
      retentionType: z.enum(['ITBIS', 'ISR', 'OTRA']),
      retentionPercentage: z.number().nonnegative().max(100),
      agentRnc: z.string().optional(),
      retentionDate: z.string().optional(),
    })
  ).optional(),
  buyerRnc: z.string().optional(),
  buyerName: z.string().optional(),
}).refine((data) => {
  if (data.paymentType === 'bank_transfer') {
    return !!data.bankName && !!data.transactionNumber;
  }
  return true;
}, {
  message: 'El banco y número de transferencia son requeridos para pagos por transferencia.',
  path: ['bankName'],
}).refine((data) => {
  if ((data.ecfType === '33' || data.ecfType === '34') && !data.modifiedNcf) {
    return false;
  }
  return true;
}, {
  message: 'El NCF modificado es requerido para Notas de Crédito y Notas de Débito.',
  path: ['modifiedNcf'],
}).refine((data) => {
  // Estaba SOLO en la pantalla: un POST directo emitia un e-31 sin RNC ni razon
  // social del comprador, que es justo lo que un credito fiscal no puede ser.
  if (data.ecfType === '31' || data.ecfType === '45') {
    return !!data.buyerRnc && !!data.buyerName;
  }
  return true;
}, {
  message: 'El RNC y la Razón Social del cliente son requeridos para Crédito Fiscal (e-31) o Comprobantes Gubernamentales (e-45).',
  path: ['buyerRnc'],
}).refine((data) => {
  // Idem: el motivo del ajuste lo exigian la pantalla de facturas y la de
  // ajustes, cada una con su copia de la lista, y el servidor ninguna.
  if (data.ecfType !== '33' && data.ecfType !== '34') return true;
  const validos = data.ecfType === '34' ? [1, 2, 3] : [2, 3, 4];
  return typeof data.indicadorNotaCredito === 'number' && validos.includes(data.indicadorNotaCredito);
}, {
  message: 'Debe seleccionar el Motivo / Tipo de Ajuste para emitir una nota de crédito o débito.',
  path: ['indicadorNotaCredito'],
});
