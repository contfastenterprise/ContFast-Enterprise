import { decrypt } from '@/utils/encryption';

export interface ECFPayload {
  ECF: {
    Encabezado: {
      Version: string;
      IdDoc: {
        TipoeCF: string;
        eNCF: string;
        FechaVencimientoSecuencia: string;
        IndicadorEnvioDiferido?: string;
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
        DescuentoMonto?: number;
        TablaSubDescuento?: {
          SubDescuento: Array<{
            TipoSubDescuento: string;
            MontoSubDescuento: number;
          }>;
        };
        MontoItem: number;
      }>;
    };
    Paginacion: {
      Pagina: Array<{
        PaginaNo: number;
        NoLineaDesde: number;
        NoLineaHasta: number;
        SubtotalMontoGravadoPagina: number;
        SubtotalMontoGravado1Pagina: number;
        SubtotalExentoPagina: number;
        SubtotalItbisPagina: number;
        SubtotalItbis1Pagina: number;
        MontoSubtotalPagina: number;
        SubtotalMontoNoFacturablePagina: number;
      }>;
    };
    FechaHoraFirma?: string;
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
    let baseUrl = config.baseUrl || 'https://ecf.api.mseller.app';
    if (baseUrl.includes('api.mseller.app') && !baseUrl.includes('ecf.api.mseller.app')) {
      baseUrl = baseUrl.replace('api.mseller.app', 'ecf.api.mseller.app');
    }
    // Clean up baseUrl by removing any appended entornos and trailing slashes
    baseUrl = baseUrl.replace(/\/TesteCF$/gi, '')
                     .replace(/\/CerteCF$/gi, '')
                     .replace(/\/eCF$/gi, '');
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    
    console.log('[MSellerClient] Constructor - config.baseUrl:', config.baseUrl, 'cleaned baseUrl:', baseUrl);
    this.baseUrl = baseUrl;
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: this.email, password: this.password }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

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
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Timeout de autenticación con mSeller (el servidor no responde).');
      }
      throw err;
    }
  }

  async sendDocument(payload: ECFPayload): Promise<MSellerSendResponse> {
    const idToken = await this.authenticate();
    const apiKey = this.getApiKey();

    const url = `${this.baseUrl}/${this.entorno}/documentos-ecf`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const raw = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          success: false,
          message: raw?.message || `Error ${response.status} de mSeller`,
          rawResponse: raw,
        };
      }

      // Check if DGII rejected the document (even with HTTP 200)
      if (raw?.estado === 'Rechazado') {
        const rejectionMsg = raw.mensajes && Array.isArray(raw.mensajes) && raw.mensajes.length > 0
          ? raw.mensajes.map((m: any) => `${m.valor} (Código: ${m.codigo})`).join(' | ')
          : (raw.message || 'Rechazado por la DGII');
        return {
          success: false,
          message: rejectionMsg,
          rawResponse: raw,
        };
      }

      // If accepted or has warning messages, build success message
      let successMsg = 'Aceptado por la DGII';
      if (raw?.estado) {
        successMsg = raw.estado;
        const validMsgs = raw.mensajes && Array.isArray(raw.mensajes)
          ? raw.mensajes.filter((m: any) => m.valor && m.valor.trim() !== '' && m.codigo !== 0)
          : [];
        if (validMsgs.length > 0) {
          successMsg += `: ${validMsgs.map((m: any) => m.valor).join(' | ')}`;
        }
      }

      return {
        success: true,
        trackId: raw?.trackId || raw?.id || raw?.internalTrackId,
        securityCode: raw?.securityCode,
        qrCode: raw?.qrCode || raw?.qr_url || raw?.qr_code,
        message: successMsg,
        rawResponse: raw,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return {
          success: false,
          message: 'timeout - El servidor de integración mSeller/DGII tardó demasiado en responder.',
        };
      }
      return {
        success: false,
        message: err.message || 'FetchError - Error de comunicación con mSeller',
      };
    }
  }

  async getDocumentStatus(ncf: string): Promise<MSellerStatusResponse> {
    const idToken = await this.authenticate();
    const apiKey = this.getApiKey();

    const url = `${this.baseUrl}/${this.entorno}/documentos-ecf?ecf=${encodeURIComponent(ncf)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'X-API-KEY': apiKey,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

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
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return {
          success: false,
          message: 'timeout - Excedido el tiempo límite para obtener el estatus del comprobante.',
        };
      }
      return {
        success: false,
        message: err.message || 'FetchError - Error al obtener el estatus.',
      };
    }
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
    modifiedNcf?: string;
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
      IndicadorMontoGravado: '0',
      TipoIngresos: '05',
      TipoPago: params.paymentType,
    };

    if (params.paymentType === '2') {
      let dueDateStr = params.paymentDueDate;
      if (!dueDateStr) {
        const defaultDueDate = new Date(params.issueDate);
        defaultDueDate.setDate(defaultDueDate.getDate() + 30); // Default to 30 days credit
        dueDateStr = formatDate(defaultDueDate);
      }
      idDoc.FechaLimitePago = dueDateStr;
    }

    idDoc.TotalPaginas = 1;

    const encabezado: any = {
      Version: '1.0',
      IdDoc: idDoc,
      Emisor: {
        RNCEmisor: params.emitterRnc,
        RazonSocialEmisor: params.emitterName,
        DireccionEmisor: params.emitterAddress,
        FechaEmision: formatDate(params.issueDate),
      },
    };

    // Comprador must be serialized BEFORE Totales
    if (params.buyerRnc || ['31', '44', '45', '46'].includes(params.ecfType)) {
      encabezado.Comprador = {
        RNCComprador: params.buyerRnc || '222222222',
        RazonSocialComprador: params.buyerName || 'CONSUMIDOR FINAL',
      };
    }

    encabezado.Totales = {
      MontoGravadoTotal: Number(params.subtotal.toFixed(2)),
      MontoGravadoI1: Number(params.subtotal.toFixed(2)),
      MontoExento: 0,
      ITBIS1: itbisRate,
      TotalITBIS: Number(params.totalTaxes.toFixed(2)),
      TotalITBIS1: Number(params.totalTaxes.toFixed(2)),
      MontoTotal: Number(params.total.toFixed(2)),
      MontoNoFacturable: 0,
    };

    const payload: any = {
      ECF: {
        Encabezado: encabezado,
        DetallesItems: {
          Item: params.lines.map((line, idx) => {
            const subtotal = line.quantity * line.unitPrice;
            const discount = line.discount || 0;
            const montoItem = Number((subtotal - discount).toFixed(2));
            const item: any = {
              NumeroLinea: String(idx + 1),
              IndicadorFacturacion: '1',
              NombreItem: line.name,
              IndicadorBienoServicio: '1',
              CantidadItem: Number(line.quantity.toFixed(2)),
              UnidadMedida: '43',
              PrecioUnitarioItem: Number(line.unitPrice.toFixed(2)),
            };

            if (discount > 0) {
              item.DescuentoMonto = Number(discount.toFixed(2));
              item.TablaSubDescuento = {
                SubDescuento: [
                  {
                    TipoSubDescuento: '$',
                    MontoSubDescuento: Number(discount.toFixed(2)),
                  },
                ],
              };
            }

            item.MontoItem = montoItem;

            return item;
          }),
        },
        Paginacion: {
          Pagina: [
            {
              PaginaNo: 1,
              NoLineaDesde: 1,
              NoLineaHasta: params.lines.length || 1,
              SubtotalMontoGravadoPagina: Number(params.subtotal.toFixed(2)),
              SubtotalMontoGravado1Pagina: Number(params.subtotal.toFixed(2)),
              SubtotalExentoPagina: 0,
              SubtotalItbisPagina: Number(params.totalTaxes.toFixed(2)),
              SubtotalItbis1Pagina: Number(params.totalTaxes.toFixed(2)),
              MontoSubtotalPagina: Number(params.total.toFixed(2)),
              SubtotalMontoNoFacturablePagina: 0,
            },
          ],
        },
        FechaHoraFirma: '',
      },
    };

    if (params.modifiedNcf) {
      payload.ECF.TablaReferencia = {
        Referencia: [
          {
            NumeroLinea: '1',
            NCFModificado: params.modifiedNcf,
            CodigoModificacion: '1',
          },
        ],
      };
    }

    return payload as ECFPayload;
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
