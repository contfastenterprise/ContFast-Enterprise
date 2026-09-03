import { NextRequest, NextResponse } from 'next/server';
import { CODIGOS_EMITIBLES, TIPOS_COMPROBANTE } from '@/services/dgii/tiposComprobante';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { withIdempotency } from '@/lib/idempotency';
import { InvoiceService } from '@/services/invoiceService';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { db, invoices, subscriptions, plans, warehouses, products, customers, quotes, cashSessions, retentions } from '@/db';
import { eq, and, count, gte, lte, inArray, isNull } from 'drizzle-orm';

/**
 * Cuanto puede durar la emision en la plataforma.
 *
 * Emitir no es escribir una fila: es firmar el e-CF en mSeller, transmitirlo a
 * la DGII y esperar el veredicto. Sin este limite declarado, Vercel aplica su
 * valor por defecto (del orden de 15 s) y corta la funcion antes de que el
 * cliente de mSeller llegue siquiera a su propio tiempo de espera -- con lo
 * que subir ese tiempo de espera no serviria de nada.
 *
 * Va emparejado con `MS_ENVIO` en src/services/dgii/tiempos.ts (45 s): si uno
 * sube, el otro tambien. Este numero tiene que ser el mayor de los dos.
 *
 * Se escribe el numero literal a proposito. Next lo lee en tiempo de
 * compilacion analizando el fichero, no ejecutandolo, asi que una constante
 * importada no vale: no la resolveria.
 */
export const maxDuration = 60;

// Zod validation schema for creating an invoice
const createInvoiceSchema = z.object({
  customerId: z.string().uuid().optional(),
  warehouseId: z.string().uuid(),
  cashSessionId: z.string().uuid().optional(),
  // Los codigos que el flujo de ventas emite, de la lista unica. El 44
  // (Regimenes Especiales) y el 46 (Exportaciones) no estaban y por eso una
  // secuencia de esos tipos se podia elegir en el formulario pero la emision
  // la rechazaba con "Tipo de e-CF invalido".
  ecfType: z.enum(CODIGOS_EMITIBLES, {
    message: `Tipo de e-CF inválido. Los admitidos son: ${TIPOS_COMPROBANTE.filter(t => t.emitible).map(t => `${t.codigo} (${t.corto})`).join(', ')}.`,
  }),
  paymentType: z.enum(['cash', 'credit', 'bank_transfer']),
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
  ).min(1, 'La factura debe tener al menos una línea de producto'),
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
});

/**
 * GET /api/v1/invoices - Paginated list of invoices
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const allowed = await checkRateLimit(ip, 'standard');
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
      { status: 429 }
    );
  }

  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    // Enforce "facturacion:read" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'facturacion', 'read');

    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '20', 10);
    const excludeTypesParam = searchParams.get('excludeTypes');
    const excludeTypes = excludeTypesParam ? excludeTypesParam.split(',') : undefined;

    const status = searchParams.get('status') || undefined;
    const ncf = searchParams.get('ncf') || undefined;
    const ecfType = searchParams.get('ecfType') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const result = await InvoiceRepository.list(auth.companyId, page, perPage, {
      excludeTypes,
      status,
      ncf,
      ecfType,
      startDate,
      endDate,
    }, auth.modo);
    const stats = await InvoiceRepository.getStats(auth.companyId, auth.modo);

    return NextResponse.json(
      { success: true, data: result.data, meta: result.meta, stats },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/invoices:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}

/**
 * POST /api/v1/invoices - Create, sign, and issue an invoice
 */
