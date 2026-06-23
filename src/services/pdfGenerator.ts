import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { parseFraction } from '@/utils/calculos';
import { windowProfiles } from '@/utils/profilesRegistry';

interface CompanyInfo {
  name: string;
  rnc: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export class PdfGenerator {
  // Utility function to fetch/read company logo buffer
  private static async getLogoBuffer(logoUrl?: string): Promise<Buffer | null> {
    if (logoUrl) {
      try {
        if (logoUrl.startsWith('data:')) {
          const base64Data = logoUrl.split(',')[1];
          if (base64Data) {
            return Buffer.from(base64Data, 'base64');
          }
        } else {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);

          const res = await fetch(logoUrl, { signal: controller.signal });
          clearTimeout(timeoutId);

          const arrayBuffer = await res.arrayBuffer();
          return Buffer.from(arrayBuffer);
        }
      } catch (e) {
        console.error('Failed to load logo from URL', e);
      }
    }

    // Local fallback
    try {
      const localLogoPath = path.join(process.cwd(), 'public/contfast-logo.png');
      if (fs.existsSync(localLogoPath)) {
        return fs.readFileSync(localLogoPath);
      }
    } catch (e) {
      console.error('Failed to load local fallback logo', e);
    }

    return null;
  }

  static generateIncomeStatement(
    company: CompanyInfo,
    startDate: string,
    endDate: string,
    data: any
  ): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const logoBuffer = await this.getLogoBuffer(company.logoUrl);
        const currentDateStr = new Date().toLocaleDateString('es-DO');

        this.drawHeader(doc, company, 'Estado de Resultados (P&L)', `Desde: ${startDate} Hasta: ${endDate}`, currentDateStr, logoBuffer);

        let y = doc.y + 20;

        // Draw Table Header (NO color fills)
        y = this.drawTableHeader(doc, y, ['Código', 'Cuenta / Descripción', 'Monto']);

        // Draw Sections
        y = this.drawSection(doc, 'Ingresos', data.revenueAccounts, data.totalRevenue, y);
        y = this.drawSection(doc, 'Costos de Venta', data.costAccounts, data.totalCost, y);

        // Gross Profit (Utilidad Bruta)
        if (y > 700) {
          doc.addPage();
          y = 50;
        }

        doc.font('Courier-Bold').fontSize(10).fillColor('#000000');
        const grossProfitLabel = this.formatLineText('UTILIDAD BRUTA', 50);
        doc.text(grossProfitLabel, 50, y);
        doc.text(this.formatCurrency(data.grossProfit), 400, y, { width: 145, align: 'right' });
        y += 20;

        y = this.drawSection(doc, 'Gastos Operativos', data.expenseAccounts, data.totalExpense, y);

        // Net Income (Utilidad Neta)
        if (y > 680) {
          doc.addPage();
          y = 50;
        }

        // Draw double line before net income
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#005E63').lineWidth(1).stroke();
        doc.moveTo(50, y + 2).lineTo(545, y + 2).strokeColor('#005E63').lineWidth(1).stroke();
        y += 8;

        doc.font('Courier-Bold').fontSize(11).fillColor('#005E63');
        const netIncomeLabel = this.formatLineText('UTILIDAD NETA', 50);
        doc.text(netIncomeLabel, 50, y);
        doc.text(this.formatCurrency(data.netIncome), 400, y, { width: 145, align: 'right' });

        // Draw double line under net income
        y += 15;
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#005E63').lineWidth(1).stroke();
        doc.moveTo(50, y + 2).lineTo(545, y + 2).strokeColor('#005E63').lineWidth(1).stroke();

        this.drawFooter(doc);
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  static generateBalanceSheet(
    company: CompanyInfo,
    asOfDate: string,
    data: any
  ): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const logoBuffer = await this.getLogoBuffer(company.logoUrl);
        const currentDateStr = new Date().toLocaleDateString('es-DO');

        this.drawHeader(doc, company, 'Balance General', `Al: ${asOfDate}`, currentDateStr, logoBuffer);

        let y = doc.y + 20;

        // Draw Table Header (NO color fills)
        y = this.drawTableHeader(doc, y, ['Código', 'Cuenta / Descripción', 'Monto']);

        y = this.drawSection(doc, 'Activos', data.assetAccounts, data.totalAsset, y);
        y = this.drawSection(doc, 'Pasivos', data.liabilityAccounts, data.totalLiability, y);
        y = this.drawSection(doc, 'Capital', data.equityAccounts, data.totalEquity, y);

        // Total Liability + Equity (Total Pasivo y Capital)
        if (y > 680) {
          doc.addPage();
          y = 50;
        }

        // Double line before total
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#005E63').lineWidth(1).stroke();
        doc.moveTo(50, y + 2).lineTo(545, y + 2).strokeColor('#005E63').lineWidth(1).stroke();
        y += 8;

        doc.font('Courier-Bold').fontSize(11).fillColor('#005E63');
        const totalLELabel = this.formatLineText('TOTAL PASIVO Y CAPITAL', 50);
        doc.text(totalLELabel, 50, y);
        const totalLE = data.totalLiability + data.totalEquity;
        doc.text(this.formatCurrency(totalLE), 400, y, { width: 145, align: 'right' });

        // Double line after total
        y += 15;
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#005E63').lineWidth(1).stroke();
        doc.moveTo(50, y + 2).lineTo(545, y + 2).strokeColor('#005E63').lineWidth(1).stroke();

        this.drawFooter(doc);
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  static generateARStatement(
    company: CompanyInfo,
    customerInfo: { name: string, rnc: string, phone: string },
    asOfDate: string,
    data: any
  ): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const logoBuffer = await this.getLogoBuffer(company.logoUrl);
        const currentDateStr = new Date().toLocaleDateString('es-DO');

