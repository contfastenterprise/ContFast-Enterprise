import type { Browser } from 'puppeteer';
import QRCode from 'qrcode';

export class PdfGenerator {
  private static browserInstance: Browser | null = null;

  /**
   * Gets or initializes the shared browser instance.
   */
  private static async getBrowser(): Promise<Browser> {
    if (this.browserInstance) {
      try {
        // Test connection to ensure the browser hasn't crashed or closed
        await this.browserInstance.version();
        return this.browserInstance;
      } catch (err) {
        console.warn('Puppeteer shared browser instance disconnected or crashed. Recreating...', err);
        try {
          await this.browserInstance.close();
        } catch (_) {}
        this.browserInstance = null;
      }
    }

    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;

    if (isProduction) {
      const puppeteerCore = await import('puppeteer-core');
      const chromium = await import('@sparticuz/chromium');
      
      const chromiumInstance = chromium.default;
      const execPath = await chromiumInstance.executablePath();
      
      this.browserInstance = await puppeteerCore.launch({
        args: chromiumInstance.args,
        defaultViewport: { width: 800, height: 600 },
        executablePath: execPath,
        headless: true,
      }) as unknown as Browser;
    } else {
      const puppeteerLocal = await import('puppeteer');
      this.browserInstance = await puppeteerLocal.default.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', // Prevents crashing in memory-constrained environments like VPS/containers
          '--disable-gpu',           // Saves GPU memory
          '--no-zygote',             // Disables zygote process creation for extra savings
          '--no-first-run',
        ]
      }) as unknown as Browser;
    }

    return this.browserInstance;
  }

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
  static async generatePdfFromHtml(html: string, layout: 'carta' | '80mm' | '58mm', landscape: boolean = false): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    
    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });

      // Wait for all images (logos, QR code) to load and decode completely
      await page.evaluate(async () => {
        const images = Array.from(document.querySelectorAll('img'));
        await Promise.all(images.map(img => {
          if (img.complete) return;
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        }));
      });

      let pdfOptions: import('puppeteer').PDFOptions = {};

      if (layout === 'carta') {
        pdfOptions = {
          format: 'Letter',
          landscape,
          margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
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
      await page.close();
    }
  }
}
