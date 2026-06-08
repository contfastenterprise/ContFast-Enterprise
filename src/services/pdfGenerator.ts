import PDFDocument from 'pdfkit';

interface CompanyInfo {
  name: string;
  rnc: string;
}

export class PdfGenerator {
  static generateIncomeStatement(
    company: CompanyInfo, 
    startDate: string, 
    endDate: string, 
    data: any
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      this.drawHeader(doc, company, 'Estado de Resultados (P&L)', `Desde: ${startDate} Hasta: ${endDate}`);

      let y = doc.y + 20;

      // Draw Sections
      y = this.drawSection(doc, 'Ingresos', data.revenueAccounts, data.totalRevenue, y);
      y = this.drawSection(doc, 'Costos de Venta', data.costAccounts, data.totalCost, y);
      
      // Gross Profit
      doc.font('Helvetica-Bold').fontSize(11).text('UTILIDAD BRUTA', 50, y);
      doc.text(this.formatCurrency(data.grossProfit), 400, y, { width: 100, align: 'right' });
      y += 25;

      y = this.drawSection(doc, 'Gastos Operativos', data.expenseAccounts, data.totalExpense, y);

      // Net Income
      doc.moveTo(50, y).lineTo(500, y).strokeColor('#003366').lineWidth(2).stroke();
      y += 10;
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#003366').text('UTILIDAD NETA', 50, y);
      doc.text(this.formatCurrency(data.netIncome), 400, y, { width: 100, align: 'right' });

      this.drawFooter(doc);

      doc.end();
    });
  }

  static generateBalanceSheet(
    company: CompanyInfo, 
    asOfDate: string, 
    data: any
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      this.drawHeader(doc, company, 'Balance General', `Al: ${asOfDate}`);

      let y = doc.y + 20;

      y = this.drawSection(doc, 'Activos', data.assetAccounts, data.totalAsset, y);
      y = this.drawSection(doc, 'Pasivos', data.liabilityAccounts, data.totalLiability, y);
      y = this.drawSection(doc, 'Capital', data.equityAccounts, data.totalEquity, y);

      // Total Liability + Equity
      doc.moveTo(50, y).lineTo(500, y).strokeColor('#003366').lineWidth(2).stroke();
      y += 10;
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#003366').text('TOTAL PASIVO Y CAPITAL', 50, y);
      const totalLE = data.totalLiability + data.totalEquity;
      doc.text(this.formatCurrency(totalLE), 400, y, { width: 100, align: 'right' });

      this.drawFooter(doc);

      doc.end();
    });
  }

  private static drawHeader(doc: typeof PDFDocument, company: CompanyInfo, title: string, subtitle: string) {
    // Logo block (simulated with text if no image)
    doc.fillColor('#003366').font('Helvetica-Bold').fontSize(20).text(company.name, 50, 50);
    doc.fillColor('#666666').font('Helvetica').fontSize(10).text(`RNC: ${company.rnc}`, 50, 75);
    
    // Title
    doc.fillColor('#C5A059').font('Helvetica-Bold').fontSize(16).text(title, 50, 100, { align: 'right' });
    doc.fillColor('#666666').font('Helvetica').fontSize(10).text(subtitle, 50, 120, { align: 'right' });

    // Header Line
    doc.moveTo(50, 140).lineTo(545, 140).strokeColor('#003366').lineWidth(2).stroke();
    doc.y = 150;
  }

  private static drawFooter(doc: typeof PDFDocument) {
    // We add the signature line at the bottom of the page
    const pageHeight = doc.page.height;
    const yLine = pageHeight - 120;

    // Line 1: Prepared By
    doc.moveTo(100, yLine).lineTo(250, yLine).strokeColor('#000000').lineWidth(1).stroke();
    doc.fillColor('#000000').font('Helvetica').fontSize(10).text('Preparado por', 100, yLine + 10, { width: 150, align: 'center' });

    // Line 2: Approved By
    doc.moveTo(350, yLine).lineTo(500, yLine).strokeColor('#000000').lineWidth(1).stroke();
    doc.fillColor('#000000').font('Helvetica').fontSize(10).text('Aprobado por', 350, yLine + 10, { width: 150, align: 'center' });

    // Bottom margin text
    doc.fillColor('#aaaaaa').fontSize(8).text('Generado por ContFast ERP', 50, pageHeight - 40, { align: 'center' });
  }

  private static drawSection(doc: typeof PDFDocument, title: string, accounts: any[], total: number, startY: number) {
    let y = startY;

    // Check pagination
    if (y > 650) {
      doc.addPage();
      y = 50;
    }

    // Section Title
    doc.fillColor('#C5A059').font('Helvetica-Bold').fontSize(12).text(title.toUpperCase(), 50, y);
    y += 15;

    // Items
    doc.fillColor('#333333').font('Helvetica').fontSize(10);
    for (const acc of accounts) {
      if (y > 680) {
        doc.addPage();
        y = 50;
      }
      doc.text(`${acc.code} - ${acc.name}`, 60, y);
      doc.text(this.formatCurrency(acc.net), 400, y, { width: 100, align: 'right' });
      y += 15;
    }

    // Section Total
    doc.moveTo(400, y).lineTo(500, y).strokeColor('#cccccc').lineWidth(1).stroke();
    y += 5;
    doc.font('Helvetica-Bold').text(`Total ${title}`, 200, y, { width: 190, align: 'right' });
    doc.text(this.formatCurrency(total), 400, y, { width: 100, align: 'right' });
    y += 25;

    return y;
  }

  private static formatCurrency(val: number) {
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val);
  }
}