        this.drawHeader(doc, company, 'Estado de Cuentas', `Al: ${asOfDate}`, currentDateStr, logoBuffer);

        let y = doc.y + 10;

        // Draw Customer Info block
        doc.fillColor('#005E63').font('Courier-Bold').fontSize(10).text('DATOS DEL CLIENTE', 50, y);
        y += 15;
        doc.fillColor('#333333').font('Courier').fontSize(9);
        doc.text(this.formatLabel('Nombre', customerInfo.name), 50, y);
        y += 12;
        doc.text(this.formatLabel('RNC/Cédula', customerInfo.rnc || 'N/A'), 50, y);
        y += 12;
        doc.text(this.formatLabel('Teléfono', customerInfo.phone || 'N/A'), 50, y);
        y += 20;

        // Draw Table Header (custom headers for AR)
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#005E63').lineWidth(1).stroke();
        doc.font('Courier-Bold').fontSize(9).fillColor('#005E63');
        doc.text('Factura / NCF', 55, y + 5, { width: 150 });
        doc.text('Fecha', 210, y + 5, { width: 70 });
        doc.text('Vence', 285, y + 5, { width: 70 });
        doc.text('Original', 360, y + 5, { width: 80, align: 'right' });
        doc.text('Pendiente', 445, y + 5, { width: 95, align: 'right' });
        doc.moveTo(50, y + 16).lineTo(545, y + 16).strokeColor('#005E63').lineWidth(1).stroke();
        y += 25;

        // Draw Items
        doc.fillColor('#333333').font('Courier').fontSize(9);
        for (const item of data.openItems) {
          if (y > 740) {
            doc.addPage();
            y = 50;
            // Repeat Header
            doc.moveTo(50, y).lineTo(545, y).strokeColor('#005E63').lineWidth(1).stroke();
            doc.font('Courier-Bold').fontSize(9).fillColor('#005E63');
            doc.text('Factura / NCF', 55, y + 5, { width: 150 });
            doc.text('Fecha', 210, y + 5, { width: 70 });
            doc.text('Vence', 285, y + 5, { width: 70 });
            doc.text('Original', 360, y + 5, { width: 80, align: 'right' });
            doc.text('Pendiente', 445, y + 5, { width: 95, align: 'right' });
            doc.moveTo(50, y + 16).lineTo(545, y + 16).strokeColor('#005E63').lineWidth(1).stroke();
            y += 25;
            doc.fillColor('#333333').font('Courier').fontSize(9);
          }

          const invoiceLabel = `${item.invoiceNumber}${item.ncf ? ' / ' + item.ncf : ''}`;
          doc.text(invoiceLabel, 55, y, { width: 150 });
          doc.text(new Date(item.date).toLocaleDateString('es-DO'), 210, y, { width: 70 });
          doc.text(new Date(item.dueDate).toLocaleDateString('es-DO'), 285, y, { width: 70 });
          doc.text(this.formatCurrency(Number(item.amount)), 360, y, { width: 80, align: 'right' });
          doc.text(this.formatCurrency(Number(item.balance)), 445, y, { width: 95, align: 'right' });
          y += 14;
        }

        if (data.openItems.length === 0) {
          doc.font('Courier-Oblique').text('No hay facturas pendientes.', 55, y + 10);
          y += 30;
        }

        // Total
        if (y > 680) {
          doc.addPage();
          y = 50;
        }

        y += 10;
        doc.moveTo(350, y).lineTo(545, y).strokeColor('#005E63').lineWidth(1).stroke();
        doc.moveTo(350, y + 2).lineTo(545, y + 2).strokeColor('#005E63').lineWidth(1).stroke();
        y += 8;

        doc.font('Courier-Bold').fontSize(11).fillColor('#005E63');
        const totalLabel = this.formatLineText('TOTAL PENDIENTE', 35);
        doc.text(totalLabel, 50, y);
        doc.text(this.formatCurrency(data.totalPending), 400, y, { width: 140, align: 'right' });

        y += 15;
        doc.moveTo(350, y).lineTo(545, y).strokeColor('#005E63').lineWidth(1).stroke();
        doc.moveTo(350, y + 2).lineTo(545, y + 2).strokeColor('#005E63').lineWidth(1).stroke();

