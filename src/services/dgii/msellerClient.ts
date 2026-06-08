import { decrypt } from '@/utils/encryption';

export interface ECFPayload {
  ECF: {
    Encabezado: {
      Version: string;
      IdDoc: {
        TipoeCF: string;
        eNCF: string;
        FechaVencimientoSecuencia: string;
        IndicadorEnvioDiferido: string;
        IndicadorMontoGravado: string;
        TipoIngresos: string;
        TipoPago: string;
        FechaLimitePago?: string;
        TotalPaginas: number;
      };
      Emisor: {
        RNCEmisor: string;
        RazonSocialEmisor: string;
        DireccionEmisor: string;
        FechaEmision: string;
      };
      Comprador?: {
        RNCComprador: string;
        RazonSocialComprador: string;
      };
      Totales: {
        MontoGravadoTotal: number;
        MontoGravadoI1: number;
        MontoExento: number;
        ITBIS1: number;
        TotalITBIS: number;
        TotalITBIS1: number;
        MontoTotal: number;
        MontoNoFacturable: number;
      };
    };
    DetallesItems: {
      Item: Array<{
        NumeroLinea: string;
        IndicadorFacturacion: string;
        NombreItem: string;
        IndicadorBienoServicio: string;
        CantidadItem: number;
        UnidadMedida: string;
        PrecioUnitarioItem: number;
        DescuentoMonto: number;
      }>;
    };
  };
}

export interface MSellerSendResponse {
  success: boolean;
  trackId?: string;
  securityCode?: string;
  qrCode?: string;
  message?: string;
  rawResponse?: any;
}

export interface MSellerStatusResponse {
  success: boolean;
  ncf?: string;
  status?: string;
  dgiiStatus?: string;
  message?: string;
  rawResponse?: any;
}

interface TokenCache {
  idToken: string;
  expiresAt: number;
}

// Legacy interface kept for backward compatibility
export interface MSellerInvoicePayload {
  companyRnc: string;
  ncfType: string;
  buyerRnc?: string;
  buyerName?: string;
  currency: 'DOP' | 'USD';
  paymentMethod: number;
  items: {
    quantity: number;
    description: string;
    unitPrice: number;
    discount: number;
    taxRate: number;
  }[];
}

export class MSellerClient {
  private baseUrl: string;
  private entorno: string;
  private email: string;
  private password: string;
  private apiKeyEncrypted: string;
  private tokenCache: TokenCache | null = null;

  constructor(config: {
    baseUrl: string;
    entorno: string;
    email: string;
    password: string;
    apiKeyEncrypted: string;
  }) {
    this.baseUrl = config.baseUrl || 'https://ecf.api.mseller.app';
    this.entorno = config.entorno || 'TesteCF';
    this.email = config.email;
    this.password = config.password;
    this.apiKeyEncrypted = config.apiKeyEncrypted;
  }

  private getApiKey(): string {
    return decrypt(this.apiKeyEncrypted);
  }

  private async authenticate(): Promise<string> {
    // Check cache (tokens ~1 hour, we refresh at 50 min)
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.idToken;
    }

