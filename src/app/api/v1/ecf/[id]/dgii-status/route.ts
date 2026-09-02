import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { db, dgiiSubmissions, companySettings, companies, invoices } from '@/db';
import { MSellerClient } from '@/services/dgii/msellerClient';
import { decryptAsync } from '@/utils/encryption';
import { eq, and, isNull } from 'drizzle-orm';
import { envioVigente, datosFirmaDeEnvio } from '@/repositories/dgiiSubmissionRepository';
import { leerCodigoSeguridad } from '@/services/dgii/codigoSeguridad';

function resolveEntorno(dgiiEnv: string | null): string {
  if (!dgiiEnv) return 'TesteCF';
  if (dgiiEnv === 'production') return 'eCF';
  if (dgiiEnv === 'cert') return 'CerteCF';
  return 'TesteCF';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'facturacion', 'read');

    const invoice = await InvoiceRepository.getById(id, auth.companyId, auth.modo);

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Factura no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    if (!invoice.msellerTrackId && invoice.status === 'draft') {
      return NextResponse.json(
        {
          success: true,
          data: {
            invoiceId: id,
            ncf: invoice.ncf,
            status: invoice.status,
            dgiiStatus: null,
            message: 'Factura no enviada a la DGII aún.',
          },
        },
        { headers: resHeaders }
      );
    }

    // Load settings for mSeller credentials
    const [settings] = await db
      .select()
      .from(companySettings)
      .where(and(eq(companySettings.companyId, auth.companyId), isNull(companySettings.deletedAt)))
      .limit(1);

    const msellerEmail = settings?.msellerEmail || process.env.MSELLER_EMAIL;
    const msellerPasswordEncrypted = settings?.msellerPasswordEncrypted;
    const msellerPassword = msellerPasswordEncrypted ? await decryptAsync(msellerPasswordEncrypted) : process.env.MSELLER_PASSWORD;
    const msellerApiKeyEncrypted = settings?.msellerApiKeyEncrypted;

    if (!msellerEmail || !msellerPassword || !msellerApiKeyEncrypted) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_CONFIG',
            message: 'Credenciales mSeller no configuradas. Contacta al administrador.',
          },
        },
        { status: 500, headers: resHeaders }
      );
    }

    const entorno = resolveEntorno(settings?.dgiiEnv || null);
    const msellerUrl = settings?.msellerUrl || 'https://api.mseller.app/v1';
    
    // Convert /v1 to base URL if needed, MSellerClient uses baseUrl
    const baseUrl = msellerUrl.endsWith('/v1') ? msellerUrl.replace('/v1', '') : 'https://ecf.api.mseller.app';
    
    const client = new MSellerClient({
      baseUrl,
      entorno,
      email: msellerEmail,
      password: msellerPassword,
      apiKeyEncrypted: msellerApiKeyEncrypted,
    });

    // Query mSeller for document status
    const statusResult = await client.getDocumentStatus(invoice.ncf);

    // Map mSeller status to our internal status
    let newStatus = invoice.status;
    if (statusResult.success) {
      const dgiiStatus = (statusResult.dgiiStatus || statusResult.status || '').toLowerCase();
      if (
        dgiiStatus.includes('acept') || 
        dgiiStatus.includes('aprob') || 
        dgiiStatus === 'accepted' || 
        dgiiStatus === 'approved'
      ) {
        newStatus = 'accepted';
      } else if (dgiiStatus.includes('rechaz') || dgiiStatus === 'rejected') {
        newStatus = 'rejected';
      } else if (
        dgiiStatus.includes('envi') || 
        dgiiStatus.includes('recib') || 
        dgiiStatus === 'submitted' || 
        dgiiStatus === 'received'
      ) {
        newStatus = 'submitted';
      }

      // Always update invoice status and dgiiMessage on sync
      await db
        .update(invoices)
        .set({
          status: newStatus as any,
          dgiiMessage: statusResult.message || null,
          updatedAt: new Date()
        })
        .where(and(eq(invoices.id, invoice.id), eq(invoices.companyId, auth.companyId)));

      // ─── El envio que se actualiza ────────────────────────────────────
      //
      // ANTES esto era un UPDATE con
      //     WHERE invoice_id = ? AND company_id = ? AND modo = ?
      // sin decir QUE intento. Como se inserta una fila por intento, tocaba
      // todas a la vez. Es el mismo patron que la 0035 corrigio en los
      // trabajos de la cola y que aqui quedo sin corregir, y tenia DOS
      // consecuencias:
      //
      //   1. `response_payload` de la fila ACEPTADA -- la constancia de lo que
      //      contesto la DGII -- se machacaba con la respuesta de la CONSULTA
      //      DE ESTADO, que es otro endpoint y otra forma.
      //   2. Esa respuesta no lleva codigo de seguridad (no es su trabajo), asi
      //      que sincronizar BORRABA el codigo de la factura. Al reimprimirla
      //      se fabricaba uno con sha256, distinto del de mSeller. Ese es
      //      exactamente el sintoma que se reporto.
      //
      // Ahora: se actualiza UN envio, el vigente, y `response_payload` solo se
      // toca cuando no se pierde nada al hacerlo.
      const envio = await envioVigente(id, auth.companyId, auth.modo);

      if (!envio) {
        // No habia ningun envio registrado para esta factura.
        //
        // Pasaba con las facturas emitidas en estado 'submitted' o 'rejected',
        // que hasta ahora no dejaban fila (ver el comentario largo en
        // invoiceDbBooker). El UPDATE de antes tocaba cero filas EN SILENCIO,
        // mientras el UPDATE de `invoices` si ponia el estado nuevo: la factura
        // acababa diciendo 'accepted' sin una sola prueba de que se enviara.
        //
        // La consulta que se acaba de hacer SI es una respuesta de la DGII
        // sobre este comprobante, asi que se guarda como lo que es: la
        // constancia que faltaba.
        await db.insert(dgiiSubmissions).values({
          companyId: auth.companyId,
          invoiceId: id,
          modo: auth.modo,
          status: newStatus as any,
          responseMessage: statusResult.message,
          responsePayload: JSON.stringify(statusResult.rawResponse),
          securityCode: leerCodigoSeguridad(statusResult.rawResponse) || null,
          retryCount: 0,
        });
      } else {
        // Si la consulta trae codigo de seguridad, se aprovecha para rellenar
        // el de las facturas que lo perdieron. Si no trae, no se borra el que
        // haya: `undefined` deja la columna como esta.
        const codigoConsultado = leerCodigoSeguridad(statusResult.rawResponse);
        const yaTenia = datosFirmaDeEnvio(envio).codigo;

        await db
          .update(dgiiSubmissions)
          .set({
            status: newStatus as any,
            responseMessage: statusResult.message,
            // La respuesta del envio manda sobre la de una consulta de estado:
            // es la que lleva la firma. Solo se sustituye cuando la que hay no
            // aporta codigo de seguridad, o cuando la nueva tambien lo trae.
            responsePayload:
              !yaTenia || codigoConsultado
                ? JSON.stringify(statusResult.rawResponse)
                : undefined,
            securityCode: codigoConsultado || undefined,
            updatedAt: new Date(),
          })
          .where(and(
            eq(dgiiSubmissions.id, envio.id),
            eq(dgiiSubmissions.companyId, auth.companyId)
          ));
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          invoiceId: id,
          ncf: invoice.ncf,
          status: newStatus,
          dgiiStatus: statusResult.dgiiStatus || statusResult.status,
          message: statusResult.message,
          rawResponse: statusResult.rawResponse,
        },
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in GET /api/v1/ecf/[id]/dgii-status:', error);
    const status = error.status || 500;
    return NextResponse.json(
      { success: false, error: { code: error.code || 'SERVER_ERROR', message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