        this.drawFooter(doc);
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private static drawInvoiceStyleHeader(
    doc: typeof PDFDocument,
    company: CompanyInfo,
    title: string,
    subtitle: string,
    currentDate: string,
    logoBuffer: Buffer | null,
    reportType: string
  ) {
    const primaryColor = '#003366';
    const textColor = '#191C1D';
    const pageWidth = doc.page.width;

    // Top blue accent bar
    doc.fillColor(primaryColor).rect(0, 0, pageWidth, 15).fill();

    let yOffset = 36;
    if (logoBuffer) {
      try {
        // Specify only width to let PDFKit scale height proportionally, matching the invoice max-width: 220px layout
        doc.image(logoBuffer, 36, 30, { width: 220 });
        yOffset = 90;
      } catch (e) {
        doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(18).text(company.name.toUpperCase(), 36, yOffset);
        yOffset += 24;
      }
    } else {
      doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(18).text(company.name.toUpperCase(), 36, yOffset);
      yOffset += 24;
    }

    const isLatinDoors = company.name.toLowerCase().includes('doors') || company.rnc === '132796845';
    const tel = company.phone || (isLatinDoors ? '1-829-214-4128' : '809-555-0199');
    const email = company.email || (isLatinDoors ? 'latindoors@gmail.com' : 'info@contfast.com');
    const dir = company.address || (isLatinDoors ? 'Hato del Yaque, Santiago R.D.' : 'Santo Domingo, R.D.');

    const padDots = (label: string, length: number) => {
      const dotsNeeded = length - label.length;
      return label + '.'.repeat(Math.max(0, dotsNeeded)) + ':';
    };

    doc.fillColor('#333333')
      .font('Courier')
      .fontSize(9.5) // Reverted to 9.5
      .text(`${padDots('RNC', 12)} ${company.rnc || 'N/A'}`, 36, yOffset)
      .text(`${padDots('Teléfono', 12)} ${tel}`, 36, yOffset + 12) // Reverted spacing
      .text(`${padDots('Email', 12)} ${email}`, 36, yOffset + 24)
      .text(`${padDots('Dirección', 12)} ${dir}`, 36, yOffset + 36);

    // Meta Info (Right) - Clean text aligned to the right to match the Invoice layout
    const metaWidth = 350;
    const metaX = pageWidth - metaWidth - 36;

    doc.fillColor('#005E6A') // Teal color matching the invoice title style
      .font('Helvetica-Bold')
      .fontSize(14) // Reverted to 14
      .text(reportType, metaX, 30, { width: metaWidth, align: 'right' });

    doc.fillColor(textColor)
      .font('Helvetica-Bold')
      .fontSize(11) // Reverted to 11
      .text(title, metaX, 50, { width: metaWidth, align: 'right' });

    doc.font('Helvetica')
      .fontSize(10) // Reverted to 10
      .text(subtitle, metaX, 64, { width: metaWidth, align: 'right' })
      .text(`Fecha: ${currentDate}`, metaX, 78, { width: metaWidth, align: 'right' });

    doc.y = Math.max(yOffset + 55, 140);
  }

