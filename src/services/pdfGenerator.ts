import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

interface CompanyInfo {
  name: string;
  rnc: string;
  logoUrl?: string;
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
          const res = await fetch(logoUrl);
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

  private static drawHeader(
    doc: typeof PDFDocument, 
    company: CompanyInfo, 
    title: string, 
    subtitle: string, 
    currentDate: string,
    logoBuffer: Buffer | null
  ) {
    // Top Accent line
    doc.moveTo(50, 40).lineTo(545, 40).strokeColor('#005E63').lineWidth(2).stroke();

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
    const tel = isLatinDoors ? '1-829-214-4128' : '809-555-0199';
    const email = isLatinDoors ? 'latindoors@gmail.com' : 'info@contfast.com';
    const dir = isLatinDoors ? 'Hato del Yaque, Santiago R.D.' : 'Santo Domingo, R.D.';

    // If logo was drawn, let's keep details compact and clear
    doc.text(this.formatLabel('Compañía', company.name), 50, yPos);
    yPos += 12;
    doc.text(this.formatLabel('RNC', company.rnc), 50, yPos);
    yPos += 12;
    doc.text(this.formatLabel('Teléfono', tel), 50, yPos);
    yPos += 12;
    doc.text(this.formatLabel('Email', email), 50, yPos);
    yPos += 12;
    doc.text(this.formatLabel('Dirección', dir), 50, yPos);
    yPos += 12;
    doc.text(this.formatLabel('Fecha Gen', currentDate), 50, yPos);

    // 2. Title block on the right
    doc.font('Courier-Bold').fontSize(14).fillColor('#005E63');
    doc.text(title.toUpperCase(), 300, 55, { width: 245, align: 'right' });
    
    doc.font('Courier').fontSize(10).fillColor('#333333');
    doc.text(subtitle, 300, 75, { width: 245, align: 'right' });
    doc.text('REPORTE FINANCIERO', 300, 92, { width: 245, align: 'right' });

    // Section title divider (double line)
    const lineY = Math.max(yPos + 15, 130);
    doc.moveTo(50, lineY).lineTo(545, lineY).strokeColor('#005E63').lineWidth(1).stroke();
    doc.moveTo(50, lineY + 2).lineTo(545, lineY + 2).strokeColor('#005E63').lineWidth(1).stroke();
    
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

    // Approved By
    doc.moveTo(365, yLine).lineTo(515, yLine).strokeColor('#000000').lineWidth(1).stroke();
    doc.fillColor('#000000').font('Courier').fontSize(9).text('Revisado por', 365, yLine + 8, { width: 150, align: 'center' });

    // Footer message
    doc.fillColor('#aaaaaa').fontSize(7).text('Generado por ContFast ERP - Reportes de Contabilidad General', 50, pageHeight - 35, { align: 'center' });
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
}
