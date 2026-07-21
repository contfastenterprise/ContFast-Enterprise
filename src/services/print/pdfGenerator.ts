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
  static async generatePdfFromHtml(html: string, layout: 'carta' | '80mm' | '58mm' | string, landscape: boolean = false): Promise<Buffer> {
    const pdfServiceUrl = process.env.PDF_SERVICE_URL;
    const generatorMode = process.env.PDF_GENERATOR_MODE || 'local';

    if (generatorMode === 'external') {
      if (!pdfServiceUrl) {
        throw new Error('[PdfGenerator] PDF_GENERATOR_MODE is set to "external" but PDF_SERVICE_URL is not defined.');
      }

      console.log(`[PdfGenerator] Routing PDF generation to external service: ${pdfServiceUrl}`);
      const formData = new FormData();
      // Convert html string to Blob and append to Gotenberg required "files" key
      const htmlBlob = new Blob([html], { type: 'text/html' });
      formData.append('files', htmlBlob, 'index.html');

      // Configure layout and page sizes (Gotenberg expects dimensions in inches by default)
      if (layout === 'carta') {
        formData.append('paperWidth', '8.5');
        formData.append('paperHeight', '11');
        formData.append('marginTop', '0.39'); // ~10mm
        formData.append('marginBottom', '0.39');
        formData.append('marginLeft', '0.39');
        formData.append('marginRight', '0.39');
        if (landscape) {
          formData.append('landscape', 'true');
        }
      } else if (layout.startsWith('label:')) {
        const [_, w, h] = layout.split(':');
        const widthInches = (parseFloat(w.replace('mm', '')) * 0.03937).toFixed(2);
        const heightInches = (parseFloat(h.replace('mm', '')) * 0.03937).toFixed(2);
        formData.append('paperWidth', widthInches);
        formData.append('paperHeight', heightInches);
        formData.append('marginTop', '0.04');
        formData.append('marginBottom', '0.04');
        formData.append('marginLeft', '0.04');
        formData.append('marginRight', '0.04');
      } else {
        // Cash session receipts rolls (80mm / 58mm)
        const width = layout === '80mm' ? '3.15' : '2.28';
        formData.append('paperWidth', width);
        formData.append('paperHeight', '15'); // 15 inches standard height limit
        formData.append('marginTop', '0');
        formData.append('marginBottom', '0');
        formData.append('marginLeft', '0.08');
        formData.append('marginRight', '0.08');
        formData.append('singlePage', 'true'); // force single page continuous height
      }

      const endpoint = `${pdfServiceUrl.replace(/\/$/, '')}/forms/chromium/convert/html`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
      
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`External PDF API returned status ${response.status}: ${await response.text()}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (err: any) {
        clearTimeout(timeoutId);
        throw new Error(`[PdfGenerator] External PDF service failed: ${err.message}`);
      }
    }

    if (pdfServiceUrl) {
      console.log(`[PdfGenerator] Routing PDF generation to external service (local fallback enabled): ${pdfServiceUrl}`);
      try {
        const formData = new FormData();
        // Convert html string to Blob and append to Gotenberg required "files" key
        const htmlBlob = new Blob([html], { type: 'text/html' });
        formData.append('files', htmlBlob, 'index.html');

        // Configure layout and page sizes (Gotenberg expects dimensions in inches by default)
        if (layout === 'carta') {
          formData.append('paperWidth', '8.5');
          formData.append('paperHeight', '11');
          formData.append('marginTop', '0.39'); // ~10mm
          formData.append('marginBottom', '0.39');
          formData.append('marginLeft', '0.39');
          formData.append('marginRight', '0.39');
          if (landscape) {
            formData.append('landscape', 'true');
          }
        } else if (layout.startsWith('label:')) {
          const [_, w, h] = layout.split(':');
          const widthInches = (parseFloat(w.replace('mm', '')) * 0.03937).toFixed(2);
          const heightInches = (parseFloat(h.replace('mm', '')) * 0.03937).toFixed(2);
          formData.append('paperWidth', widthInches);
          formData.append('paperHeight', heightInches);
          formData.append('marginTop', '0.04');
          formData.append('marginBottom', '0.04');
          formData.append('marginLeft', '0.04');
          formData.append('marginRight', '0.04');
        } else {
          // Cash session receipts rolls (80mm / 58mm)
          const width = layout === '80mm' ? '3.15' : '2.28';
          formData.append('paperWidth', width);
          formData.append('paperHeight', '15'); // 15 inches standard height limit
          formData.append('marginTop', '0');
          formData.append('marginBottom', '0');
          formData.append('marginLeft', '0.08');
          formData.append('marginRight', '0.08');
          formData.append('singlePage', 'true'); // force single page continuous height
        }

        const endpoint = `${pdfServiceUrl.replace(/\/$/, '')}/forms/chromium/convert/html`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
        
        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`External PDF API returned status ${response.status}: ${await response.text()}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (err: any) {
        console.warn(`[PdfGenerator] External PDF service failed. Falling back to local Puppeteer. Error: ${err.message}`);
      }
    }

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
      } else if (layout.startsWith('label:')) {
        const [_, w, h] = layout.split(':');
        pdfOptions = {
          width: w,
          height: h,
          margin: { top: '1mm', right: '1mm', bottom: '1mm', left: '1mm' },
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
