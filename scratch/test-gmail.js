const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// Simple manual .env parser
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    });
  }
}

loadEnv();

async function run() {
  console.log('--- STARTING GMAIL SMTP DELIVERY TEST ---');
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'no-reply@contfast.com';

  console.log('Config:', { host, port, user, pass: pass ? '***' : 'missing', from });

  if (!host || !user || !pass) {
    console.error('SMTP credentials missing in .env!');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const emailData = {
    from,
    to: 'latindoors@gmail.com', // Real client email to verify arbitrary domain delivery
    subject: `Test Factura ContFast (Gmail SMTP) - ${new Date().toLocaleTimeString()}`,
    text: 'Estimado cliente,\n\nLe confirmamos la recepción y el envío de su factura de prueba a través de nuestro nuevo canal de Gmail SMTP.\n\nAtentamente,\nContFast ERP',
    html: '<p>Estimado cliente,</p><p>Le confirmamos la recepción y el envío de su factura de prueba a través de nuestro nuevo canal de <strong>Gmail SMTP</strong>.</p><p>Atentamente,<br/><strong>ContFast ERP</strong></p>'
  };

  try {
    console.log(`Sending test email to: ${emailData.to}...`);
    const info = await transporter.sendMail(emailData);
    console.log('Email sent successfully!');
    console.log('Response Details:', info.response);
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('Failed to send email:', error);
  }
}

run();
