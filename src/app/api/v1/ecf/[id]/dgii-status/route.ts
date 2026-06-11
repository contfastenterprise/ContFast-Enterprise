import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { db, dgiiSubmissions, companySettings, companies } from '@/db';
import { MSellerClient } from '@/services/dgii/msellerClient';
import { decrypt } from '@/utils/encryption';
import { eq, and, isNull } from 'drizzle-orm';

function resolveEntorno(dgiiEnv: string | null): string {
  if (!dgiiEnv) return 'TesteCF';
  if (dgiiEnv === 'production') return 'eCF';
  if (dgiiEnv === 'cert') return 'CerteCF';
  return 'TesteCF';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'read');

    const invoice = await InvoiceRepository.getById(id, auth.companyId);

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
    const msellerPassword = msellerPasswordEncrypted ? decrypt(msellerPasswordEncrypted) : process.env.MSELLER_PASSWORD;
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
      if (dgiiStatus.includes('acept') || dgiiStatus === 'accepted') {
        newStatus = 'accepted';
      } else if (dgiiStatus.includes('rechaz') || dgiiStatus === 'rejected') {
        newStatus = 'rejected';
      }

      // Update invoice if status changed
      if (newStatus !== invoice.status) {
        await InvoiceRepository.updateStatus(invoice.id, auth.companyId, newStatus);

        // Update latest dgii_submission
        await db
          .update(dgiiSubmissions)
          .set({
            status: newStatus as any,
            responseMessage: statusResult.message,
            responsePayload: JSON.stringify(statusResult.rawResponse),
            updatedAt: new Date(),
          })
          .where(and(
            eq(dgiiSubmissions.invoiceId, id),
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
