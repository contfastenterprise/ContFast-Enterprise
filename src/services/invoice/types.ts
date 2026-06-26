export interface IssueInvoiceInput {
  companyId: string;
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