export async function POST(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  // Rate limit billing creation requests
  const allowed = await checkRateLimit(auth.userId, 'dgii');
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas facturas emitidas en poco tiempo. Intente en un minuto.' } },
      { status: 429 }
    );
  }

  try {
    // Enforce "facturacion:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'facturacion', 'write');

    const body = await req.json();
    const result = createInvoiceSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    // Los almacenes llegan en el cuerpo de la peticion: el general de la
    // factura y, desde que la nota de credito arrastra el de cada linea de la
    // factura original, uno por linea. De ellos salen movimientos de
    // inventario y ninguna capa mas abajo comprueba de quien son (lo dice el
    // propio `addStock`). Se comprueba AQUI, antes de firmar y transmitir: mas
    // abajo el e-CF ya esta presentado a la DGII y un fallo no lo deshace.
    const almacenesPedidos = Array.from(new Set([
      result.data.warehouseId,
      ...result.data.lines
        .map((l) => l.warehouseId)
        .filter((w): w is string => !!w),
    ]));

    const almacenesValidos = new Set(
      (
        await db
          .select({ id: warehouses.id })
          .from(warehouses)
          .where(
            and(
              eq(warehouses.companyId, auth.companyId),
              isNull(warehouses.deletedAt),
              inArray(warehouses.id, almacenesPedidos)
            )
          )
      ).map((w) => w.id)
    );

    if (!almacenesValidos.has(result.data.warehouseId)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'El almacén seleccionado no existe o no pertenece a esta empresa.' } },
        { status: 400, headers: resHeaders }
      );
    }

    // Un almacen de linea que no sea de esta empresa -- o que ya se haya
    // eliminado, caso normal al hacer la nota de credito de una factura vieja
    // -- no bloquea el comprobante: se cae al almacen general de la factura,
    // que es exactamente lo que se hacia antes de leer el almacen por linea.
    const lineasSaneadas = result.data.lines.map((l) => ({
      ...l,
      warehouseId: l.warehouseId && almacenesValidos.has(l.warehouseId) ? l.warehouseId : undefined,
    }));

    // ISO-04 · ningun id de otra empresa entra en una factura
    //
    // La comprobacion de los almacenes, ahi arriba, cerraba UNO de los ocho ids
    // que acepta este cuerpo. Los otros siete entraban tal cual, y la base de
    // datos no los para: las claves ajenas de `invoice_lines`, `invoices` y
    // `quotes` apuntan al id y no miran la empresa. Se podia facturar el
    // producto de otra empresa, y de paso saltarse la validacion de precio
    // contra costo -- que desde el filtro por empresa ya no lo encuentra y por
    // tanto no valida nada.
    //
    // Va AQUI, antes de firmar y transmitir. Mas abajo el e-CF ya esta
    // presentado a la DGII y un fallo no lo deshace.
    //
    // Un id que no existe se trata igual que uno ajeno: en las dos situaciones
    // la respuesta correcta es la misma, y distinguirlas por el mensaje le
    // diria a quien sondea cuales existen en otras empresas.
    const idsAjenos = async (
      tabla: any,
      ids: (string | undefined)[],
      admiteGlobales = false
    ): Promise<string[]> => {
      const pedidos = Array.from(new Set(ids.filter((x): x is string => !!x)));
      if (pedidos.length === 0) return [];

      const filas = await db
        .select({ id: tabla.id, companyId: tabla.companyId })
        .from(tabla)
        .where(inArray(tabla.id, pedidos));

      const propios = new Set(
        filas
          .filter((f: any) => f.companyId === auth.companyId || (admiteGlobales && f.companyId === null))
          .map((f: any) => f.id)
      );

      return pedidos.filter((id) => !propios.has(id));
    };

    const pertenencia: [string, string[]][] = [
      ['El artículo', await idsAjenos(products, result.data.lines.map((l) => l.productId))],
      ['El cliente', await idsAjenos(customers, [result.data.customerId])],
      ['La cotización', await idsAjenos(quotes, [result.data.quoteId])],
      ['La factura que se modifica', await idsAjenos(invoices, [result.data.modifiedInvoiceId])],
      ['La sesión de caja', await idsAjenos(cashSessions, [result.data.cashSessionId])],
      // El catalogo de retenciones admite filas globales (company_id NULO), que
      // sirven a todas las empresas. Es el unico caso.
      ['La retención', await idsAjenos(retentions, (result.data.retentions || []).map((r) => r.retentionId), true)],
    ];

    const ajeno = pertenencia.find(([, ids]) => ids.length > 0);
    if (ajeno) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `${ajeno[0]} con id ${ajeno[1][0]} no existe en esta empresa.`,
          },
        },
        { status: 400, headers: resHeaders }
      );
    }

    // Check invoice limits from subscription (only count production invoices)
    const subscriptionInfo = await db
      .select({ maxEcfLimit: plans.maxEcfLimit })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(and(eq(subscriptions.companyId, auth.companyId), eq(subscriptions.status, 'active')))
      .limit(1);

    if (subscriptionInfo.length > 0) {
      const maxEcfLimit = subscriptionInfo[0].maxEcfLimit;
      if (maxEcfLimit !== -1) {
        // Count existing invoices for this month in this environment mode
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        
        const checkInvoices = await db
          .select({ value: count() })
          .from(invoices)
          .where(
            and(
              eq(invoices.companyId, auth.companyId),
              eq(invoices.modo, auth.modo),
              gte(invoices.createdAt, startOfMonth),
              lte(invoices.createdAt, endOfMonth)
            )
          );
          
        const currentCount = checkInvoices[0]?.value || 0;
        if (currentCount >= maxEcfLimit) {
          return NextResponse.json(
            { success: false, error: { code: 'FORBIDDEN', message: `Límite alcanzado: Tu plan actual solo permite emitir hasta ${maxEcfLimit} comprobante(s) por mes.` } }, 
            { status: 403, headers: resHeaders }
          );
        }
      }
    }

    // Auditoria P1-11: un reintento de red o doble clic en esta ruta
    // presenta el mismo comprobante dos veces a la DGII. Si el cliente
    // manda `Idempotency-Key`, un reintento con la misma clave devuelve
    // la respuesta ya guardada en vez de emitir de nuevo.
    const { status, body: respBody } = await withIdempotency(
      { companyId: auth.companyId, modo: auth.modo, route: 'POST /api/v1/invoices', idempotencyKey: req.headers.get('Idempotency-Key') },
      async () => {
        // Call service layer to perform all database transactions and PDF/XMLDSIG generation
        const { invoice, msellerResponse } = await InvoiceService.issueInvoice({
          companyId: auth.companyId,
          modo: auth.modo,
          userId: auth.userId,
          ...result.data,
          lines: lineasSaneadas,
        });
        return { status: 201, body: { success: true, data: invoice, msellerResponse } };
      }
    );

    return NextResponse.json(respBody, { status, headers: resHeaders });
  } catch (error: any) {
    console.error('Error in POST /api/v1/invoices:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
