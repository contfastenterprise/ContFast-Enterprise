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

        // Draw Landscape Header
        doc.moveTo(30, 25).lineTo(811, 25).strokeColor('#005E63').lineWidth(2).stroke();
        
        let textStartY = 35;
        if (logoBuffer) {
          try {
            doc.image(logoBuffer, 30, 35, { fit: [150, 40], valign: 'center' });
            textStartY = 80;
          } catch (e) {
            console.error('Failed to draw logo in landscape', e);
          }
        }

        doc.font('Courier').fontSize(8).fillColor('#333333');
        let yPos = textStartY;
        doc.text(this.formatLabel('Compañía', company.name, 10), 30, yPos);
        yPos += 10;
        doc.text(this.formatLabel('RNC', company.rnc || 'N/A', 10), 30, yPos);
        yPos += 10;
        doc.text(this.formatLabel('Fecha Gen', currentDateStr, 10), 30, yPos);

        doc.font('Courier-Bold').fontSize(14).fillColor('#005E63');
        doc.text('DESGLOSE DE PRODUCCIÓN DE VENTANAS', 400, 35, { width: 411, align: 'right' });
        doc.font('Courier').fontSize(9).fillColor('#333333');
        doc.text('Uso Interno Administrativo / Taller', 400, 52, { width: 411, align: 'right' });

        const dividerY = Math.max(yPos + 15, 110);
        doc.moveTo(30, dividerY).lineTo(811, dividerY).strokeColor('#005E63').lineWidth(1).stroke();
        
        let y = dividerY + 15;

        // Draw Table Header
        doc.moveTo(30, y).lineTo(811, y).strokeColor('#005E63').lineWidth(1).stroke();
        doc.font('Courier-Bold').fontSize(8).fillColor('#005E63');
        const colWidths = [25, 60, 30, 80, 35, 110, 110, 90, 90, 150];
        const colX = [30];
        for (let i = 0; i < colWidths.length - 1; i++) {
          colX.push(colX[i] + colWidths[i]);
        }
        
        const headers = ['#', 'Tipo', 'Cant', 'Medida Base', 'Vías', 'Afel/Cabezal', 'Llavin/Enganche', 'Rieles', 'Laterales', 'Vidrio (A x H)'];
        for (let i = 0; i < headers.length; i++) {
          doc.text(headers[i], colX[i] + 2, y + 4);
        }
        doc.moveTo(30, y + 15).lineTo(811, y + 15).strokeColor('#005E63').lineWidth(1).stroke();
        y += 20;

        // Rows
        doc.font('Courier').fontSize(8).fillColor('#333333');
        data.forEach((item, index) => {
          if (y > 450) {
            doc.addPage();
            y = 40;
            // Draw page marker
            doc.moveTo(30, y).lineTo(811, y).strokeColor('#005E63').lineWidth(1).stroke();
            for (let i = 0; i < headers.length; i++) {
              doc.text(headers[i], colX[i] + 2, y + 4);
            }
            doc.moveTo(30, y + 15).lineTo(811, y + 15).strokeColor('#005E63').lineWidth(1).stroke();
            y += 20;
          }

          doc.text((index + 1).toString(), colX[0] + 2, y);
          doc.text((item.tipo || '').substring(0, 8), colX[1] + 2, y);
          doc.text(item.cantidad.toString(), colX[2] + 2, y);
          doc.text(`${item.ancho} x ${item.altura}`, colX[3] + 2, y);
          doc.text(item.vias.toString(), colX[4] + 2, y);
          doc.text(item.cabezal || '-', colX[5] + 2, y);
          doc.text(item.llavin || '-', colX[6] + 2, y);
          doc.text(item.riel || '-', colX[7] + 2, y);
          doc.text(item.lateral || '-', colX[8] + 2, y);
          doc.text(item.vidrio || '-', colX[9] + 2, y);
          
          doc.moveTo(30, y + 10).lineTo(811, y + 10).strokeColor('#f0f0f0').lineWidth(0.5).stroke();
          y += 13;
        });

        // Draw signatures
        if (y > 460) {
          doc.addPage();
          y = 40;
        }
        y += 25;
        doc.moveTo(60, y).lineTo(250, y).strokeColor('#000000').lineWidth(1).stroke();
        doc.fillColor('#000000').font('Courier-Bold').fontSize(8).text('Encargado de Taller', 60, y + 6, { width: 190, align: 'center' });

        doc.moveTo(560, y).lineTo(750, y).strokeColor('#000000').lineWidth(1).stroke();
        doc.text('Control de Calidad', 560, y + 6, { width: 190, align: 'center' });

        doc.fillColor('#aaaaaa').fontSize(7).text('Nota: Verifique todas las medidas antes de realizar cortes. Generado por ContFast Enterprise.', 30, doc.page.height - 30, { align: 'center' });

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

          // Draw Top Accent
          doc.moveTo(30, 25).lineTo(pageWidth - 30, 25).strokeColor('#005E63').lineWidth(2).stroke();

          // Header
          let textStartY = 35;
          if (logoBuffer) {
            try {
              doc.image(logoBuffer, 30, 35, { fit: [140, 40], valign: 'center' });
              textStartY = 80;
            } catch (e) {
              console.error('Logo render fail in cutting report', e);
            }
          }

          doc.font('Courier').fontSize(8).fillColor('#333333');
          let yPos = textStartY;
          doc.text(this.formatLabel('Compañía', company.name, 10), 30, yPos);
          yPos += 10;
          doc.text(this.formatLabel('RNC', company.rnc || 'N/A', 10), 30, yPos);
          yPos += 10;
          doc.text(this.formatLabel('Plancha', `#${sheet.id} de ${sheets.length}`, 10), 30, yPos);

          doc.font('Courier-Bold').fontSize(14).fillColor('#005E63');
          doc.text('PATRÓN DE CORTE DE VIDRIO', pageWidth - 300, 35, { width: 270, align: 'right' });
          doc.font('Courier').fontSize(8).fillColor('#333333');
          doc.text(`Medidas Plancha: ${sheetWidth}" x ${sheetHeight}"`, pageWidth - 300, 52, { width: 270, align: 'right' });
          doc.text(`Aprovechamiento: ${(100 - sheet.wastePercent).toFixed(1)}%`, pageWidth - 300, 62, { width: 270, align: 'right' });

          const dividerY = Math.max(yPos + 15, 110);
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

          // Signatures at the bottom
          const signatureY = pageHeight - 60;
          doc.moveTo(50, signatureY).lineTo(200, signatureY).strokeColor('#000000').lineWidth(1).stroke();
          doc.fillColor('#000000').font('Courier-Bold').fontSize(8).text('Encargado de Taller', 50, signatureY + 5, { width: 150, align: 'center' });

          doc.moveTo(pageWidth - 200, signatureY).lineTo(pageWidth - 50, signatureY).strokeColor('#000000').lineWidth(1).stroke();
          doc.text('Control de Calidad', pageWidth - 200, signatureY + 5, { width: 150, align: 'center' });
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
}

