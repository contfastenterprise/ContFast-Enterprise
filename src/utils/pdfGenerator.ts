import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import QRCode from 'qrcode';

export interface PDFInvoiceItem {
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface PDFInvoiceData {
  companyName: string;
  companyRnc: string;
  companyAddress?: string;
  companyPhone?: string;
  companyLogoUrl?: string;
  ncf: string;
  ecfType: string;
  buyerName: string;
  buyerRnc?: string;
  buyerAddress?: string;
  invoiceDate: Date;
  dueDate?: Date;
  items: PDFInvoiceItem[];
  subtotal: number;
  discount: number;
  taxes: { name: string; amount: number }[];
  total: number;
  securityCode?: string; // e-CF security hash / barcode / QR content
}

/**
 * Generates a PDF invoice in Letter (Carta) or Thermal Ticket (80mm / 58mm) formats.
 * Returns a Buffer containing the PDF.
 */
export async function generateInvoicePdf(
  data: PDFInvoiceData,
  layout: 'carta' | '80mm' | '58mm' = 'carta'
): Promise<Buffer> {
  let qrBuffer: Buffer | null = null;
  if (data.securityCode) {
    try {
      const formattedDate = formatDate(data.invoiceDate).replace(/\//g, '-');
      const dgiiUrl = `https://ecf.dgii.gov.do/e-cf/Consulta?rncEmisor=${data.companyRnc}&rncComprador=${data.buyerRnc || ''}&eNCF=${data.ncf}&fechaFirma=${formattedDate}&montoTotal=${data.total.toFixed(2)}&codigoSeguridad=${data.securityCode}`;
      qrBuffer = await QRCode.toBuffer(dgiiUrl, { margin: 1, width: layout === 'carta' ? 100 : 70 });
    } catch (qrErr) {
      console.error('Error generating QR buffer in pdfGenerator:', qrErr);
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const chunks: Buffer[] = [];
      let doc: InstanceType<typeof PDFDocument>;

      if (layout === 'carta') {
        doc = new PDFDocument({ size: 'LETTER', margin: 36 });
      } else {
        // 80mm in points is ~226.7pt, 58mm in points is ~164.4pt
        const width = layout === '80mm' ? 226.7 : 164.4;
        // Estimate height based on items to avoid cutting off
        const estimatedHeight = 350 + data.items.length * 45 + data.taxes.length * 20;
        doc = new PDFDocument({
          size: [width, Math.max(500, estimatedHeight)],
          margin: 8
        });
      }

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Fetch logo buffer if url is provided
      const buildWithLogo = async () => {
        let logoBuffer: Buffer | null = null;
        if (data.companyLogoUrl) {
          try {
            if (data.companyLogoUrl.startsWith('data:')) {
              const base64Data = data.companyLogoUrl.split(',')[1];
              if (base64Data) {
                logoBuffer = Buffer.from(base64Data, 'base64');
              }
            } else {
              const res = await fetch(data.companyLogoUrl);
              const arrayBuffer = await res.arrayBuffer();
              logoBuffer = Buffer.from(arrayBuffer);
            }
          } catch (e) {
            console.error('Failed to load logo for PDF', e);
          }
        }

        if (layout === 'carta') {
          buildLetterLayout(doc, data, logoBuffer, qrBuffer);
        } else {
          buildTicketLayout(doc, data, layout === '80mm' ? 226.7 : 164.4, logoBuffer, qrBuffer, layout);
        }

        doc.end();
      };

      buildWithLogo().catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

function buildLetterLayout(
  doc: InstanceType<typeof PDFDocument>,
  data: PDFInvoiceData,
  logoBuffer: Buffer | null,
  qrBuffer: Buffer | null
) {
  const primaryColor = '#003366'; // Institutional Navy
  const secondaryColor = '#C5A059'; // Gold Accent
  const textColor = '#191C1D';
  const lightGrey = '#F3F4F5';

  // --- HEADER SECTION ---
  doc.fillColor(primaryColor).rect(0, 0, 612, 15).fill(); // Top blue accent bar

  // Company Information (Left)
  let yOffset = 36;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, 36, 30, { fit: [150, 40], valign: 'center' });
      yOffset = 80;
    } catch (e) {
      doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(16).text(data.companyName.toUpperCase(), 36, yOffset);
      yOffset += 20;
    }
  } else {
    doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(16).text(data.companyName.toUpperCase(), 36, yOffset);
    yOffset += 20;
  }

  doc.fillColor(textColor)
    .font('Helvetica')
    .fontSize(9)
    .text(`RNC: ${data.companyRnc}`, 36, yOffset)
    .text(data.companyAddress || '', 36, yOffset + 12)
    .text(data.companyPhone || '', 36, yOffset + 24);

  // Invoice Meta Info (Right)
  doc.rect(380, 30, 196, 75).fillColor(lightGrey).fill();
  doc.fillColor(primaryColor).rect(380, 30, 196, 20).fill();

  doc.fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('COMPROBANTE ELECTRÓNICO', 388, 36);

  doc.fillColor(textColor)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(`NCF: ${data.ncf}`, 388, 56)
    .font('Helvetica')
    .fontSize(9)
    .text(`Tipo e-CF: ${getEcfTypeName(data.ecfType)}`, 388, 72)
    .text(`Fecha: ${formatDate(data.invoiceDate)}`, 388, 86);

  // Horizontal Divider
  doc.moveTo(36, 120).lineTo(576, 120).strokeColor('#E1E3E4').lineWidth(1).stroke();

  // --- CLIENT & TRANSACTION DETAILS ---
  doc.fillColor(primaryColor)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('DETALLES DEL CLIENTE', 36, 135);

  doc.fillColor(textColor)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(data.buyerName, 36, 150)
    .font('Helvetica')
    .text(`RNC/Cédula: ${data.buyerRnc || 'Consumidor Final'}`, 36, 162)
    .text(data.buyerAddress || '', 36, 174);

  if (data.dueDate) {
    doc.fillColor(primaryColor)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('CONDICIÓN DE PAGO', 380, 135)
      .fillColor(textColor)
      .font('Helvetica')
      .text(`Vencimiento: ${formatDate(data.dueDate)}`, 380, 150);
  }

  // --- ITEMS TABLE ---
  const tableTop = 210;
  doc.fillColor(primaryColor).rect(36, tableTop, 540, 20).fill();

  // Table Headers
  doc.fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('Descripción', 42, tableTop + 6)
    .text('Cant.', 320, tableTop + 6, { width: 40, align: 'right' })
    .text('Precio U.', 380, tableTop + 6, { width: 60, align: 'right' })
    .text('Descto.', 450, tableTop + 6, { width: 50, align: 'right' })
    .text('Total', 510, tableTop + 6, { width: 60, align: 'right' });

  let currentY = tableTop + 20;

  // Table rows
  data.items.forEach((item, index) => {
    // Alternating rows background
    if (index % 2 === 1) {
      doc.fillColor('#F9FAFB').rect(36, currentY, 540, 20).fill();
    }

    doc.fillColor(textColor)
      .font('Helvetica')
      .fontSize(9)
      .text(item.name, 42, currentY + 6, { width: 260, height: 12, ellipsis: true })
      .text(item.quantity.toString(), 320, currentY + 6, { width: 40, align: 'right' })
      .text(formatCurrency(item.unitPrice), 380, currentY + 6, { width: 60, align: 'right' })
      .text(formatCurrency(item.discount), 450, currentY + 6, { width: 50, align: 'right' })
      .text(formatCurrency(item.total), 510, currentY + 6, { width: 60, align: 'right' });

    currentY += 20;
  });

  doc.moveTo(36, currentY).lineTo(576, currentY).strokeColor('#E1E3E4').lineWidth(1).stroke();

  // --- TOTALS & SUMMARY ---
  const totalsY = currentY + 15;

  // Left side: Security Code, Signature Date & QR
  if (data.securityCode) {
    doc.fillColor(textColor)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(`FIRMA DIGITAL VÁLIDA`, 36, totalsY)
      .font('Helvetica')
      .fontSize(7)
      .text(`Fecha Firma: ${data.invoiceDate.toLocaleString('es-DO')}`, 36, totalsY + 12)
      .text(`Código de Seguridad:`, 36, totalsY + 22)
      .font('Courier')
      .text(data.securityCode, 36, totalsY + 32, { width: 220 });

    if (qrBuffer) {
      doc.image(qrBuffer, 260, totalsY, { width: 80, height: 80 });
    }
  }

  // Right side: Totals
  const rightColX = 380;
  let summaryY = totalsY;

  doc.font('Helvetica')
    .fontSize(9)
    .text('Subtotal:', rightColX, summaryY)
    .text(formatCurrency(data.subtotal), 500, summaryY, { width: 70, align: 'right' });
  summaryY += 16;

  if (data.discount > 0) {
    doc.text('Descuentos:', rightColX, summaryY)
      .text(`-${formatCurrency(data.discount)}`, 500, summaryY, { width: 70, align: 'right' });
    summaryY += 16;
  }

  data.taxes.forEach((tax) => {
    doc.text(`${tax.name}:`, rightColX, summaryY)
      .text(formatCurrency(tax.amount), 500, summaryY, { width: 70, align: 'right' });
    summaryY += 16;
  });

  doc.moveTo(rightColX, summaryY).lineTo(576, summaryY).strokeColor('#E1E3E4').lineWidth(1).stroke();
  summaryY += 6;

  doc.font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(primaryColor)
    .text('TOTAL A PAGAR:', rightColX, summaryY)
    .text(formatCurrency(data.total), 500, summaryY, { width: 70, align: 'right' });
}

function buildTicketLayout(
  doc: InstanceType<typeof PDFDocument>,
  data: PDFInvoiceData,
  width: number,
  logoBuffer: Buffer | null,
  qrBuffer: Buffer | null,
  layout: '80mm' | '58mm'
) {
  const contentWidth = width - 16; // Margin is 8
  const textColor = '#000000';

  let currentY = 8;

  // --- COMPANY INFO ---
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, (width - 100) / 2, currentY, { fit: [100, 40], align: 'center' });
      currentY += 45;
    } catch (e) {
      doc.fillColor(textColor).font('Helvetica-Bold').fontSize(9).text(data.companyName.toUpperCase(), 8, currentY, { align: 'center', width: contentWidth });
      currentY += 12;
    }
  } else {
    doc.fillColor(textColor).font('Helvetica-Bold').fontSize(9).text(data.companyName.toUpperCase(), 8, currentY, { align: 'center', width: contentWidth });
    currentY += 12;
  }

  doc.font('Helvetica')
    .fontSize(8)
    .text(`RNC: ${data.companyRnc}`, 8, currentY, { align: 'center', width: contentWidth });
  currentY += 10;
  
  if (data.companyAddress) {
    doc.text(data.companyAddress, 8, currentY, { align: 'center', width: contentWidth });
    currentY += 10;
  }
  if (data.companyPhone) {
    doc.text(data.companyPhone, 8, currentY, { align: 'center', width: contentWidth });
  }

  doc.moveDown(0.5);
  doc.text('-------------------------------------------', { align: 'center' });

  // --- FISCAL INFRASTRUCTURE ---
  doc.font('Helvetica-Bold')
    .text('COMPROBANTE ELECTRÓNICO', { align: 'center' })
    .text(`NCF: ${data.ncf}`, { align: 'center' })
    .font('Helvetica')
    .text(`Tipo e-CF: ${getEcfTypeName(data.ecfType)}`, { align: 'center' })
    .text(`Fecha: ${formatDate(data.invoiceDate)}`, { align: 'center' });

  doc.text('-------------------------------------------', { align: 'center' });

  // --- CLIENT INFO ---
  doc.text(`Cliente: ${data.buyerName}`)
    .text(`RNC/Céd: ${data.buyerRnc || 'Consumidor Final'}`);

  doc.text('-------------------------------------------', { align: 'center' });

  // --- PRODUCTS ---
  doc.font('Helvetica-Bold')
    .text('DESCRIPCIÓN      CANT x PRECIO      TOTAL');

  doc.font('Helvetica');
  data.items.forEach((item) => {
    // Line 1: Item Name
    doc.text(item.name.substring(0, 28), { height: 10 });
    // Line 2: calculation details
    doc.text(
      `  ${item.quantity} x ${formatCurrency(item.unitPrice)} (Desc: ${formatCurrency(item.discount)})`,
      { height: 10 }
    );
    // Line 2 (right part): total
    doc.text(formatCurrency(item.total), { align: 'right', width: contentWidth - 10 });
  });

  doc.text('-------------------------------------------', { align: 'center' });

  // --- TOTALS ---
  const leftX = 8;
  const rightX = width - 8;

  doc.text('Subtotal:', leftX, doc.y)
    .text(formatCurrency(data.subtotal), { align: 'right', width: contentWidth });

  if (data.discount > 0) {
    doc.text('Descuentos:', leftX, doc.y)
      .text(`-${formatCurrency(data.discount)}`, { align: 'right', width: contentWidth });
  }

  data.taxes.forEach((tax) => {
    doc.text(`${tax.name}:`, leftX, doc.y)
      .text(formatCurrency(tax.amount), { align: 'right', width: contentWidth });
  });

  doc.moveDown(0.2);
  doc.font('Helvetica-Bold')
    .fontSize(9)
    .text('TOTAL:', leftX, doc.y)
    .text(formatCurrency(data.total), { align: 'right', width: contentWidth });

  doc.moveDown(0.5);
  if (data.securityCode) {
    doc.font('Helvetica-Bold')
      .fontSize(7)
      .text('FIRMA DIGITAL VÁLIDA', { align: 'center' })
      .font('Helvetica')
      .fontSize(6)
      .text(`Fecha Firma: ${data.invoiceDate.toLocaleString('es-DO')}`, { align: 'center' })
      .text(`Cód. Seguridad: ${data.securityCode}`, { align: 'center' });

    if (qrBuffer) {
      doc.moveDown(0.2);
      // Center the image in thermal ticket
      const qrWidth = layout === '80mm' ? 60 : 50;
      const pageX = (doc.page.width - qrWidth) / 2;
      doc.image(qrBuffer, pageX, doc.y, { width: qrWidth, height: qrWidth });
      doc.y += qrWidth; // advance Y position by image height
    }
  }
}

// Helpers
function getEcfTypeName(type: string): string {
  switch (type) {
    case '31':
      return 'Factura de Crédito Fiscal (e-31)';
    case '32':
      return 'Factura de Consumo (e-32)';
    case '33':
      return 'Nota de Débito (e-33)';
    case '34':
      return 'Nota de Crédito (e-34)';
    default:
      return `e-CF Tipo ${type}`;
  }
}

function formatCurrency(val: number): string {
  return `$${val.toFixed(2)}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('es-DO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}
