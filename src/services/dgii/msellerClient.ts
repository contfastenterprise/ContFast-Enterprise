import { decryptAsync } from '@/utils/encryption';
import { leerEstado, mensajeEstado } from './estadoEnvio';
import { leerDatosFirma } from './codigoSeguridad';
import { MS_AUTENTICACION, MS_ENVIO, MS_CONSULTA } from './tiempos';

export interface ECFPayload {
  ECF: {
    Encabezado: {
      Version: string;
      IdDoc: {
        TipoeCF: string;
        eNCF: string;
        FechaVencimientoSecuencia: string;
        IndicadorEnvioDiferido?: string;
        //  No va en el e-44: la DGII lo rechaza con
        //  "The element 'IdDoc' has invalid child element 'IndicadorMontoGravado'".
        IndicadorMontoGravado?: string;
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
        MontoGravadoTotal?: number;
        MontoGravadoI1?: number;
        MontoExento: number;
        ITBIS1?: number;
        TotalITBIS?: number;
        TotalITBIS1?: number;
        MontoTotal: number;
        MontoNoFacturable?: number;
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
        SubtotalMontoGravadoPagina?: number;
        SubtotalMontoGravado1Pagina?: number;
        SubtotalExentoPagina: number;
        SubtotalItbisPagina?: number;
        SubtotalItbis1Pagina?: number;
        MontoSubtotalPagina: number;
        SubtotalMontoNoFacturablePagina?: number;
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

interface SessionCookieCache {
  cookie: string;
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
  private sessionCookieCache: SessionCookieCache | null = null;

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

  private async getApiKey(): Promise<string> {
    return decryptAsync(this.apiKeyEncrypted);
  }

  private async authenticate(): Promise<string> {
    // Check cache (tokens ~1 hour, we refresh at 50 min)
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.idToken;
    }

    const url = `${this.baseUrl}/${this.entorno}/customer/authentication`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MS_AUTENTICACION);

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
    const apiKey = await this.getApiKey();

    const url = `${this.baseUrl}/${this.entorno}/documentos-ecf`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MS_ENVIO);

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

      // ANTES: `raw?.status || raw?.estado`, que NO mira dentro de
      // `dgiiResponse`, que es justo donde viene el veredicto de la DGII
      // cuando mSeller lo reenvia anidado. `leerEstado` mira ahi primero.
      const lectura = leerEstado(raw);
      const finalStatus = lectura.textoCrudo;

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

      // Rechazo con HTTP 200. La comparacion era `finalStatus === 'Rechazado'`:
      // exacta y sensible a mayusculas, asi que 'RECHAZADO', 'rechazado' o
      // 'Rechazado por la DGII' se escapaban por la rama de exito -- y de ahi
      // salian con el mensaje "Aceptado por la DGII". `leerEstado` normaliza y
      // ademas mira el rechazo ANTES que la aceptacion ("no aceptado" contiene
      // "acept").
      if (lectura.estado === 'rejected') {
        const rejectionMsg = dgiiMessages && Array.isArray(dgiiMessages) && dgiiMessages.length > 0
          ? dgiiMessages.map((m: any) => `${m.valor} (Código: ${m.codigo})`).join(' | ')
          : (raw.message || 'Rechazado por la DGII');
        return {
          success: false,
          message: rejectionMsg,
          rawResponse: raw,
        };
      }

      // El mensaje NO puede afirmar una aceptacion que no consta. Era
      // `let successMsg = 'Aceptado por la DGII'`, y ese texto se devolvia tal
      // cual cuando la respuesta no traia estado. Peor: quien lo recibe lo
      // prefiere sobre cualquier otro (`mensajeEstado` respeta el mensaje del
      // proveedor), asi que la mentira sobrevivia al arreglo de mas arriba.
      let successMsg = mensajeEstado(lectura, null);
      if (finalStatus) {
        successMsg = finalStatus;
        const validMsgs = dgiiMessages && Array.isArray(dgiiMessages)
          ? dgiiMessages.filter((m: any) => m.valor && m.valor.trim() !== '' && m.codigo !== 0)
          : [];
        if (validMsgs.length > 0) {
          successMsg += `: ${validMsgs.map((m: any) => m.valor).join(' | ')}`;
        }
      }

      // ANTES: `raw?.securityCode` y `raw?.qrCode || raw?.qr_url || ...`, que
      // solo miran el PRIMER NIVEL. Cuando mSeller reenvia el veredicto de la
      // DGII anidado en `dgiiResponse` -- que es de donde ya habia que sacar el
      // estado -- el codigo de seguridad viene dentro y no se leia. La factura
      // salia sin codigo aunque mSeller lo hubiera mandado, y al imprimirla se
      // fabricaba uno con sha256. `leerDatosFirma` mira dentro.
      const firma = leerDatosFirma(raw);

      return {
        success: true,
        trackId: raw?.trackId || raw?.id || raw?.internalTrackId,
        securityCode: firma.codigo || undefined,
        qrCode: firma.qr || undefined,
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
    const apiKey = await this.getApiKey();

    const url = `${this.baseUrl}/${this.entorno}/documentos-ecf?ecf=${encodeURIComponent(ncf)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MS_CONSULTA);

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

      // `|| 'Aceptado'` inventaba un estado cuando la respuesta no traia
      // ninguno, y ese texto acababa en `dgiiStatus` y en el mensaje que se
      // guarda con el envio. La lectura la hace `leerEstado`, en un solo sitio.
      const lectura = leerEstado(raw);
      const finalDGIIStatus = dgiiEstado || lectura.textoCrudo || 'Sin estado';

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
    const apiKey = await this.getApiKey();

    const url = `${this.baseUrl}/${this.entorno}/documentos-ecf/status/batch`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MS_CONSULTA);

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
      //  Solo importa cuando taxRate es 0, porque la DGII distingue DOS ceros
      //  (ver 0042). Sin valor, un 0 se declara EXENTO, que es como se venia
      //  comportando y lo que corresponde a todo lo emitido hasta ahora.
      taxCategory?: 'exento' | 'tasa_cero' | null;
    }>;
  }): ECFPayload {
    const formatDate = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    };

    // ------------------------------------------------------------------
    //  TASAS DE ITBIS DEL COMPROBANTE
    //
    //  Antes esto era `const itbisRate = 18;` y se enviaba tal cual en
    //  `ITBIS1`. Es decir: una factura al 16% se le DECLARABA a la DGII como
    //  18%, y una exenta se declaraba como gravada con `MontoExento: 0`. No es
    //  un problema de impresion: es lo que consta en el comprobante fiscal.
    //
    //  Se calcula de las lineas. Criterio deliberado: para el caso corriente
    //  -- todas las lineas al 18% -- el resultado es IDENTICO al de antes, asi
    //  que los envios que hoy funcionan no cambian.
    // ------------------------------------------------------------------
    const baseDeLinea = (l: { quantity: number; unitPrice: number; discount: number }) =>
      Number((l.quantity * l.unitPrice - (l.discount || 0)).toFixed(2));

    //  LOS DOS CEROS
    //
    //  Una linea a tasa 0 puede ser dos cosas distintas para la DGII, y no se
    //  declaran en el mismo sitio:
    //
    //    'exento'    (indicador 4) -> suma a MontoExento
    //    'tasa_cero' (indicador 3) -> suma a MontoGravadoI3, con ITBIS3 = 0
    //
    //  Sin categoria, un 0 es EXENTO. Eso deja intacto todo lo emitido hasta
    //  hoy: hasta la 0042 el formulario solo ofrecia "0% Exento".
    const porTasa = new Map<number, number>();   // tasa en % -> base gravada
    let montoExento = 0;
    let baseTasaCero = 0;
    for (const l of params.lines) {
      const base = baseDeLinea(l);
      const pct = Math.round((l.taxRate ?? 0) * 10000) / 100;   // 0.18 -> 18
      if (pct === 0) {
        if (l.taxCategory === 'tasa_cero') {
          baseTasaCero = Number((baseTasaCero + base).toFixed(2));
        } else {
          montoExento = Number((montoExento + base).toFixed(2));
        }
        continue;
      }
      porTasa.set(pct, Number(((porTasa.get(pct) ?? 0) + base).toFixed(2)));
    }

    //  De mayor a menor: asi el 18% cae en el primer tramo, que es donde lo
    //  pone la DGII en sus ejemplos y donde lo ponia este codigo.
    const gravados = [...porTasa.entries()].sort((x, y) => y[0] - x[0]);

    //  La tasa cero ocupa SIEMPRE el tercer tramo, porque el indicador 3 y el
    //  campo MontoGravadoI3 van emparejados en el formato de la DGII. Las tasas
    //  gravadas de verdad se quedan con los tramos 1 y 2.
    //
    //  AVISO: esta rama todavia NO se ha validado con un envio real. Que el I3
    //  se pueda declarar sin I2 hay que confirmarlo en PRUEBA antes de usarla
    //  para una exportacion.
    if (baseTasaCero > 0 && gravados.length > 2) {
      throw new Error(
        'El comprobante mezcla una linea a tasa 0% (exportacion) con ' +
        `${gravados.length} tasas gravadas. El tramo 3 esta reservado para la tasa 0%, ` +
        'asi que solo caben dos tasas gravadas. Hay que separarlo en varios comprobantes.'
      );
    }

    const tramos: Array<[number, number]> = [...gravados];
    //  Se rellenan los huecos hasta el tercer tramo para que la tasa cero caiga
    //  en el indice 3 y no en el 2. Los huecos no se declaran.
    const tramoTasaCero = baseTasaCero > 0 ? 3 : 0;

    //  El formato de la DGII admite TRES tramos de ITBIS. Con mas, esto no se
    //  puede expresar. Se LANZA en vez de mandar algo aproximado: un
    //  comprobante fiscal mal declarado no lo corrige nadie despues.
    if (tramos.length > 3) {
      throw new Error(
        `El comprobante tiene ${tramos.length} tasas de ITBIS distintas (${tramos.map(t => t[0] + '%').join(', ')}) ` +
        'y el formato de la DGII solo admite tres. Hay que separarlo en varios comprobantes.'
      );
    }

    //  La tasa cero ES gravada (al 0%), asi que entra en MontoGravadoTotal. Lo
    //  exento no.
    const montoGravadoTotal = Number(
      (tramos.reduce((acc, [, base]) => acc + base, 0) + baseTasaCero).toFixed(2));

    // ------------------------------------------------------------------
    //  INDICADOR DE FACTURACION DE CADA LINEA
    //
    //  Estaba escrito a pelo como '1' en todos los articulos. Segun el formato
    //  e-CF de la DGII (v1.0), ese campo vale:
    //
    //      1  Gravado a ITBIS Tasa 1        -> suma a MontoGravadoI1
    //      2  Gravado a ITBIS Tasa 2        -> suma a MontoGravadoI2
    //      3  Gravado a ITBIS Tasa 3        -> suma a MontoGravadoI3
    //      4  Exento                        -> suma a MontoExento
    //      0  No facturable                 -> suma a MontoNoFacturable
    //
    //  O sea que con el '1' fijo, una linea exenta se le declaraba a la DGII
    //  como gravada a la tasa 1, mientras los Totales del MISMO comprobante la
    //  metian en MontoExento. El comprobante se contradecia a si mismo: los
    //  articulos sumaban a un tramo y los totales a otro.
    //
    //  El indicador es POSICIONAL: apunta al tramo declarado en los Totales
    //  (ITBIS1/ITBIS2/ITBIS3), que es donde va el porcentaje de verdad. Por eso
    //  se calcula del propio `tramos` y no de una tabla de tasas fija: asi los
    //  articulos y los totales no se pueden separar nunca.
    //
    //  Las lineas al 0% se declaran EXENTAS (4), que es lo que dice la opcion
    //  del formulario ("0% Exento") y lo que ya hacian los Totales al sumarlas
    //  a MontoExento. La DGII distingue "exento" (4) de "gravado a tasa 0" (3);
    //  si alguna vez hiciera falta el 3, hay que cambiar las DOS cosas a la vez,
    //  aqui y en los Totales.
    // ------------------------------------------------------------------
    const indicadorDeLinea = (
      taxRate: number | null | undefined,
      taxCategory?: 'exento' | 'tasa_cero' | null,
    ): string => {
      const pct = Math.round((taxRate ?? 0) * 10000) / 100;
      //  Los dos ceros. Sin categoria, exento -- que es como se comporto
      //  siempre y lo que corresponde a todo lo ya emitido.
      if (pct === 0) return taxCategory === 'tasa_cero' ? String(tramoTasaCero) : '4';
      const i = tramos.findIndex(([p]) => p === pct);
      if (i < 0) {
        // No puede pasar: `tramos` sale de estas mismas lineas. Si pasara,
        // lanzar es mejor que declarar la linea en un tramo que no es el suyo.
        throw new Error(
          `La linea con tasa ${pct}% no corresponde a ningun tramo declarado ` +
          `(${tramos.map(t => t[0] + '%').join(', ') || 'ninguno'}).`
        );
      }
      return String(i + 1);
    };

    // ──────────────────────────────────────────────────────────────────
    //  EL e-44 NO TIENE SECCION DE GRAVADO
    //
    //  El e-44 (Regimenes Especiales) documenta transferencias EXENTAS a
    //  entidades acogidas a un regimen especial. Su XSD no admite ni un solo
    //  campo de gravado, y la DGII lo rechaza nombrandolos uno por uno:
    //
    //    "The element 'IdDoc' has invalid child element 'IndicadorMontoGravado'.
    //     List of possible elements expected: 'IndicadorEnvioDiferido,
    //     IndicadorServicioTodoIncluido, TipoIngresos'."
    //
    //    "The element 'Totales' has invalid child element 'MontoGravadoTotal'.
    //     List of possible elements expected: 'MontoExento,
    //     MontoImpuestoAdicional, ImpuestosAdicionales, MontoTotal'."
    //
    //    "The element 'Pagina' has invalid child element
    //     'SubtotalMontoGravadoPagina'. ..."
    //
    //  Rechazo real recibido el 2026-09-02 sobre E440000000001 y ...0002. Lo
    //  que sigue esta escrito contra ESE mensaje, no contra una lectura del PDF
    //  del formato -- que para el 44 marca esos campos como "condicional" y
    //  llevaria a dejarlos. El validador de la DGII es la autoridad.
    // ──────────────────────────────────────────────────────────────────
    const esSoloExento = params.ecfType === '44';

    if (esSoloExento && (tramos.length > 0 || baseTasaCero > 0)) {
      throw new Error(
        `El comprobante e-44 (Regimenes Especiales) es exento por definicion y no admite ` +
        `lineas gravadas, pero tiene ${tramos.map(t => t[0] + '%').join(', ') || 'tasa 0% gravada'}. ` +
        'Ponga todas las lineas como Exento, o use otro tipo de comprobante.'
      );
    }

    // Build idDoc in the EXACT field order required by DGII's XSD schema.
    // Reference XML (accepted by DGII) order for e-34:
    // TipoeCF → eNCF → IndicadorNotaCredito → IndicadorEnvioDiferido → IndicadorMontoGravado → TipoIngresos → TipoPago
    let idDoc: any;

    if (params.ecfType === '34') {
      idDoc = {
        TipoeCF: params.ecfType,
        eNCF: params.ncf,
        IndicadorNotaCredito: 0,                // position 3 — integer required, MUST be 0 for e-34
        IndicadorEnvioDiferido: 1,              // position 4 — MUST be 1 (AUTORIZADO) per DGII error 164
        IndicadorMontoGravado: '0',             // position 5
        TipoIngresos: '01',                    // '01' = Ingresos por operaciones (per reference XML)
        TipoPago: params.paymentType,
      };
    } else if (params.ecfType === '33') {
      // e-33 (Nota de Débito) — requires FechaVencimientoSecuencia and no IndicadorEnvioDiferido
      idDoc = {
        TipoeCF: params.ecfType,
        eNCF: params.ncf,
        FechaVencimientoSecuencia: params.sequenceExpiry,
        IndicadorMontoGravado: '0',
        TipoIngresos: '01',
        TipoPago: params.paymentType,
      };
    } else if (esSoloExento) {
      // e-44: SIN IndicadorMontoGravado. Ver el bloque de arriba.
      idDoc = {
        TipoeCF: params.ecfType,
        eNCF: params.ncf,
        FechaVencimientoSecuencia: params.sequenceExpiry,
        TipoIngresos: '05',
        TipoPago: params.paymentType,
      };
    } else {
      // Standard invoices (e-31, e-32, e-45, e-46)
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
        defaultDueDate.setMonth(defaultDueDate.getMonth() + 1);
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

    const totales: any = {};

    if (esSoloExento) {
      //  Exactamente los dos campos que el validador nombro como admitidos, y
      //  ninguno mas. Ni MontoNoFacturable: no aparecia en su lista, y mandar
      //  de mas es lo que provoco el rechazo.
      totales.MontoExento = Number(params.total.toFixed(2));
      totales.MontoTotal = Number(params.total.toFixed(2));
    } else {
      totales.MontoGravadoTotal = montoGravadoTotal;
      //  Un tramo por cada tasa presente. Sin lineas gravadas no se declara
      //  ningun tramo: la factura es exenta entera.
      tramos.forEach(([pct, base], i2) => {
        totales[`MontoGravadoI${i2 + 1}`] = base;
        totales[`ITBIS${i2 + 1}`] = pct;
      });
      //  El tramo de tasa 0% va en el tercero, emparejado con el indicador 3.
      if (baseTasaCero > 0) {
        totales[`MontoGravadoI${tramoTasaCero}`] = baseTasaCero;
        totales[`ITBIS${tramoTasaCero}`] = 0;
      }
      totales.MontoExento = montoExento;
      totales.TotalITBIS = Number(params.totalTaxes.toFixed(2));
      tramos.forEach(([pct, base], i2) => {
        totales[`TotalITBIS${i2 + 1}`] = Number((base * pct / 100).toFixed(2));
      });
      if (baseTasaCero > 0) {
        totales[`TotalITBIS${tramoTasaCero}`] = 0;
      }
      totales.MontoTotal = Number(params.total.toFixed(2));
      totales.MontoNoFacturable = 0;
    }

    encabezado.Totales = totales;

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
            IndicadorFacturacion: indicadorDeLinea(line.taxRate, line.taxCategory),
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
      //  Los importes salen de los MISMOS tramos que los Totales. Antes estaban
      //  escritos aparte y a mano -- todo el subtotal como gravado y
      //  `SubtotalExentoPagina: 0` fijo -- asi que una factura con lineas
      //  exentas tenia la Paginacion contradiciendo a sus propios Totales. Para
      //  el caso corriente (todo gravado) el resultado es identico al de antes.
      const pagina: any = {
        PaginaNo: 1,
        NoLineaDesde: 1,
        NoLineaHasta: params.lines.length || 1,
      };

      if (esSoloExento) {
        pagina.SubtotalExentoPagina = Number(params.total.toFixed(2));
        pagina.MontoSubtotalPagina = Number(params.total.toFixed(2));
      } else {
        pagina.SubtotalMontoGravadoPagina = montoGravadoTotal;
        pagina.SubtotalMontoGravado1Pagina = tramos.length > 0 ? tramos[0][1] : 0;
        pagina.SubtotalExentoPagina = montoExento;
        pagina.SubtotalItbisPagina = Number(params.totalTaxes.toFixed(2));
        pagina.SubtotalItbis1Pagina = tramos.length > 0
          ? Number((tramos[0][1] * tramos[0][0] / 100).toFixed(2))
          : 0;
        pagina.MontoSubtotalPagina = Number(params.total.toFixed(2));
        pagina.SubtotalMontoNoFacturablePagina = 0;
      }

      ecfObj.Paginacion = { Pagina: [pagina] };
    }

    ecfObj.FechaHoraFirma = '';

    const payload: any = {
      ECF: ecfObj,
    };

    return payload as ECFPayload;
  }

  private async getPortalSessionCookie(): Promise<string> {
    if (this.sessionCookieCache && Date.now() < this.sessionCookieCache.expiresAt) {
      return this.sessionCookieCache.cookie;
    }

    const domain = 'https://ecf.mseller.app';
    const csrfRes = await fetch(`${domain}/api/auth/csrf`);
    if (!csrfRes.ok) {
      throw new Error(`Failed to get CSRF token from mSeller portal: ${csrfRes.statusText}`);
    }

    const { csrfToken } = await csrfRes.json();
    const csrfCookie = csrfRes.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');

    const loginRes = await fetch(`${domain}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': csrfCookie,
      },
      body: new URLSearchParams({
        csrfToken,
        username: this.email,
        email: this.email,
        password: this.password,
        json: 'true',
        redirect: 'false',
      }).toString(),
    });