  private static drawHeader(
    doc: typeof PDFDocument,
    company: CompanyInfo,
    title: string,
    subtitle: string,
    currentDate: string,
    logoBuffer: Buffer | null,
    reportType: string = 'REPORTE FINANCIERO'
  ) {
    const margin = doc.page.margins?.left || 30;
    const rightEdge = doc.page.width - (doc.page.margins?.right || 30);

    // Top Accent line
    doc.moveTo(margin, 40).lineTo(rightEdge, 40).strokeColor('#005E63').lineWidth(2).stroke();

    let textStartY = 55;

    // Draw Logo if available
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 50, 50, { fit: [140, 45], valign: 'center' });
        // Push the company info text down below the logo
        textStartY = 105;
      } catch (e) {
        console.error('Failed to draw logo on PDF', e);
      }
    }

    // 1. Company info formatted with monospaced label layout
    doc.font('Courier').fontSize(9).fillColor('#333333');
    let yPos = textStartY;

    // Check if company is Latin Doors or use defaults
    const isLatinDoors = company.name.toLowerCase().includes('doors') || company.rnc === '132796845';
    const tel = company.phone || (isLatinDoors ? '1-829-214-4128' : '809-555-0199');
    const email = company.email || (isLatinDoors ? 'latindoors@gmail.com' : 'info@contfast.com');
    const dir = company.address || (isLatinDoors ? 'Hato del Yaque, Santiago R.D.' : 'Santo Domingo, R.D.');

    // If logo was drawn, let's keep details compact and clear
    doc.text(this.formatLabel('Compañía', company.name), margin, yPos);
    yPos += 12;
    doc.text(this.formatLabel('RNC', company.rnc || 'N/A'), margin, yPos);
    yPos += 12;
    doc.text(this.formatLabel('Teléfono', tel), margin, yPos);
    yPos += 12;
    doc.text(this.formatLabel('Email', email), margin, yPos);
    yPos += 12;
    doc.text(this.formatLabel('Dirección', dir), margin, yPos);
    yPos += 12;
    doc.text(this.formatLabel('Fecha Gen', currentDate), margin, yPos);

    // 2. Title block on the right
    const titleWidth = 300;
    const titleX = rightEdge - titleWidth;
    doc.font('Courier-Bold').fontSize(14).fillColor('#005E63');
    doc.text(title.toUpperCase(), titleX, 55, { width: titleWidth, align: 'right' });

    doc.font('Courier').fontSize(10).fillColor('#333333');
    doc.text(subtitle, titleX, 75, { width: titleWidth, align: 'right' });
    doc.text(reportType, titleX, 92, { width: titleWidth, align: 'right' });

    // Section title divider (double line)
    const lineY = Math.max(yPos + 15, 130);
    doc.moveTo(margin, lineY).lineTo(rightEdge, lineY).strokeColor('#005E63').lineWidth(1).stroke();
    doc.moveTo(margin, lineY + 2).lineTo(rightEdge, lineY + 2).strokeColor('#005E63').lineWidth(1).stroke();

    doc.y = lineY + 10;
  }

  private static drawTableHeader(doc: typeof PDFDocument, startY: number, headers: string[]): number {
    let y = startY;

    // Draw horizontal line above header
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#005E63').lineWidth(1).stroke();

    // Draw Text in dark teal Courier-Bold (No background rectangle fill)
    doc.font('Courier-Bold').fontSize(9).fillColor('#005E63');
    doc.text(headers[0], 55, y + 5, { width: 80 });
    doc.text(headers[1], 130, y + 5, { width: 270 });
    doc.text(headers[2], 400, y + 5, { width: 140, align: 'right' });

    // Draw horizontal line below header
    doc.moveTo(50, y + 16).lineTo(545, y + 16).strokeColor('#005E63').lineWidth(1).stroke();

    return y + 25;
  }

  private static drawSection(doc: typeof PDFDocument, title: string, accounts: any[], total: number, startY: number): number {
    let y = startY;

    if (y > 720) {
      doc.addPage();
      y = 50;
      y = this.drawTableHeader(doc, y, ['Código', 'Cuenta / Descripción', 'Monto']);
    }

    // Section Title
    doc.fillColor('#005E63').font('Courier-Bold').fontSize(10).text(title.toUpperCase(), 50, y);
    y += 15;

    // Items
    doc.fillColor('#333333').font('Courier').fontSize(9);
    for (const acc of accounts) {
      if (y > 740) {
        doc.addPage();
        y = 50;
        y = this.drawTableHeader(doc, y, ['Código', 'Cuenta / Descripción', 'Monto']);
        doc.fillColor('#005E63').font('Courier-Bold').fontSize(10).text(`${title.toUpperCase()} (CONT...)`, 50, y);
        y += 15;
        doc.fillColor('#333333').font('Courier').fontSize(9);
      }

      // Format code
      doc.text(acc.code, 55, y, { width: 70 });

      // Format account name and dot leaders
      const displayName = acc.name;
      const dotLine = this.formatLineText(displayName, 50); // 50 character field
      doc.text(dotLine, 130, y);

      // Amount
      doc.text(this.formatCurrency(acc.net), 400, y, { width: 145, align: 'right' });
      y += 14;
    }

    // Section Total Line
    doc.moveTo(400, y).lineTo(545, y).strokeColor('#cccccc').lineWidth(1).stroke();
    y += 4;

    doc.font('Courier-Bold').fillColor('#000000');
    const totalLabel = this.formatLineText(`Total ${title}`, 50);
    doc.text(totalLabel, 50, y);
    doc.text(this.formatCurrency(total), 400, y, { width: 145, align: 'right' });
    y += 22;

    return y;
  }

  private static drawFooter(doc: typeof PDFDocument) {
    const pageHeight = doc.page.height;
    const yLine = pageHeight - 80;

    // Prepared By
    doc.moveTo(80, yLine).lineTo(230, yLine).strokeColor('#000000').lineWidth(1).stroke();
    doc.fillColor('#000000').font('Courier').fontSize(9).text('Preparado por', 80, yLine + 8, { width: 150, align: 'center' });
  }

  static generateWindowBreakdown(company: CompanyInfo, data: any[]): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const logoBuffer = await this.getLogoBuffer(company.logoUrl);
        const currentDateStr = new Date().toLocaleDateString('es-DO');

        const padDots = (label: string, length: number) => {
          const dotsNeeded = length - label.length;
          return label + '.'.repeat(Math.max(0, dotsNeeded)) + ':';
        };

        this.drawInvoiceStyleHeader(doc, company, 'Desglose Ventanas', `Lote Interno`, currentDateStr, logoBuffer, 'PRODUCCIÓN Y CORTE');

        let y = doc.y;

        // Section Banner: DETALLES DE CORTE Y MATERIALES
        doc.moveTo(30, y).lineTo(811, y).strokeColor('#005E63').lineWidth(1).stroke();
        doc.font('Courier-Bold').fontSize(10).fillColor('#005E63').text('DETALLES DE CORTE Y MATERIALES', 30, y + 6, { align: 'center', width: 781 });
        doc.moveTo(30, y + 20).lineTo(811, y + 20).strokeColor('#005E63').lineWidth(1).stroke();

        y += 35;

        // Draw Table Header Helper
        const colWidths = [25, 60, 35, 95, 35, 110, 110, 90, 90, 131];
        const colX = [30];
        for (let i = 0; i < colWidths.length - 1; i++) {
          colX.push(colX[i] + colWidths[i]);
        }
        const headers = ['#', 'Tipo', 'Cant', 'Medida Base', 'Vías', 'Afel/Cabezal', 'Llavin/Enganche', 'Rieles', 'Laterales', 'Vidrio (A x H)'];

        const drawTableHeader = (currentY: number) => {
          doc.rect(30, currentY, 781, 22).fill('#005E63');
          doc.font('Courier-Bold').fontSize(9).fillColor('#ffffff');
          for (let i = 0; i < headers.length; i++) {
            const align = ['#', 'Tipo', 'Cant', 'Medida Base', 'Vías'].includes(headers[i]) ? 'center' : 'left';
            doc.text(headers[i], colX[i] + 2, currentY + 6, { width: colWidths[i] - 4, align });
          }
          doc.fillColor('#333333');
          return currentY + 22;
        };

        y = drawTableHeader(y);

        // Rows
        doc.font('Courier').fontSize(9).fillColor('#333333');
        data.forEach((item, index) => {
          if (y > 450) {
            doc.addPage();
            y = 40;
            y = drawTableHeader(y);
          }

          // Row background border
          doc.rect(30, y, 781, 18).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

          // Draw vertical lines
          colX.forEach(x => {
            doc.moveTo(x, y).lineTo(x, y + 18).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
          });

          // Text alignment inside columns
          doc.text((index + 1).toString(), colX[0], y + 4, { width: colWidths[0], align: 'center' });
          doc.text((item.tipo || '').substring(0, 8), colX[1], y + 4, { width: colWidths[1], align: 'center' });
          doc.text(item.cantidad.toString(), colX[2], y + 4, { width: colWidths[2], align: 'center' });
          doc.text(`${item.ancho} x ${item.altura}`, colX[3], y + 4, { width: colWidths[3], align: 'center' });
          doc.text(item.vias.toString(), colX[4], y + 4, { width: colWidths[4], align: 'center' });

          doc.text(item.cabezal || '-', colX[5] + 4, y + 4);
          doc.text(item.llavin || '-', colX[6] + 4, y + 4);
          doc.text(item.riel || '-', colX[7] + 4, y + 4);
          doc.text(item.lateral || '-', colX[8] + 4, y + 4);

          // Vidrio formatting using "*" instead of "x" or "/"
          let glassText = item.vidrio || '-';
          if (glassText.includes(' x ')) {
            glassText = glassText.replace(' x ', ' * ');
          }
          doc.text(glassText, colX[9] + 4, y + 4);

          y += 18;
        });

        if (y > 400) {
          doc.addPage();
          y = 40;
        }

        y += 15;
        doc.font('Courier-Bold').fontSize(11).fillColor('#005E63');
        doc.text('CANTIDAD DE HUECOS POR TIPO', 30, y, { align: 'center', width: 781 });
        y += 20;

        // Group by type and count
        const typeCounts: Record<string, number> = {};
        data.forEach(item => {
          const t = item.tipo || 'Desconocido';
          typeCounts[t] = (typeCounts[t] || 0) + (Number(item.cantidad) || 0);
        });

        doc.font('Courier').fontSize(10).fillColor('#333333');
        Object.entries(typeCounts).forEach(([t, count]) => {
          doc.text(`${padDots(t, 25)} ${count} piezas`, 300, y);
          y += 16.5;
        });

        if (y > 400) {
          doc.addPage();
          y = 40;
        }

        y += 25;
        doc.font('Courier-Bold').fontSize(11).fillColor('#005E63');
        doc.text('RESUMEN TOTAL DE MATERIALES POR SISTEMA', 30, y, { align: 'center', width: 781 });
        y += 20;

        const systems = ['Tradicional', 'P-65', 'P-92'];
        const systemsX = [60, 300, 540];
        const systemsW = 220;

        systems.forEach((sys, idx) => {
          const sysX = systemsX[idx];
          let sysY = y + 25;

          const sysItems = data.filter(item => item.tipo === sys);
          const totalUnits = sysItems.reduce((acc, item) => acc + (Number(item.cantidad) || 0), 0);

          // Header banner
          doc.rect(sysX, y, systemsW, 20).fill('#005E63');
          doc.font('Courier-Bold').fontSize(10).fillColor('#ffffff');
          doc.text(sys, sysX, y + 5, { width: systemsW, align: 'center' });

          doc.font('Courier').fontSize(9.5).fillColor('#333333');

          // Calculate materials lengths
          let cabezalPies = 0;
          let llavinPies = 0;
          let rielPies = 0;
          let lateralPies = 0;
          let ruedas = 0;
          let cierres = 0;
          let gomaPies = 0;

          sysItems.forEach(item => {
            const w = parseFraction(item.ancho) || 0;
            const h = parseFraction(item.altura) || 0;
            const qty = Number(item.cantidad) || 0;
            const vias = Number(item.vias) || 2;

            const profileSystem = windowProfiles[sys];
            if (profileSystem) {
              const cuts = profileSystem.calculate(w, h, 1, vias);
              const glassPerimeter = (cuts.vidrio.valueWidth + cuts.vidrio.valueHeight) * 2 * vias * qty;
              gomaPies += glassPerimeter / 12;
            }

            if (sys === 'Tradicional') {
              cabezalPies += (w - 0.25) * qty / 12;
              llavinPies += (h - 0.875) * 2 * qty / 12;
              rielPies += (w - 0.25) * qty / 12;
              lateralPies += (h - 0.5) * 2 * qty / 12;
              ruedas += 4 * qty;
              cierres += 1 * qty;
            } else if (sys === 'P-65') {
              cabezalPies += (w - 1.25) * 2 * qty / 12;
              llavinPies += (h - 2) * 2 * qty / 12;
              rielPies += (w - 1.5) * qty / 12;
              lateralPies += (h - 0.125) * 2 * qty / 12;
              ruedas += 4 * qty;
              cierres += 1 * qty;
            } else if (sys === 'P-92') {
              cabezalPies += (w - 0.875) * 2 * qty / 12;
              llavinPies += (h - 2.5) * 2 * qty / 12;
              rielPies += (w - 1.625) * qty / 12;
              lateralPies += (h - 0.125) * 2 * qty / 12;
              ruedas += 4 * qty;
              cierres += 1 * qty;
            }
          });

          const formatPies = (val: number) => val > 0 ? `${val.toFixed(2)} pies` : '0.00 pies';
          const formatPiesCU = (val: number) => val > 0 ? `${val.toFixed(2)} pies c/u` : '0.00 pies c/u';

          const cabLabel = sys === 'Tradicional' ? 'Cabezal/Afeizal:' : 'Cabezal:';
          const rielLabel = 'Rieles (2/4 vías):';
          const latLabel = 'Laterales (2/4 vías):';

          doc.text(`${padDots(cabLabel, 18)} ${sys === 'Tradicional' ? formatPiesCU(cabezalPies) : formatPies(cabezalPies)}`, sysX + 5, sysY);
          sysY += 14;
          doc.text(`${padDots('Lavín/Enganche:', 18)} ${formatPiesCU(llavinPies)}`, sysX + 5, sysY);
          sysY += 14;
          doc.text(`${padDots(rielLabel, 18)} ${formatPiesCU(rielPies)}`, sysX + 5, sysY);
          sysY += 14;
          doc.text(`${padDots(latLabel, 18)} ${formatPies(lateralPies)}`, sysX + 5, sysY);
          sysY += 14;
          doc.text(`${padDots('Ruedas:', 18)} ${ruedas} unidades`, sysX + 5, sysY);
          sysY += 14;
          doc.text(`${padDots('Cierre de Centro:', 18)} ${cierres} unidades`, sysX + 5, sysY);
          sysY += 14;
          doc.text(`${padDots('Goma:', 18)} ${formatPies(gomaPies)}`, sysX + 5, sysY);
          sysY += 16.5;
          doc.font('Courier-Bold').fontSize(10).text(`Total unidades: ${totalUnits}`, sysX + 5, sysY);
        });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  static generateGlassCutting(company: CompanyInfo, sheets: any[], sheetWidth: number, sheetHeight: number): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: sheetHeight > sheetWidth ? 'portrait' : 'landscape' });
        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const logoBuffer = await this.getLogoBuffer(company.logoUrl);
        const currentDateStr = new Date().toLocaleDateString('es-DO');

        for (let sIdx = 0; sIdx < sheets.length; sIdx++) {
          const sheet = sheets[sIdx];
          if (sIdx > 0) doc.addPage();

          const pageWidth = doc.page.width;
          const pageHeight = doc.page.height;

          this.drawInvoiceStyleHeader(doc, company, 'Patrón de Vidrio', `Plancha #${sheet.id} de ${sheets.length}`, currentDateStr, logoBuffer, 'CORTE OPTIMIZADO');

          let y = doc.y;

          doc.font('Courier-Bold').fontSize(10).fillColor('#005E63');
          doc.text(`Medidas Plancha: ${sheetWidth}" x ${sheetHeight}"  |  Aprovechamiento: ${(100 - sheet.wastePercent).toFixed(1)}%`, 30, y, { align: 'center', width: pageWidth - 60 });
          y += 20;

          const dividerY = y;
          doc.moveTo(30, dividerY).lineTo(pageWidth - 30, dividerY).strokeColor('#005E63').lineWidth(1).stroke();

          // Title for Pattern
          doc.font('Courier-Bold').fontSize(10).fillColor('#005E63');
          doc.text(`DIAGRAMA DE CORTE - PLANCHA #${sheet.id}`, 30, dividerY + 10, { align: 'center', width: pageWidth - 60 });

          // Draw diagram area
          const topSpace = dividerY + 25;
          const bottomSafeSpace = 80;
          const drawAreaWidth = pageWidth - 60;
          const drawAreaHeight = pageHeight - topSpace - bottomSafeSpace;

          const scaleX = drawAreaWidth / sheetWidth;
          const scaleY = drawAreaHeight / sheetHeight;
          const scale = Math.min(scaleX, scaleY);

          const canvasW = sheetWidth * scale;
          const canvasH = sheetHeight * scale;

          const offsetX = 30 + (drawAreaWidth - canvasW) / 2;
          const offsetY = topSpace + (drawAreaHeight - canvasH) / 2;

          // Draw Plate background
          doc.rect(offsetX, offsetY, canvasW, canvasH).fillColor('#f8f9fa').strokeColor('#005E63').lineWidth(1).fillAndStroke();

          // Grid Lines
          doc.strokeColor('#e5e7eb').lineWidth(0.5);
          for (let i = 12; i < sheetWidth; i += 12) {
            doc.moveTo(offsetX + i * scale, offsetY).lineTo(offsetX + i * scale, offsetY + canvasH).stroke();
          }
          for (let j = 12; j < sheetHeight; j += 12) {
            doc.moveTo(offsetX, offsetY + j * scale).lineTo(offsetX + canvasW, offsetY + j * scale).stroke();
          }

          // Placed pieces
          sheet.placed.forEach((p: any) => {
            const px = offsetX + (p.x * scale);
            const py = offsetY + (p.y * scale);
            const pw = (p.rotated ? p.height : p.width) * scale;
            const ph = (p.rotated ? p.width : p.height) * scale;

            doc.rect(px, py, pw, ph).fillColor('#ffffff').strokeColor('#374151').lineWidth(0.8).fillAndStroke();

            let titleSize = 7;
            if (pw < 35 || ph < 15) titleSize = 5;
            if (pw < 15 || ph < 8) titleSize = 0;

            if (titleSize > 0) {
              doc.fillColor('#000000').font('Courier-Bold').fontSize(titleSize);
              doc.text(p.label, px + 2, py + (ph / 2) - 4, { width: pw - 4, align: 'center' });
              if (ph > 12) {
                doc.font('Courier').fontSize(titleSize - 1);
                doc.text(`${p.width}"x${p.height}"`, px + 2, py + (ph / 2) + 3, { width: pw - 4, align: 'center' });
              }
            }
          });

          // Markers
          doc.fillColor('#888888').font('Courier').fontSize(7);
          doc.text(`${sheetWidth}" ANCHO`, offsetX, offsetY - 10, { width: canvasW, align: 'center' });

          doc.save();
          doc.translate(offsetX - 10, offsetY + canvasH / 2);
          doc.rotate(-90);
          doc.text(`${sheetHeight}" ALTO`, -canvasH / 2, -3, { width: canvasH, align: 'center' });
          doc.restore();

        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  // Helpers to align text and labels matching Factura_FAC-00000138.pdf
  private static formatLabel(label: string, value: string, length = 12): string {
    const dots = '.'.repeat(Math.max(0, length - label.length));
    return `${label}${dots}: ${value}`;
  }

  private static formatLineText(text: string, length = 50): string {
    const cleanText = text.length > length ? text.substring(0, length - 3) + '...' : text;
    const dots = '.'.repeat(Math.max(0, length - cleanText.length));
    return `${cleanText} ${dots}`;
  }

  private static formatCurrency(val: number): string {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  }

  static generatePayrollReceipts(
    company: CompanyInfo,
    payroll: { periodStart: string; periodEnd: string; paymentDate: string },
    details: any[]
  ): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const logoBuffer = await this.getLogoBuffer(company.logoUrl);

        details.forEach((detail, index) => {
          if (index > 0) doc.addPage();

          // Title & Header Block
          doc.font('Helvetica-Bold').fontSize(14).fillColor('#005E6A').text(company?.name || 'Latin Doors SRL', { align: 'center' });
          doc.font('Helvetica').fontSize(10).fillColor('#555555').text(`RNC: ${company?.rnc || 'N/A'}`, { align: 'center' });
          if (company?.address) {
            doc.text(company.address, { align: 'center' });
          }
          doc.moveDown(0.5);
          
          doc.strokeColor('#cccccc').lineWidth(1).moveTo(40, doc.y).lineTo(570, doc.y).stroke();
          doc.moveDown(0.8);

          // Receipt Subtitle
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#333333').text('VOLANTE DE PAGO DE NÓMINA', { align: 'center' });
          doc.font('Helvetica').fontSize(9).text(`Período: Desde ${new Date(payroll.periodStart).toLocaleDateString('es-DO')} Hasta ${new Date(payroll.periodEnd).toLocaleDateString('es-DO')}`, { align: 'center' });
          doc.text(`Fecha de Pago: ${new Date(payroll.paymentDate).toLocaleDateString('es-DO')}`, { align: 'center' });
          doc.moveDown(1);

          // Employee Information Block (Two Columns)
          const topY = doc.y;
          doc.font('Helvetica-Bold').text('INFORMACIÓN DEL EMPLEADO', 40, topY);
          doc.font('Helvetica').fontSize(9);
          doc.text(`Código: ${detail.employeeCode}`, 40, topY + 15);
          doc.text(`Nombre: ${detail.firstName} ${detail.lastName}`, 40, topY + 30);
          doc.text(`Cédula: ${detail.cedula}`, 40, topY + 45);

          doc.font('Helvetica-Bold').text('INFORMACIÓN LABORAL', 320, topY);
          doc.font('Helvetica').fontSize(9);
          doc.text(`Cargo / Puesto: ${detail.positionName || 'Personal Administrativo'}`, 320, topY + 15);
          doc.text(`Salario Base: RD$ ${Number(detail.baseSalary).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 320, topY + 30);
          doc.moveDown(2);

          doc.strokeColor('#cccccc').lineWidth(0.5).moveTo(40, doc.y).lineTo(570, doc.y).stroke();
          doc.moveDown(1);

          // Details Table Layout: Incomes vs Deductions
          const tableY = doc.y;
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#005E6A').text('INGRESOS (INCOMES)', 40, tableY);
          doc.font('Helvetica-Bold').fillColor('#b91c1c').text('DESCUENTOS (DEDUCTIONS)', 320, tableY);
          doc.moveDown(0.5);

          // Entries row-by-row
          doc.font('Helvetica').fontSize(9).fillColor('#333333');
          let currentY = doc.y;

          // Incomes list
          doc.text('Salario Base ordinario', 40, currentY);
          doc.text(`RD$ ${Number(detail.baseSalary).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 200, currentY, { align: 'right', width: 90 });
          currentY += 15;

          if (parseFloat(detail.overtimeAmount) > 0) {
            doc.text('Horas Extras Trabajadas', 40, currentY);
            doc.text(`RD$ ${Number(detail.overtimeAmount).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 200, currentY, { align: 'right', width: 90 });
            currentY += 15;
          }
          if (parseFloat(detail.commissionAmount) > 0) {
            doc.text('Comisiones sobre Ventas', 40, currentY);
            doc.text(`RD$ ${Number(detail.commissionAmount).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 200, currentY, { align: 'right', width: 90 });
            currentY += 15;
          }
          if (parseFloat(detail.bonusAmount) > 0) {
            doc.text('Bonificaciones / Incentivos', 40, currentY);
            doc.text(`RD$ ${Number(detail.bonusAmount).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 200, currentY, { align: 'right', width: 90 });
            currentY += 15;
          }

          const totalIncomesY = currentY;

          // Deductions list
          currentY = tableY + 20;
          doc.text('Seguro AFP (Jubilación) - 2.87%', 320, currentY);
          doc.text(`RD$ ${Number(detail.afp).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 480, currentY, { align: 'right', width: 90 });
          currentY += 15;

          doc.text('Seguro SFS (Salud) - 3.04%', 320, currentY);
          doc.text(`RD$ ${Number(detail.sfs).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 480, currentY, { align: 'right', width: 90 });
          currentY += 15;

          if (parseFloat(detail.isr) > 0) {
            doc.text('Impuesto sobre la Renta (ISR)', 320, currentY);
            doc.text(`RD$ ${Number(detail.isr).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 480, currentY, { align: 'right', width: 90 });
            currentY += 15;
          }
          if (parseFloat(detail.otherDeductions) > 0) {
            doc.text('Otros Descuentos (Préstamos/Coop)', 320, currentY);
            doc.text(`RD$ ${Number(detail.otherDeductions).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 480, currentY, { align: 'right', width: 90 });
            currentY += 15;
          }

          const totalDeductionsY = currentY;

          // Bottom Totals Row
          const endY = Math.max(totalIncomesY, totalDeductionsY) + 20;
          doc.strokeColor('#dddddd').lineWidth(1).moveTo(40, endY).lineTo(570, endY).stroke();
          
          const summaryY = endY + 10;
          doc.font('Helvetica-Bold');
          doc.text('TOTAL INGRESOS', 40, summaryY);
          doc.text(`RD$ ${Number(detail.grossSalary).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 200, summaryY, { align: 'right', width: 90 });

          const totalDeductionsSum = parseFloat(detail.afp) + parseFloat(detail.sfs) + parseFloat(detail.isr) + parseFloat(detail.otherDeductions);
          doc.text('TOTAL DESCUENTOS', 320, summaryY);
          doc.text(`RD$ ${totalDeductionsSum.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 480, summaryY, { align: 'right', width: 90 });

          const netY = summaryY + 25;
          doc.rect(40, netY - 5, 530, 30).fillColor('#005E6A').fill();
          doc.fillColor('#ffffff').fontSize(11).text('NETO RECIBIDO (NET PAY):', 50, netY);
          doc.text(`RD$ ${Number(detail.netSalary).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 470, netY, { align: 'right', width: 90 });

          // Signatures
          const sigY = netY + 80;
          doc.fillColor('#333333').font('Helvetica').fontSize(9);
          doc.strokeColor('#999999').lineWidth(0.5).moveTo(80, sigY).lineTo(250, sigY).stroke();
          doc.text('Firma del Empleado', 80, sigY + 5, { width: 170, align: 'center' });

          doc.strokeColor('#999999').lineWidth(0.5).moveTo(360, sigY).lineTo(530, sigY).stroke();
          doc.text('Entregado por (Firma Autorizada)', 360, sigY + 5, { width: 170, align: 'center' });
        });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  static generateSettlementReceipt(
    company: CompanyInfo,
    employee: any,
    calculation: any,
    settlementDate: string,
    otrosAmount: number
  ): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const logoBuffer = await this.getLogoBuffer(company.logoUrl);

        // Title & Header Block
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#005E6A').text(company?.name || 'Latin Doors SRL', { align: 'center' });
        doc.font('Helvetica').fontSize(10).fillColor('#555555').text(`RNC: ${company?.rnc || 'N/A'}`, { align: 'center' });
        if (company?.address) {
          doc.text(company.address, { align: 'center' });
        }
        doc.moveDown(0.5);
        
        doc.strokeColor('#cccccc').lineWidth(1).moveTo(40, doc.y).lineTo(570, doc.y).stroke();
        doc.moveDown(0.8);

        // Subtitle
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#333333').text('RECIBO DESCARGO DE PRESTACIONES LABORALES', { align: 'center' });
        doc.font('Helvetica').fontSize(9).text(`Fecha de Liquidación: ${new Date(settlementDate).toLocaleDateString('es-DO')}`, { align: 'center' });
        doc.moveDown(1);

        // Employee Info
        const topY = doc.y;
        doc.font('Helvetica-Bold').text('DATOS DEL EMPLEADO', 40, topY);
        doc.font('Helvetica').fontSize(9);
        doc.text(`Código: ${employee.employeeCode}`, 40, topY + 15);
        doc.text(`Nombre: ${employee.firstName} ${employee.lastName}`, 40, topY + 30);
        doc.text(`Cédula: ${employee.cedula}`, 40, topY + 45);

        doc.font('Helvetica-Bold').text('DATOS LABORALES', 320, topY);
        doc.font('Helvetica').fontSize(9);
        doc.text(`Fecha Ingreso: ${new Date(employee.hireDate).toLocaleDateString('es-DO')}`, 320, topY + 15);
        doc.text(`Antigüedad: ${calculation.yearsOfService} años, ${calculation.monthsOfService} meses`, 320, topY + 30);
        doc.text(`Salario Promedio Diario: RD$ ${calculation.dailyRate.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`, 320, topY + 45);
        doc.moveDown(2);

        doc.strokeColor('#cccccc').lineWidth(0.5).moveTo(40, doc.y).lineTo(570, doc.y).stroke();
        doc.moveDown(1);

        // Table breakdown
        const tableY = doc.y;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#005E6A').text('CONCEPTO', 40, tableY);
        doc.text('CANTIDAD / DÍAS', 320, tableY);
        doc.text('IMPORTE', 480, tableY, { align: 'right', width: 90 });
        doc.moveDown(0.5);

        doc.font('Helvetica').fontSize(9).fillColor('#333333');
        let currentY = doc.y;

        const addRow = (concept: string, qty: string, amt: number) => {
          doc.text(concept, 40, currentY);
          doc.text(qty, 320, currentY);
          doc.text(`RD$ ${amt.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 480, currentY, { align: 'right', width: 90 });
          currentY += 20;
        };

        addRow(`Preaviso de Ley`, `${calculation.preavisoDays} días`, calculation.preaviso);
        addRow(`Cesantía de Ley`, `${calculation.cesantiaDays} días`, calculation.cesantia);
        addRow(`Vacaciones Pendientes`, `${calculation.vacacionesDays} días`, calculation.vacaciones);
        addRow(`Salario de Navidad Proporcional`, `1/12 parte`, calculation.navidad);
        if (otrosAmount !== 0) {
          addRow(`Otros Conceptos / Ajustes`, `Ajuste`, otrosAmount);
        }

        const totalNet = calculation.preaviso + calculation.cesantia + calculation.vacaciones + calculation.navidad + otrosAmount;

        doc.strokeColor('#dddddd').lineWidth(1).moveTo(40, currentY).lineTo(570, currentY).stroke();
        currentY += 10;

        doc.font('Helvetica-Bold').fontSize(11);
        doc.text('TOTAL NETO A RECIBIR:', 40, currentY);
        doc.text(`RD$ ${totalNet.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 480, currentY, { align: 'right', width: 90 });

        currentY += 40;
        doc.font('Helvetica').fontSize(8.5).fillColor('#555555');
        const descText = `Recibí a mi entera satisfacción de la empresa ${company.name || 'Latin Doors SRL'}, la suma descrita anteriormente por concepto de pago de mis prestaciones laborales y derechos adquiridos. Al firmar este documento, declaro que no me queda ninguna reclamación pendiente de realizar por salarios, horas extras, ni ningún otro concepto derivado del contrato de trabajo que nos unía, el cual queda formalmente terminado en la fecha señalada.`;
        doc.text(descText, 40, currentY, { width: 530, align: 'justify' });

        currentY += 70;
        doc.font('Helvetica').fontSize(9).fillColor('#333333');
        doc.strokeColor('#999999').lineWidth(0.5).moveTo(80, currentY).lineTo(250, currentY).stroke();
        doc.text('Firma del Empleado (Recibí conforme)', 80, currentY + 5, { width: 170, align: 'center' });

        doc.strokeColor('#999999').lineWidth(0.5).moveTo(360, currentY).lineTo(530, currentY).stroke();
        doc.text('Entregado por (Firma Autorizada)', 360, currentY + 5, { width: 170, align: 'center' });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

