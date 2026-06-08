import puppeteer from 'puppeteer';
import QRCode from 'qrcode';

export class PdfGenerator {
  /**
   * Generates a base64 encoded QR code from a URL.
   */
  static async generateQrBase64(url: string): Promise<string> {
    try {
      return await QRCode.toDataURL(url, { margin: 1, width: 150 });
    } catch (err) {
      console.error('Error generating QR code:', err);
      return '';
    }
  }

  /**
   * Generates a PDF buffer from an HTML string using Puppeteer.
   * @param html The HTML content
   * @param layout The printer layout ('carta' | '80mm' | '58mm')
   */
  static async generatePdfFromHtml(html: string, layout: 'carta' | '80mm' | '58mm'): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' as any });

      let pdfOptions: import('puppeteer').PDFOptions = {};

      if (layout === 'carta') {
        pdfOptions = {
          format: 'Letter',
          margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
          printBackground: true,
          displayHeaderFooter: false,
        };
      } else if (layout === '80mm') {
        const height = await page.evaluate(() => document.documentElement.offsetHeight);
        pdfOptions = {
          width: '80mm',
          height: `${Math.max(height + 20, 100)}px`,
          margin: { top: '0', right: '2mm', bottom: '0', left: '2mm' },
          printBackground: true,
        };
      } else if (layout === '58mm') {
        const height = await page.evaluate(() => document.documentElement.offsetHeight);
        pdfOptions = {
          width: '58mm',
          height: `${Math.max(height + 20, 100)}px`,
          margin: { top: '0', right: '2mm', bottom: '0', left: '2mm' },
          printBackground: true,
        };
      }

      const pdfBuffer = await page.pdf(pdfOptions);
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}
