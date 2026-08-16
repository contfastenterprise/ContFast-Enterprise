import nodemailer from 'nodemailer';
import { db } from '@/db';
import { documentEmailLogs } from '@/db/schema/documents';

export interface SendDocumentEmailOptions {
  companyId: string;
  documentId: string;
  documentType: string;
  toEmail: string;
  subject: string;
  htmlContent: string;
  attachmentName: string;
  attachmentBuffer: Buffer;
  userId?: string;
  modo?: 'PRODUCCION' | 'PRUEBA';
}

export class EmailService {
  private static getTransporter() {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  static async sendDocumentEmail(options: SendDocumentEmailOptions): Promise<void> {
    const {
      companyId,
      documentId,
      documentType,
      toEmail,
      subject,
      htmlContent,
      attachmentName,
      attachmentBuffer,
      userId,
      modo = 'PRODUCCION',
    } = options;

    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'no-reply@contfast.app';

    // 1. Send the email using Nodemailer
    let providerMessageId = '';
    let errorMessage = '';
    let status: 'sent' | 'failed' = 'failed';

    try {
      const transporter = this.getTransporter();
      const info = await transporter.sendMail({
        from: fromEmail,
        to: toEmail,
        subject: subject,
        html: htmlContent,
        attachments: [
          {
            filename: attachmentName,
            content: attachmentBuffer,
          },
        ],
      });

      providerMessageId = info.messageId || '';
      status = 'sent';
    } catch (e: any) {
      errorMessage = e.message || 'Excepción al intentar enviar el correo por SMTP.';
      status = 'failed';
      console.error('[EmailService] Exception sending email via SMTP:', e);
    }

    // 2. Log in Database
    try {
      await db.insert(documentEmailLogs).values({
        companyId,
        documentId,
        documentType,
        toEmail,
        subject,
        status,
        attachmentName,
        errorMessage: errorMessage || null,
        providerMessageId: providerMessageId || null,
        userId: userId || null,
        modo,
        sentAt: status === 'sent' ? new Date() : null,
      });
    } catch (dbError) {
      console.error('[EmailService] Failed to log email to DB:', dbError);
    }

    if (status === 'failed') {
      throw new Error(`Error enviando documento: ${errorMessage}`);
    }
  }
}
