import nodemailer from 'nodemailer';

export const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('Configuración SMTP faltante en las variables de entorno.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465 || process.env.SMTP_SECURE === 'true',
    auth: {
      user,
      pass,
    },
  });
};

export const getFromEmail = (fallbackName?: string) => {
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@contfast.app';
  if (fallbackName && !fromEmail.includes('<')) {
    return `"${fallbackName}" <${fromEmail}>`;
  }
  return fromEmail;
};
