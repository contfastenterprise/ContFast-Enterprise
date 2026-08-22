import { db } from '@/db';
import { documentShares } from '@/db/schema/documents';
import { eq, and } from 'drizzle-orm';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { EmailService } from './emailService';
import crypto from 'crypto';
import * as React from 'react';
import { StorageService } from '@/services/storageService';

export interface BaseDocumentData {
  company: {
    id: string;
    name: string;
    rnc?: string;
    logoUrl?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  modo?: 'PRODUCCION' | 'PRUEBA';
  [key: string]: any;
}

export class DocumentService {
  /**
   * Generates a PDF buffer from a React Component Template
   */
  static async generateDocumentPdf(
    TemplateComponent: React.FC<any>,
    data: BaseDocumentData
  ): Promise<Buffer> {
    const { renderToStaticMarkup } = await import('react-dom/server');
    // @ts-ignore
    const htmlString = renderToStaticMarkup(React.createElement(TemplateComponent, { data, mode: 'pdf' }));
    
    // 2. Wrap in a basic HTML doc structure if the template doesn't provide it
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 0; padding: 0; color: #333; }
            * { box-sizing: border-box; }
            /* Tailwind reset basics */
            table { border-collapse: collapse; width: 100%; }
          </style>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-white">
          ${htmlString}
        </body>
      </html>
    `;

    // 3. Generate PDF using existing Puppeteer integration
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(fullHtml, 'carta', false);
    return pdfBuffer;
  }

  /**
   * Generates the HTML string suitable for Emails or Web Viewing
   */
  static async generateDocumentHtml(
    TemplateComponent: React.FC<any>,
    data: BaseDocumentData,
    mode: 'web' | 'email' = 'web'
  ): Promise<string> {
    const { renderToStaticMarkup } = await import('react-dom/server');
    // @ts-ignore
    const htmlString = renderToStaticMarkup(React.createElement(TemplateComponent, { data, mode }));
    
    if (mode === 'email') {
       return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px; color: #333; }
              .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
              * { box-sizing: border-box; }
            </style>
            <script src="https://cdn.tailwindcss.com"></script>
          </head>
          <body>
            <div class="container">
              ${htmlString}
            </div>
          </body>
        </html>
      `;
    }

    return htmlString; // For web viewing within Next.js
  }

  /**
   * Generates PDF and Uploads to Supabase Storage, returning the public URL or Path
   */
  static async getOrGenerateDocumentPdf(
    type: string,
    id: string,
    TemplateComponent: React.FC<any>,
    data: BaseDocumentData,
    forceRegenerate: boolean = false
  ): Promise<{ buffer: Buffer; path: string }> {
    const storagePath = `documents/${data.company.id}/${type}/${id}.pdf`;
    
    if (!forceRegenerate) {
      // Try to get from storage first
      try {
        const existingPdf = await StorageService.downloadFile('documents', storagePath);
        if (existingPdf) {
          // It exists, return it (downloadFile returns a Buffer directly)
          return { buffer: existingPdf, path: storagePath };
        }
      } catch (e) {
        // Not found or error, proceed to generate
        console.log(`[DocumentService] PDF not found in storage, generating new one for ${storagePath}`);
      }
    }

    // Generate new PDF
    const pdfBuffer = await this.generateDocumentPdf(TemplateComponent, data);

    // Save to storage
    try {
      // Using string content here as buffer since StorageService supports Buffer
      await StorageService.uploadFile('documents', storagePath, pdfBuffer, 'application/pdf');
    } catch (uploadError) {
      console.error('[DocumentService] Failed to save PDF to storage:', uploadError);
      // We continue even if storage fails, so the user gets the PDF
    }

    return { buffer: pdfBuffer, path: storagePath };
  }

  /**
   * Complete flow: Generate PDF, Generate Email HTML, Send via Resend
   */
  static async sendDocumentByEmail(
    type: string,
    id: string,
    TemplateComponent: React.FC<any>,
    data: BaseDocumentData,
    toEmail: string,
    subject: string,
    userId?: string
  ): Promise<void> {
    // 1. Get or Generate PDF
    const { buffer: pdfBuffer } = await this.getOrGenerateDocumentPdf(type, id, TemplateComponent, data);

    // 2. Generate Email HTML
    const emailHtml = await this.generateDocumentHtml(TemplateComponent, data, 'email');

    // 3. Send via EmailService
    const attachmentName = `${type.toUpperCase()}-${id.substring(0, 8)}.pdf`;
    
    await EmailService.sendDocumentEmail({
      companyId: data.company.id,
      documentId: id,
      documentType: type,
      toEmail,
      subject,
      htmlContent: emailHtml,
      attachmentName,
      attachmentBuffer: pdfBuffer,
      userId,
      modo: data.modo || 'PRODUCCION'
    });
  }

  /**
   * Generates a secure shareable token for public viewing
   */
  static async createShareToken(
    companyId: string,
    documentId: string,
    documentType: string,
    userId?: string,
    expiresInDays: number = 30
  ): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    await db.insert(documentShares).values({
      companyId,
      documentId,
      documentType,
      token,
      expiresAt,
      createdBy: userId || null,
      modo: 'PRODUCCION' // Or dynamically passed
    });

    return token;
  }

  /**
   * Validates a share token
   */
  static async verifyShareToken(token: string) {
    const shares = await db.select().from(documentShares).where(eq(documentShares.token, token)).limit(1);
    const share = shares[0];

    if (!share) {
      throw new Error('Token inválido o no encontrado.');
    }

    if (share.revokedAt) {
      throw new Error('El enlace ha sido revocado.');
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new Error('El enlace ha expirado.');
    }

    return share;
  }
}