    const url = `${this.baseUrl}/${this.entorno}/customer/authentication`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`mSeller auth failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const idToken = data.idToken;
    if (!idToken) {
      throw new Error('mSeller auth: idToken not returned in response');
    }

    // Cache for 50 minutes
    this.tokenCache = { idToken, expiresAt: Date.now() + 50 * 60 * 1000 };
    return idToken;
  }

  async sendDocument(payload: ECFPayload): Promise<MSellerSendResponse> {
    const idToken = await this.authenticate();
    const apiKey = this.getApiKey();

    const url = `${this.baseUrl}/${this.entorno}/documentos-ecf`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        message: raw?.message || `Error ${response.status} de mSeller`,
        rawResponse: raw,
      };
    }

    return {
      success: true,
      trackId: raw?.trackId || raw?.id,
      securityCode: raw?.securityCode,
      qrCode: raw?.qrCode,
      message: raw?.message,
      rawResponse: raw,
    };
  }

  async getDocumentStatus(ncf: string): Promise<MSellerStatusResponse> {
    const idToken = await this.authenticate();
    const apiKey = this.getApiKey();

    const url = `${this.baseUrl}/${this.entorno}/documentos-ecf?ecf=${encodeURIComponent(ncf)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'X-API-KEY': apiKey,
      },
    });

    const raw = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        message: raw?.message || `Error ${response.status}`,
        rawResponse: raw,
      };
    }

    return {
      success: true,
      ncf: raw?.ncf || ncf,
      status: raw?.status,
      dgiiStatus: raw?.dgiiStatus || raw?.estadoDGII,
      message: raw?.message,
      rawResponse: raw,
    };
  }

  /**
   * Construye el payload ECF completo a partir de datos de la factura.
   * Formato de fecha DGII: dd-MM-yyyy
   */
  static buildECFPayload(params: {
    ncf: string;
    ecfType: string;
    sequenceExpiry: string; // dd-MM-yyyy
    paymentType: '1' | '2'; // 1=contado, 2=crédito
    paymentDueDate?: string; // dd-MM-yyyy, solo crédito
    issueDate: Date;
    emitterRnc: string;
    emitterName: string;
    emitterAddress: string;
    buyerRnc?: string;
    buyerName?: string;
    subtotal: number;
    totalTaxes: number;
    total: number;
    lines: Array<{
      index: number;
      name: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      taxRate: number; // 0.18, 0, etc.
    }>;
  }): ECFPayload {
    const formatDate = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    };

    const itbisRate = 18;

    const idDoc: any = {
      TipoeCF: params.ecfType,
      eNCF: params.ncf,
      FechaVencimientoSecuencia: params.sequenceExpiry,
      IndicadorEnvioDiferido: '0',
      IndicadorMontoGravado: '0',
      TipoIngresos: '05',
      TipoPago: params.paymentType,
      TotalPaginas: 1,
    };

    if (params.paymentType === '2' && params.paymentDueDate) {
      idDoc.FechaLimitePago = params.paymentDueDate;
    }

    const encabezado: any = {
      Version: '1.0',
      IdDoc: idDoc,
      Emisor: {
        RNCEmisor: params.emitterRnc,
        RazonSocialEmisor: params.emitterName,
        DireccionEmisor: params.emitterAddress,
        FechaEmision: formatDate(params.issueDate),
      },
      Totales: {
        MontoGravadoTotal: params.subtotal,
        MontoGravadoI1: params.subtotal,
        MontoExento: 0,
        ITBIS1: itbisRate,
        TotalITBIS: params.totalTaxes,
        TotalITBIS1: params.totalTaxes,
        MontoTotal: params.total,
        MontoNoFacturable: 0,
      },
    };

    // Comprador required for tipo 31 (Crédito Fiscal)
    if (params.ecfType === '31' && params.buyerRnc) {
      encabezado.Comprador = {
        RNCComprador: params.buyerRnc,
        RazonSocialComprador: params.buyerName || 'CONSUMIDOR FINAL',
      };
    }

    return {
      ECF: {
        Encabezado: encabezado,
        DetallesItems: {
          Item: params.lines.map((line, idx) => ({
            NumeroLinea: String(idx + 1),
            IndicadorFacturacion: '1',
            NombreItem: line.name,
            IndicadorBienoServicio: '1',
            CantidadItem: line.quantity,
            UnidadMedida: '43',
            PrecioUnitarioItem: line.unitPrice,
            DescuentoMonto: line.discount || 0,
          })),
        },
      },
    };
  }

  /**
   * Legacy static method for backward compatibility with invoiceService.ts
   */
  static async issueInvoice(payload: MSellerInvoicePayload) {
    console.warn('[MSellerClient] issueInvoice is deprecated. Use instance sendDocument() with ECFPayload instead.');
    // Return mock for legacy callers until fully migrated
    const ncf = `E${payload.ncfType}0000000${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    return {
      success: true,
      data: {
        ncf,
        trackId: `trk_${Date.now()}`,
        status: 'accepted',
        signedXmlBase64: Buffer.from('<xml>Mock Signed XML</xml>').toString('base64'),
        dgiiMessage: 'Aceptado (MOCK - usa ECFPayload)',
      },
    };
  }
}
