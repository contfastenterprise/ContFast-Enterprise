import { db } from '@/db';
import { systemEmailLogs } from '@/db/schema/system';
import { getTransporter, getFromEmail } from '@/utils/mailer';

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

    const fromEmail = getFromEmail('ContFast Enterprise');

    // 1. Send the email using Nodemailer
    let providerMessageId = '';
    let errorMessage = '';
    let status: 'sent' | 'failed' = 'failed';

    try {
      const transporter = getTransporter();
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
      await db.insert(systemEmailLogs).values({
        companyId,
        context: documentType, // e.g. 'invoice', 'quote'
        referenceId: documentId,
        toEmail,
        subject,
        status,
        attachmentNames: [attachmentName],
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
