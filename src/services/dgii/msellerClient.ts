import { db, companies, companySettings } from '@/db';
import { eq } from 'drizzle-orm';
import { decrypt } from '@/utils/encryption';

export interface MSellerInvoicePayload {
  companyRnc: string;
  ncfType: string; // e.g. 31, 32
  buyerRnc?: string;
  buyerName?: string;
  currency: 'DOP' | 'USD';
  paymentMethod: number; // 1: Cash, 2: Transfer, etc.
  items: {
    quantity: number;
    description: string;
    unitPrice: number;
    discount: number;
    taxRate: number;
  }[];
}

export class MSellerClient {
  /**
   * Issues an invoice through the MSeller API.
   * MSeller will handle the XML signing and DGII submission.
   */
  static async issueInvoice(payload: MSellerInvoicePayload) {
    let baseUrl = 'https://api.mseller.app/v1';
    let apiKey: string | undefined = undefined;

    try {
      // 1. Query company by RNC
      const [company] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.rnc, payload.companyRnc))
        .limit(1);

      if (company) {
        // 2. Query settings
        const [settings] = await db
          .select({
            msellerUrl: companySettings.msellerUrl,
            msellerApiKeyEncrypted: companySettings.msellerApiKeyEncrypted,
          })
          .from(companySettings)
          .where(eq(companySettings.companyId, company.id))
          .limit(1);

        if (settings) {
          baseUrl = settings.msellerUrl;
          if (settings.msellerApiKeyEncrypted) {
            apiKey = decrypt(settings.msellerApiKeyEncrypted);
          }
        }
      }
    } catch (dbError) {
      console.warn('Failed to query company settings from database, falling back to environment variables:', dbError);
    }

    // Fallback to environment variables if not configured in DB
    const activeApiKey = apiKey || process.env.M_SELLER_API_KEY;
    const activeBaseUrl = baseUrl || process.env.M_SELLER_API_URL || 'https://api.mseller.app/v1';

    if (!activeApiKey) {
      console.warn('MSeller API key not configured. Using mock response for development.');
      return this.mockIssueResponse(payload);
    }

    try {
      const response = await fetch(`${activeBaseUrl}/invoices/issue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeApiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `MSeller API Error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('MSeller API Call Failed:', error);
      throw error;
    }
  }

  private static mockIssueResponse(payload: MSellerInvoicePayload) {
    // Generate a mock NCF for development purposes
    const ncf = `E${payload.ncfType}0000000${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    
    return {
      success: true,
      data: {
        ncf,
        trackId: `trk_${Date.now()}`,
        status: 'accepted',
        signedXmlBase64: Buffer.from('<xml>Mock Signed XML</xml>').toString('base64'),
        dgiiMessage: 'Aceptado (MOCK)'
      }
    };
  }
}