    if (!loginRes.ok) {
      throw new Error(`Failed to log in to mSeller portal: ${loginRes.statusText}`);
    }

    const loginCookies = loginRes.headers.getSetCookie();
    const sessionCookie = loginCookies.map(c => c.split(';')[0]).join('; ');

    if (!sessionCookie || !sessionCookie.includes('session-token')) {
      throw new Error('Failed to obtain NextAuth session cookie from mSeller portal.');
    }

    // Cache session cookie for 50 minutes
    this.sessionCookieCache = {
      cookie: sessionCookie,
      expiresAt: Date.now() + 50 * 60 * 1000,
    };

    return sessionCookie;
  }

  async downloadXml(signedXmlPath: string): Promise<string> {
    const sessionCookie = await this.getPortalSessionCookie();
    const downloadUrl = `https://ecf.mseller.app/api/documents/download?file=${signedXmlPath}`;

    const downloadRes = await fetch(downloadUrl, {
      headers: {
        'Cookie': sessionCookie,
      },
    });

    if (!downloadRes.ok) {
      throw new Error(`Failed to fetch pre-signed URL from mSeller portal: ${downloadRes.statusText}`);
    }

    const { presignedUrl } = await downloadRes.json();
    if (!presignedUrl) {
      throw new Error('mSeller download API did not return a presigned URL.');
    }

    const xmlRes = await fetch(presignedUrl);
    if (!xmlRes.ok) {
      throw new Error(`Failed to download XML from pre-signed URL: ${xmlRes.statusText}`);
    }

    return await xmlRes.text();
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
