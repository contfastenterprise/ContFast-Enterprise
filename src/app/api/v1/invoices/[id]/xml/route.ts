import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { MSellerClient } from '@/services/dgii/msellerClient';
import { decryptAsync } from '@/utils/encryption';
import { db, companySettings, dgiiSubmissions } from '@/db';
import { eq } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
  try {
    const { id } = await params;
    const resHeaders = new Headers();

    const auth = await verifyAuth(req, resHeaders);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
        { status: 401 }
      );
    }

    try {
      await enforcePermission(auth.userId, auth.role, auth.roleId, 'facturacion', 'read');
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: err.message } },
        { status: 403, headers: resHeaders }
      );
    }

    const invoice = await InvoiceRepository.getById(id, auth.companyId);
    if (!invoice) {
      return new NextResponse('Factura no encontrada.', { status: 404 });
    }

    let xmlContent = '';
    let signedXmlPathFromMseller = invoice.msellerXmlPath || '';

    // 1. If not available in msellerXmlPath, try to extract it from the database submission responsePayload
    if (!signedXmlPathFromMseller) {
      try {
        const [submission] = await db
          .select()
          .from(dgiiSubmissions)
          .where(eq(dgiiSubmissions.invoiceId, id))
          .limit(1);

        if (submission && submission.responsePayload) {
          const raw = JSON.parse(submission.responsePayload);
          signedXmlPathFromMseller = raw.signedXml || raw.summarySignedXml || '';
        }
      } catch (dbErr) {
        console.warn('Could not extract signedXml path from database submission payload:', dbErr);
      }
    }

    // 2. Fetch credentials and query mSeller to resolve the path and download the XML
    try {
      const [settings] = await db
        .select()
        .from(companySettings)
        .where(eq(companySettings.companyId, invoice.companyId))
        .limit(1);

      const msellerEmail = settings?.msellerEmail || process.env.MSELLER_EMAIL;
      const msellerPasswordEncrypted = settings?.msellerPasswordEncrypted;
      const msellerPassword = msellerPasswordEncrypted 
        ? await decryptAsync(msellerPasswordEncrypted) 
        : process.env.MSELLER_PASSWORD;
      const msellerApiKeyEncrypted = settings?.msellerApiKeyEncrypted || process.env.MSELLER_API_KEY;

      if (msellerEmail && msellerPassword) {
        const resolveEntorno = (env: string | null): string => {
          if (!env) return 'TesteCF';
          if (env === 'production' || env === '1') return 'eCF';
          if (env === 'cert' || env === 'certification') return 'CerteCF';
          return 'TesteCF';
        };

        const systemEnv = settings?.dgiiEnv || process.env.MSELLER_ENTORNO || 'test';
        const entorno = resolveEntorno(systemEnv);
        const msellerUrl = settings?.msellerUrl || process.env.MSELLER_BASE_URL || 'https://ecf.api.mseller.app';
        const baseUrl = msellerUrl.endsWith('/v1') ? msellerUrl.replace('/v1', '') : msellerUrl;

        const msellerClient = new MSellerClient({
          baseUrl,
          entorno,
          email: msellerEmail as string,
          password: msellerPassword as string,
          apiKeyEncrypted: (msellerApiKeyEncrypted || '') as string,
        });

        // Query mSeller online status if still no path resolved
        if (!signedXmlPathFromMseller) {
          const statusRes = await msellerClient.getDocumentStatus(invoice.ncf);
          if (statusRes.success && statusRes.rawResponse) {
            const raw = statusRes.rawResponse;
            signedXmlPathFromMseller = raw.signedXml || raw.summarySignedXml || '';
          }
        }

        // Download the XML from mSeller using the resolved path
        if (signedXmlPathFromMseller) {
          xmlContent = await msellerClient.downloadXml(signedXmlPathFromMseller);

          // Update the DB path if it wasn't saved yet in the invoice record
          if (!invoice.msellerXmlPath) {
            await InvoiceRepository.updateStatus(invoice.id, invoice.companyId, invoice.status, {
              msellerXmlPath: signedXmlPathFromMseller
            });
          }
        }
      }
    } catch (err) {
      console.error('Failed to query or download XML from mSeller:', err);
    }

    // 3. Final fallback for legacy local files (if any exist on disk)
    if (!xmlContent && (invoice.signedXmlPath || invoice.xmlPath)) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const legacyPath = invoice.signedXmlPath || invoice.xmlPath || '';
        const resolvedLegacyPath = path.isAbsolute(legacyPath)
          ? legacyPath
          : path.join(process.cwd(), legacyPath);

        if (fs.existsSync(resolvedLegacyPath)) {
          xmlContent = fs.readFileSync(resolvedLegacyPath, 'utf8');
        }
      } catch (legacyErr) {
        console.warn('Failed to read legacy local XML file:', legacyErr);
      }
    }

    if (!xmlContent) {
      return new NextResponse(
        'No se pudo obtener el archivo XML. Se intentó buscar en la base de datos de envíos, descargar directamente desde los servidores de mSeller, y comprobar en almacenamiento local heredado, pero el documento no se encontró en ninguna de las opciones. Verifique que la factura esté debidamente autorizada por la DGII.',
        {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        }
      );
    }

    const headers = new Headers(resHeaders);
    headers.set('Content-Type', 'application/xml');
    headers.set('Content-Disposition', `inline; filename="${invoice.ncf || 'factura'}.xml"`);

    return new NextResponse(xmlContent, { headers });
  } catch (error: any) {
    console.error('Error in XML download stream:', error);
    return new NextResponse(`Error interno al descargar XML: ${error.message}`, { status: 500 });
  }
}
