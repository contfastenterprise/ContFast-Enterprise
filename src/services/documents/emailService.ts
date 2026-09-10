import { db } from '@/db';
import { systemEmailLogs } from '@/db/schema/system';
import { getTransporter, getFromEmail } from '@/utils/mailer';
import { Logger } from '@/utils/logger';
import { registrarFalloSilencioso } from '@/services/auditoria/rastroDeFallo';

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
  modo: 'PRODUCCION' | 'PRUEBA';
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
    } catch (e: unknown) {
      errorMessage = (e as Error).message || 'Excepción al intentar enviar el correo por SMTP.';
      status = 'failed';
      // Con contexto: sin saber a quien ni de que documento, el log no sirve
      // para atender el caso. (Este fallo SI se relanza mas abajo, asi que no
      // necesita traza durable: llega arriba.)
      Logger.error('[EmailService] fallo el envio por SMTP', {
        companyId, documentType, documentId, toEmail, motivo: errorMessage,
      });
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
      // `system_email_logs` es la PRUEBA de que el documento salio. Si la fila
      // no se escribe, el correo se mando y no queda constancia de ello en
      // ningun sitio -- y este catch no puede relanzar, porque el envio ya fue.
      // Asi que la constancia se deja en el otro sitio que hay para eso.
      await registrarFalloSilencioso({
        companyId,
        modo,
        userId,
        paso: 'registro_correo',
        entityType: 'system_email_logs',
        entityId: documentId,
        contexto: { documentType, toEmail, subject, estadoDelEnvio: status, providerMessageId: providerMessageId || null },
        err: dbError,
      });
    }

    if (status === 'failed') {
      throw new Error(`Error enviando documento: ${errorMessage}`);
    }
  }
}
