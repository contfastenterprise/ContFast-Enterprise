import { Resend } from 'resend';
import { db } from '@/db';
import { documentEmailLogs } from '@/db/schema/documents';

const resend = new Resend(process.env.RESEND_API_KEY);

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

    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY no está configurada.');
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'ContFast Enterprise <no-reply@contfast.app>';

    // 1. Send the email using Resend
    let providerMessageId = '';
    let errorMessage = '';
    let status: 'sent' | 'failed' = 'failed';

    try {
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: [toEmail],
        subject: subject,
        html: htmlContent,
        attachments: [
          {
            filename: attachmentName,
            content: attachmentBuffer,
          },
        ],
      });

      if (error) {
        errorMessage = error.message || 'Error desconocido enviando correo con Resend.';
        status = 'failed';
        console.error('[EmailService] Failed to send email via Resend:', error);
      } else {
        providerMessageId = data?.id || '';
        status = 'sent';
      }
    } catch (e: any) {
      errorMessage = e.message || 'Excepción al intentar enviar el correo.';
      status = 'failed';
      console.error('[EmailService] Exception sending email:', e);
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
      // We don't necessarily throw here if the email sent successfully, but it's important to log.
    }

    if (status === 'failed') {
      throw new Error(`Error enviando documento: ${errorMessage}`);
    }
  }
}
