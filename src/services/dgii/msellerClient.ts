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
    Paginacion?: {
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

      const finalStatus = raw?.status || raw?.estado;

      // Extract messages from dgiiResponse if it exists (mSeller structure)
      let dgiiMessages = raw?.mensajes;
      if (!dgiiMessages && raw?.dgiiResponse && Array.isArray(raw.dgiiResponse)) {
        for (const respStr of raw.dgiiResponse) {
          try {
            const parsed = typeof respStr === 'string' ? JSON.parse(respStr) : respStr;
            if (parsed?.mensajes && Array.isArray(parsed.mensajes)) {
              dgiiMessages = parsed.mensajes;
            }
          } catch (e) {}
        }
      }

      // Check if DGII rejected the document (even with HTTP 200)
      if (finalStatus === 'Rechazado') {
        const rejectionMsg = dgiiMessages && Array.isArray(dgiiMessages) && dgiiMessages.length > 0
          ? dgiiMessages.map((m: any) => `${m.valor} (Código: ${m.codigo})`).join(' | ')
          : (raw.message || 'Rechazado por la DGII');
        return {
          success: false,
          message: rejectionMsg,
          rawResponse: raw,
        };
      }

      // If accepted or has warning messages, build success message
      let successMsg = 'Aceptado por la DGII';
      if (finalStatus) {
        successMsg = finalStatus;
        const validMsgs = dgiiMessages && Array.isArray(dgiiMessages)
          ? dgiiMessages.filter((m: any) => m.valor && m.valor.trim() !== '' && m.codigo !== 0)
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

      // Extract detailed messages from dgiiResponse if it exists
      let dgiiMessages = raw?.mensajes || [];
      let dgiiEstado = raw?.dgiiStatus || raw?.estadoDGII || null;

      if (raw?.dgiiResponse && Array.isArray(raw.dgiiResponse)) {
        for (const respStr of raw.dgiiResponse) {
          try {
            const parsed = typeof respStr === 'string' ? JSON.parse(respStr) : respStr;
            if (parsed) {
              if (parsed.estado) {
                dgiiEstado = parsed.estado;
              }
              if (parsed.mensajes && Array.isArray(parsed.mensajes)) {
                dgiiMessages = [...dgiiMessages, ...parsed.mensajes];
              }
            }
          } catch (e) {}
        }
      }

      const finalDGIIStatus = dgiiEstado || raw?.status || raw?.estado || 'Aceptado';
      
      let customMessage = finalDGIIStatus;
      const validMsgs = dgiiMessages.filter((m: any) => m.valor && m.valor.trim() !== '' && m.codigo !== 0);
      if (validMsgs.length > 0) {
        customMessage += `: ${validMsgs.map((m: any) => m.valor).join(' | ')}`;
      } else if (raw?.message) {
        customMessage += `: ${raw.message}`;
      }

      return {
        success: true,
        ncf: raw?.ncf || ncf,
        status: raw?.status,
        dgiiStatus: finalDGIIStatus,
        message: customMessage,
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

  async getDocumentsStatusBatch(ncfs: string[]): Promise<{
    success: boolean;
    total: number;
    results: Array<{
      ecf: string;
      status: string;
      found: boolean;
      data?: any;
    }>;
    rawResponse?: any;
    message?: string;
  }> {
    const idToken = await this.authenticate();
    const apiKey = this.getApiKey();

    const url = `${this.baseUrl}/${this.entorno}/documentos-ecf/status/batch`;
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
        body: JSON.stringify({ ecfs: ncfs }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const raw = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          success: false,
          total: 0,
          results: [],
          message: raw?.message || `Error ${response.status}`,
          rawResponse: raw,
        };
      }

      return {
        success: true,
        total: raw?.total || 0,
        results: raw?.results || [],
        rawResponse: raw,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return {
          success: false,
          total: 0,
          results: [],
          message: 'timeout - Excedido el tiempo límite para obtener el estatus en lote.',
        };
      }
      return {
        success: false,
        total: 0,
        results: [],
        message: err.message || 'FetchError - Error al obtener el estatus en lote.',
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
    originalInvoiceTotal?: number;
    modifiedNcf?: string;
    modifiedNcfDate?: Date;
    indicadorNotaCredito?: number;
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

    // Build idDoc in the EXACT field order required by DGII's XSD schema.
    // Reference XML (accepted by DGII) order for e-34:
    // TipoeCF → eNCF → IndicadorNotaCredito → IndicadorEnvioDiferido → IndicadorMontoGravado → TipoIngresos → TipoPago
    let idDoc: any;

    if (params.ecfType === '34') {
      // Use the explicitly provided value (0=No aplica is valid per DGII reference XML)
      // Only auto-detect if not provided at all
      const indicador: number =
        params.indicadorNotaCredito !== undefined
          ? params.indicadorNotaCredito
          : (() => {
              if (params.originalInvoiceTotal !== undefined) {
                return Math.abs(params.total - params.originalInvoiceTotal) < 0.05 ? 1 : 3;
              }
              return 1;
            })();

      idDoc = {
        TipoeCF: params.ecfType,
        eNCF: params.ncf,
        IndicadorNotaCredito: indicador,        // position 3 — integer required
        IndicadorEnvioDiferido: 0,              // position 4 — required by XSD, always 0 (not deferred)
        IndicadorMontoGravado: '0',             // position 5
        TipoIngresos: '01',                    // '01' = Ingresos por operaciones (per reference XML)
        TipoPago: params.paymentType,
      };
    } else if (params.ecfType === '33') {
      // e-33 (Nota de Débito) — no IndicadorNotaCredito, but needs IndicadorEnvioDiferido
      idDoc = {
        TipoeCF: params.ecfType,
        eNCF: params.ncf,
        IndicadorEnvioDiferido: 0,
        IndicadorMontoGravado: '0',
        TipoIngresos: '01',
        TipoPago: params.paymentType,
      };
    } else {
      // Standard invoices (e-31, e-32, e-45)
      idDoc = {
        TipoeCF: params.ecfType,
        eNCF: params.ncf,
        FechaVencimientoSecuencia: params.sequenceExpiry,
        IndicadorMontoGravado: '0',
        TipoIngresos: '05',
        TipoPago: params.paymentType,
      };
    }

    if (params.paymentType === '2') {
      let dueDateStr = params.paymentDueDate;
      if (!dueDateStr) {
        const defaultDueDate = new Date(params.issueDate);
        defaultDueDate.setDate(defaultDueDate.getDate() + 30);
        dueDateStr = formatDate(defaultDueDate);
      }
      idDoc.FechaLimitePago = dueDateStr;
    }

    // TotalPaginas only for standard invoices
    if (!['33', '34'].includes(params.ecfType)) {
      idDoc.TotalPaginas = 1;
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
    };

    // Comprador must be serialized BEFORE Totales
    if (params.buyerRnc || ['31', '33', '34', '44', '45', '46'].includes(params.ecfType)) {
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

    // Construct ECF object elements in the strict sequential order required by DGII XML Schema
    const ecfObj: any = {
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
    };

    // If it is an adjustment note, InformacionReferencia (referencing the modified e-CF) MUST be
    // a plain object (NOT an array) — confirmed by reference XML accepted by DGII.
    if (params.modifiedNcf) {
      const refItem: any = {
        NCFModificado: params.modifiedNcf,
      };
      if (params.modifiedNcfDate) {
        refItem.FechaNCFModificado = formatDate(params.modifiedNcfDate);
      }
      // CodigoModificacion matches IndicadorNotaCredito value
      refItem.CodigoModificacion = params.indicadorNotaCredito ?? 1;

      // Plain object — not an array — so MSeller generates a single <InformacionReferencia> element
      ecfObj.InformacionReferencia = refItem;
    }

    // Paginacion is only added for standard invoices (31, 32, 45)
    if (!['33', '34'].includes(params.ecfType)) {
      ecfObj.Paginacion = {
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
      };
    }

    ecfObj.FechaHoraFirma = '';

    const payload: any = {
      ECF: ecfObj,
    };

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
