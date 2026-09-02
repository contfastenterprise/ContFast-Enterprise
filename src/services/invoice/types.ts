export interface IssueInvoiceInput {
  companyId: string;
  modo: 'PRODUCCION' | 'PRUEBA';
  warehouseId: string;
  customerId?: string;
  userId: string;
  cashSessionId?: string;
  ecfType: string; // '31' (Fiscal), '32' (Consumo), etc.
  paymentType: 'cash' | 'credit' | 'bank_transfer';
  bankName?: string;
  transactionNumber?: string;
  buyerRnc?: string;
  buyerName?: string;
  notes?: string;
  /**
   * OBSOLETO. Ya no lo lee nadie.
   *
   * Servia para decir "emite localmente aunque falle la red". Desde que un
   * desenlace desconocido queda en `submitted` -- en vez de quemar el NCF o
   * declararlo rechazado -- eso ES el comportamiento por defecto, y el
   * interruptor no distingue nada.
   *
   * Se sigue aceptando en la peticion para no romper a quien lo mande, pero no
   * cambia nada. Se quita cuando se confirme que ningun cliente lo envia.
   */
  ignoreCommunicationError?: boolean;
  modifiedNcf?: string;
  modifiedInvoiceId?: string;
  indicadorNotaCredito?: number;
  quoteId?: string;
  lines: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxRate: number; // e.g. 0.18 for 18% ITBIS
    //  Solo con taxRate 0. La DGII distingue 'exento' (indicador 4) de
    //  'tasa_cero' (indicador 3, exportaciones). Ver 0042. Sin valor: exento.
    taxCategory?: 'exento' | 'tasa_cero' | null;
    warehouseId?: string;
  }[];
  retentions?: {
    retentionId?: string;
    retentionName: string;
    retentionType: 'ITBIS' | 'ISR' | 'OTRA';
    retentionPercentage: number;
    agentRnc?: string;
    retentionDate?: string;
  }[];
}

export interface CalculatedTotals {
  subtotal: number;
  totalDiscount: number;
  totalTaxes: number;
  total: number;
  totalRetained: number;
  totalNet: number;
  itemLines: any[];
  taxesList: any[];
  calculatedRetentions: any[];
}

export interface DgiiSubmissionResult {
  msellerTrackId: string | null;
  dgiiMessage: string | null;
  securityHash: string;
  qrCode: string | null;
  finalStatus: 'signed' | 'submitted' | 'accepted' | 'rejected';
  msellerResponsePayload: any;
}

export class EcfRejectedError extends Error {
  status: number;
  code: string;

  constructor(message: string) {
    super(message);
    this.name = 'EcfRejectedError';
    this.status = 422;
    this.code = 'ECF_REJECTED';
  }
}

/**
 * OBSOLETO como senal de emision. Ya no lo lanza nadie.
 *
 * Marcaba "fallo de comunicacion" para que el NCF se quemara sin factura. Hoy
 * un desenlace desconocido queda en `submitted`, porque el documento pudo haber
 * llegado y `sincronizarPendientes` lo resuelve. La clase se conserva porque
 * `invoiceService` todavia la distingue en su `catch`.
 */
export class MSellerCommunicationError extends Error {
  status: number;
  code: string;

  constructor(message: string) {
    super(message);
    this.name = 'MSellerCommunicationError';
    this.status = 409;
    this.code = 'MSELLER_COMMUNICATION_ERROR';
  }
}
