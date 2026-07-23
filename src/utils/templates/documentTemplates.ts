import { parseFraction } from '../calculos';
import { windowProfiles } from '../profilesRegistry';

function deepEscape<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Date) {
    return obj;
  }

  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if (trimmed.startsWith('<') || obj.startsWith('data:image/') || obj.startsWith('http://') || obj.startsWith('https://')) {
      return obj;
    }
    return obj
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;') as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepEscape(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const escapedObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (key === 'logoUrl' || key === 'qrBase64' || key === 'signature' || key === 'html' || key === 'style') {
          escapedObj[key] = obj[key];
        } else {
          escapedObj[key] = deepEscape(obj[key]);
        }
      }
    }
    return escapedObj as T;
  }

  return obj;
}

export class DocumentTemplates {
  private static getBaseCss(layout: 'carta' | '80mm' | '58mm') {
    if (layout === 'carta') {
      return `
        body { font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 10pt; color: #333; margin: 0; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 20px; }
        .logo { max-width: 250px; max-height: 110px; object-fit: contain; }
        .company-info { text-align: left; }
        .doc-info { text-align: right; }
        .title { font-size: 16pt; font-weight: bold; color: #111; margin-bottom: 5px; }
        .subtitle { font-size: 12pt; font-weight: 600; color: #444; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
        .box { border: 1px solid #ddd; padding: 10px; border-radius: 4px; }
        .box-title { font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 9pt; }
        th { background-color: #f8f9fa; border-bottom: 2px solid #dee2e6; padding: 8px; text-align: left; font-weight: bold; }
        td { border-bottom: 1px solid #e9ecef; padding: 8px; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .totals-container { display: flex; justify-content: flex-end; }
        .totals { width: 300px; }
        .totals table th, .totals table td { border: none; padding: 4px 8px; }
        .totals .grand-total { font-size: 12pt; font-weight: bold; border-top: 2px solid #333; }
        .qr-section { margin-top: 30px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #eee; padding: 15px; border-radius: 4px; }
        .qr-code { width: 120px; height: 120px; }
        .qr-text { font-size: 8pt; color: #666; max-width: 60%; }
        .footer { text-align: center; font-size: 8pt; margin-top: 30px; color: #777; border-top: 1px solid #eee; padding-top: 10px; }
      `;
    } else if (layout === '80mm') {
      return `
        body { font-family: monospace; font-size: 9pt; width: 76mm; margin: 0; color: #000; padding: 0; }
        .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
        .logo { max-width: 60px; margin-bottom: 5px; }
        .title { font-size: 10pt; font-weight: bold; text-transform: uppercase; margin: 5px 0; }
        .company-info { font-size: 8pt; margin-bottom: 5px; }
        .doc-info, .client-info { margin-bottom: 10px; font-size: 8pt; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 8pt; }
        th { border-bottom: 1px dashed #000; padding: 2px 0; text-align: left; }
        td { padding: 2px 0; vertical-align: top; }
        .text-right { text-align: right; }
        .totals-container { border-top: 1px dashed #000; padding-top: 5px; }
        .totals { width: 100%; font-size: 8pt; }
        .totals table th, .totals table td { border: none; padding: 1px 0; }
        .totals .grand-total { font-weight: bold; font-size: 10pt; }
        .qr-section { margin-top: 10px; text-align: center; border-top: 1px dashed #000; padding-top: 10px; }
        .qr-code { width: 80px; height: 80px; margin: 0 auto; display: block; }
        .qr-text { font-size: 7pt; margin-top: 5px; }
        .footer { text-align: center; font-size: 7pt; margin-top: 10px; border-top: 1px dashed #000; padding-top: 5px; }
        .info-grid, .box { display: block; }
        .box-title { display: none; }
      `;
    } else {
      return `
        body { font-family: monospace; font-size: 8pt; width: 54mm; margin: 0; color: #000; padding: 0; }
        .header { text-align: center; margin-bottom: 5px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
        .logo { display: none; }
        .title { font-size: 9pt; font-weight: bold; text-transform: uppercase; margin: 3px 0; }
        .company-info { font-size: 7pt; margin-bottom: 3px; }
        .doc-info, .client-info { margin-bottom: 5px; font-size: 7pt; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 5px; font-size: 7pt; }
        th { border-bottom: 1px dashed #000; padding: 1px 0; text-align: left; }
        td { padding: 1px 0; vertical-align: top; }
        .text-right { text-align: right; }
        .totals-container { border-top: 1px dashed #000; padding-top: 3px; }
        .totals { width: 100%; font-size: 7pt; }
        .totals table th, .totals table td { border: none; padding: 1px 0; }
        .totals .grand-total { font-weight: bold; font-size: 8pt; }
        .qr-section { margin-top: 5px; text-align: center; border-top: 1px dashed #000; padding-top: 5px; }
        .qr-code { width: 60px; height: 60px; margin: 0 auto; display: block; }
        .qr-text { font-size: 6pt; margin-top: 3px; }
        .footer { text-align: center; font-size: 6pt; margin-top: 5px; border-top: 1px dashed #000; padding-top: 3px; }
        .info-grid, .box { display: block; }
        .box-title { display: none; }
      `;
    }
  }

  static generateCode39Svg(text: string): string {
    const table: Record<string, string> = {
      '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
      '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwnwnnn', '7': 'nnnnwnwnw',
      '8': 'wnnnwnwnn', '9': 'nnwnwnwnn', 'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw',
      'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw', 'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn',
      'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn', 'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn',
      'K': 'wnnnnnnww', 'L': 'nnwnnnnww', 'M': 'wnwnnnnww', 'N': 'nnnnwnnww',
      'O': 'wnnnwnnww', 'P': 'nnwnwnnww', 'Q': 'nnnnnnwww', 'R': 'wnnnnnwww',
      'S': 'nnwnnnwww', 'T': 'nnnnwnwww', 'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw',
      'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw', 'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn',
      '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
      '$': 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnnwnw', '%': 'nnnwnwnwn'
    };

    const cleanText = `*${text.toUpperCase()}*`;
    let currentX = 0;
    const height = 30;
    let paths = '';

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      const pattern = table[char] || table['*'];

      for (let j = 0; j < 9; j++) {
        const type = pattern[j];
        const width = type === 'w' ? 2.0 : 0.8;
        const isBar = j % 2 === 0;

        if (isBar) {
          paths += `<rect x="${currentX.toFixed(1)}" y="0" width="${width.toFixed(1)}" height="${height}" fill="black" />`;
        }
        currentX += width;
      }
      currentX += 0.8;
    }

    return `<svg width="${currentX.toFixed(1)}" height="${height}" viewBox="0 0 ${currentX.toFixed(1)} ${height}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
  }

  /**
   * Renderiza el HTML para una factura (e-CF)
   */
  static renderInvoice(data: any, layout: 'carta' | '80mm' | '58mm', qrBase64: string): string {
    const { company, customer, invoice, lines, taxes } = data;
    const inv = invoice || data;

    if (layout === 'carta') {
      const padDots = (label: string, length: number) => {
        const dotsNeeded = length - label.length;
        return label + '.'.repeat(Math.max(0, dotsNeeded)) + ':';
      };

      const getEcfTypeName = (type: string) => {
        const types: Record<string, string> = {
          '31': 'Factura de Crédito Fiscal Electrónica',
          '32': 'Factura de Consumo Electrónica',
          '33': 'Nota de Débito Electrónica',
          '34': 'Nota de Crédito Electrónica',
          '41': 'Registro de Proveedores Informales Electrónico',
          '43': 'Registro de Único Ingreso Electrónico',
          '44': 'Registro de Gastos Menores Electrónico',
          '45': 'Registro de Regímenes Especiales de Tributación Electrónico',
          '46': 'Registro de Gubernamentales Electrónico'
        };
        return types[type] || 'Factura de Consumo Electrónica';
      };

      const formatNum = (val: number) => {
        return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      const emiDate = new Date(inv.createdAt);
      const formattedEmiDate = `${String(emiDate.getDate()).padStart(2, '0')}/${String(emiDate.getMonth() + 1).padStart(2, '0')}/${emiDate.getFullYear()}`;

      const isCredit = inv.paymentType === 'credit';
      let conditionLabel = isCredit ? 'FACTURA A CREDITO' : 'FACTURA AL CONTADO';
      if (inv.ecfType === '33') {
        conditionLabel = 'NOTA DE DEBITO';
      } else if (inv.ecfType === '34') {
        conditionLabel = 'NOTA DE CREDITO';
      }

      // Group lines by warehouse and then by category
      const groupedLines: Record<string, Record<string, any[]>> = {};
      (lines || []).forEach((line: any) => {
        const wh = line.warehouseName || 'Almacén Principal';
        const cat = line.categoryName || 'General';
        if (!groupedLines[wh]) groupedLines[wh] = {};
        if (!groupedLines[wh][cat]) groupedLines[wh][cat] = [];
        groupedLines[wh][cat].push(line);
      });

      const warehousesList = Object.keys(groupedLines).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

      // Lines processing nested by warehouse and category
      const linesHtml = warehousesList.map((warehouse) => {
        const warehouseHeaderRow = `
          <tr style="background-color: #ffffff; color: #000000; border-bottom: 2px solid #000000; border-top: 1px solid #000000;">
            <td colspan="8" style="font-weight: bold; font-size: 9.5pt; padding: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
              Almacén: ${warehouse}
            </td>
          </tr>
        `;

        const categoriesMap = groupedLines[warehouse];
        const categoriesList = Object.keys(categoriesMap).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

        const categoriesHtml = categoriesList.map((category) => {
          const categoryHeaderRow = `
            <tr style="background-color: #f1f5f9; border-bottom: 1.5px solid #cbd5e1;">
              <td colspan="8" style="font-weight: bold; font-size: 8.5pt; color: #475569; padding: 6px 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                Categoría: ${category}
              </td>
            </tr>
          `;

          const itemsRows = categoriesMap[category].map((line: any) => {
            const qty = Number(line.quantity);
            const uPrice = Number(line.unitPrice);
            const discUnit = Number(line.discount);
            const lineTotal = Number(line.total);

            const rawSubtotal = qty * uPrice;
            const rawDiscount = qty * discUnit;
            const rawTaxable = rawSubtotal - rawDiscount;

            const defaultTaxRate = (taxes || []).find((t: any) => t.taxType === 'ITBIS' || t.taxType?.toLowerCase().includes('itbis'))?.rate
              ? Number((taxes || []).find((t: any) => t.taxType === 'ITBIS' || t.taxType?.toLowerCase().includes('itbis')).rate) / 100
              : 0.18;

            const hasGlobalTaxes = Number(inv.totalTaxes) > 0;
            const lineItbis = hasGlobalTaxes ? rawTaxable * defaultTaxRate : 0;
            const finalLineTotal = rawTaxable + lineItbis;

            return `
              <tr>
                <td style="padding-left: 16px;">${line.productSku || 'N/A'}</td>
                <td>${line.productName}</td>
                <td>${line.unitOfMeasure || 'Unidad'}</td>
                <td class="text-center">${qty}</td>
                <td class="text-right">${formatNum(uPrice)}</td>
                <td class="text-right">${formatNum(rawDiscount)}</td>
                <td class="text-right">${formatNum(lineItbis)}</td>
                <td class="text-right">${formatNum(finalLineTotal)}</td>
              </tr>
            `;
          }).join('');

          return categoryHeaderRow + itemsRows;
        }).join('');

        return warehouseHeaderRow + categoriesHtml;
      }).join('');

      // Totals calculations
      const subtotalVal = formatNum(inv.subtotal);
      const discountVal = formatNum(inv.discount);
      const itbisVal = formatNum(inv.totalTaxes);
      const totalVal = formatNum(inv.total);

      // Retention calculations
      const retentions: any[] = Array.isArray(inv.retentions) ? inv.retentions : [];
      const hasRetentions = retentions.length > 0;
      const totalRetainedVal = hasRetentions ? formatNum(Number(inv.totalRetained) || 0) : null;
      const totalNetVal = hasRetentions ? formatNum(Number(inv.totalNet) || 0) : null;

      const retentionsHtml = hasRetentions ? `
        <tr style="border-top: 1px dashed #e2a000;">
          <td colspan="2" style="padding-top:6px; padding-bottom:2px; color:#b45309; font-weight:bold; font-size:8pt; letter-spacing:0.5px; text-transform:uppercase;">Retenciones Fiscales</td>
        </tr>
        ${retentions.map((r: any) => `
        <tr>
          <td style="color:#b45309; font-size:8.5pt;">${r.retentionName} (${Number(r.retentionPercentage).toFixed(2)}%)</td>
          <td class="text-right" style="color:#b45309; font-size:8.5pt;">- ${formatNum(Number(r.retentionAmount))}</td>
        </tr>`).join('')}
        <tr style="border-top: 1px solid #fbbf24;">
          <td style="color:#b45309; font-weight:bold; font-size:9pt;">Total Retenido</td>
          <td class="text-right" style="color:#b45309; font-weight:bold; font-size:9pt;">- ${totalRetainedVal}</td>
        </tr>
        <tr class="grand-total-row" style="border-top: 2px double #065f46; color:#065f46;">
          <td>TOTAL NETO A COBRAR</td>
          <td class="text-right">${totalNetVal}</td>
        </tr>
      ` : `
        <tr class="grand-total-row">
          <td>TOTAL NETO</td>
          <td class="text-right">${totalVal}</td>
        </tr>
      `;

      // Signature Date formatting
      let sigDate = new Date(inv.signatureDate || inv.createdAt);
      if (isNaN(sigDate.getTime()) && inv.signatureDate) {
        // Try parsing DD-MM-YYYY or DD/MM/YYYY or other common formats
        const match = String(inv.signatureDate).match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s+(.*))?$/);
        if (match) {
          const day = parseInt(match[1], 10);
          const month = parseInt(match[2], 10) - 1; // 0-indexed
          const year = parseInt(match[3], 10);
          const timePart = match[4] || '';
          if (timePart) {
            sigDate = new Date(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${timePart}`);
            if (isNaN(sigDate.getTime())) {
              sigDate = new Date(year, month, day);
            }
          } else {
            sigDate = new Date(year, month, day);
          }
        }
      }
      if (isNaN(sigDate.getTime())) {
        sigDate = new Date(inv.createdAt || new Date());
      }

      const formattedSigDate = sigDate.toLocaleString('es-DO', {
        hour12: true,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).replace('am', 'a. m.').replace('pm', 'p. m.').replace('AM', 'a. m.').replace('PM', 'p. m.');

      const logoHtml = company.logoUrl
        ? `<img src="${company.logoUrl}" style="max-height: 115px; max-width: 250px; object-fit: contain; margin-bottom: 3px; margin-left: -8px;" alt="Logo">`
        : '';

      const copiesCount = Math.max(1, Math.min(5, Number(company?.settings?.printCopies ?? 1)));

      const renderSingleCopy = (copyLabel: string) => {
        return `
          <div class="header-container">
            <div>
              ${logoHtml}
              <div class="company-info">
  ${padDots('RNC', 12)} ${company.rnc || ''}
  ${padDots('Teléfono', 12)} ${company.phone || ''}
  ${padDots('Email', 12)} ${company.email || ''}
  ${padDots('Dirección', 12)} ${company.address || ''}
              </div>
            </div>
            <div class="doc-info">
              <div style="font-weight: bold; font-size: 11pt; border: 2px solid #005E6A; color: #005E6A; padding: 2px 8px; border-radius: 4px; display: inline-block; text-transform: uppercase; margin-bottom: 8px; font-family: 'Inter', sans-serif;">
                ${copyLabel}
              </div>
              <div class="doc-title">${getEcfTypeName(inv.ecfType)}</div>
              <div class="doc-ncf">e-NCF: <span style="font-family: monospace;">${inv.ncf}</span></div>
              <div style="font-size: 10pt; color: #333; margin-top: 5px; font-weight: bold;">
                Fecha Emis: <span style="font-family: monospace; font-weight: normal;">${formattedEmiDate}</span>
              </div>
              ${['31', '44', '45', '46'].includes(inv.ecfType) && inv.ncfExpiryDate
            ? `<div style="font-size: 10pt; color: #333; margin-top: 5px; font-weight: bold;">
                    Fecha Vencimiento: <span style="font-family: monospace; font-weight: normal;">${inv.ncfExpiryDate}</span>
                   </div>`
            : ''
          }
              <div style="margin-top: 10px; display: flex; flex-direction: column; align-items: flex-end;">
                ${DocumentTemplates.generateCode39Svg(inv.codigoFactura || `FAC-${inv.ncf.substring(3)}`)}
                <div class="barcode-text">${inv.codigoFactura || `FAC-${inv.ncf.substring(3)}`}</div>
              </div>
            </div>
          </div>

          <div class="condition-bar">
            ${conditionLabel}
          </div>

          <div class="client-section">
            <div class="client-info">
  ${padDots('Razon Social', 18)} ${customer.name || ''}
  ${padDots('RNC/Cédula', 18)} ${customer.rncCedula || ''}
  ${padDots('Teléfono', 18)} ${customer.phone || ''}
  ${padDots('Dirección', 18)} ${customer.address || ''}
            </div>
            <div class="invoice-num">
              Factura N°: ${inv.codigoFactura || `FAC-${inv.ncf.substring(3)}`}
            </div>
          </div>

          <table class="invoice-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th>Medida</th>
                <th class="text-center">Cantidad</th>
                <th class="text-right">Precio</th>
                <th class="text-right">Desc</th>
                <th class="text-right">ITBIS</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${linesHtml}
            </tbody>
          </table>

          <div class="bottom-section">
            <div style="font-family: monospace; font-size: 9pt; line-height: 1.4; max-width: 55%;">
              <div style="font-weight: bold; color: #005E6A; margin-bottom: 5px; font-family: 'Inter', sans-serif;">Notas:</div>
              <div style="margin-bottom: 15px; color: #555; white-space: pre-wrap;">${inv.notes || 'Gracias por su compra! .\nNo aceptamos devolucion de despues de la salida de mercancia.'}</div>
            </div>
            <div style="width: 300px; font-family: monospace; font-size: 9.5pt;">
              <table class="totals-table">
                <tr>
                  <td>${padDots('SUB TOTAL', 15)}</td>
                  <td class="text-right">${subtotalVal}</td>
                </tr>
                <tr>
                  <td>${padDots('- DESCUENTO', 15)}</td>
                  <td class="text-right">${discountVal}</td>
                </tr>
                <tr>
                  <td>${padDots('+ ITBIS', 15)}</td>
                  <td class="text-right">${itbisVal}</td>
                </tr>
                ${hasRetentions ? `
                <tr>
                  <td>${padDots('TOTAL BRUTO', 15)}</td>
                  <td class="text-right">${totalVal}</td>
                </tr>
                ` : ''}
                ${retentionsHtml}
              </table>
            </div>
          </div>

          <div class="invoice-footer-repeated">
            <div style="display: flex; align-items: center; gap: 15px;">
              ${qrBase64 ? `<img src="${qrBase64}" class="qr-img-repeated" alt="QR">` : ''}
              <div style="font-family: monospace; font-size: 8pt; line-height: 1.4; text-align: left; border-left: 1px solid #cbd5e1; padding-left: 15px; color: #333;">
                Código de seguridad: ${inv.securityCode || 'N/A'}<br>
                Fecha Firma: ${formattedSigDate}
              </div>
            </div>
          </div>

          <div class="last-page-signatures" style="position: absolute; bottom: 0px; right: 0px; z-index: 10;">
            <div class="signature-container" style="display: flex; gap: 30px; font-family: 'Inter', sans-serif; font-size: 7.5pt; color: #555; align-items: flex-end;">
              <div class="signature-line" style="text-align: center; width: 120px; display: flex; flex-direction: column; justify-content: flex-end; height: 40px; margin-bottom: 2px;">
                <div class="signature-line-border" style="border-top: 1px solid #777; padding-top: 2px;">Recibido conforme</div>
              </div>
              <div class="signature-line" style="text-align: center; width: 120px; display: flex; flex-direction: column; justify-content: flex-end; height: 40px; margin-bottom: 2px;">
                <div class="signature-line-border" style="border-top: 1px solid #777; padding-top: 2px;">Revisado por</div>
              </div>
            </div>
          </div>

          
        `;
      };

      const copiesHtmlArray = [];
      for (let i = 0; i < copiesCount; i++) {
        const label = i === 0 ? 'ORIGINAL' : 'COPIA';
        copiesHtmlArray.push(`
          <div class="invoice-wrapper ${i > 0 ? 'page-break' : ''}">
            ${renderSingleCopy(label)}
          </div>
        `);
      }
      const copiesHtml = copiesHtmlArray.join('');

      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Factura ${inv.ncf}</title>
          <style>
            @page {
              margin: 12mm 12mm 25mm 12mm;
            }
            body { font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 10pt; color: #333; margin: 0; padding: 0; padding-bottom: 0px; }
            .page-break { page-break-before: always; }
            .invoice-wrapper {
              width: 100%;
              box-sizing: border-box;
              position: relative;
              display: flex;
              flex-direction: column;
              min-height: 242mm;
            }
            .header-container { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: -5px; }
            .company-info { font-family: monospace; font-size: 9.5pt; line-height: 1.5; white-space: pre; margin-top: -15px; }
            .doc-info { text-align: right; font-family: 'Inter', sans-serif; white-space: nowrap; }
            .barcode-text { font-family: monospace; font-size: 7.5pt; color: #555; text-align: right; margin-top: 2px; }
            .doc-title { font-size: 14pt; font-weight: bold; color: #005E6A; margin-bottom: 5px; white-space: nowrap; }
            .doc-ncf { font-size: 11.5pt; font-weight: bold; color: #000; white-space: nowrap; }
            
            .condition-bar { text-align: center; border-top: 2px solid #005E6A; border-bottom: 2px solid #005E6A; padding: 4px 0; margin: 0px 0 -15px 0; font-family: 'Inter', sans-serif; font-weight: bold; font-size: 11pt; letter-spacing: 1px; color: #000; }
            
            .client-section { display: flex; justify-content: space-between; font-family: monospace; font-size: 9.5pt; line-height: 1.5; margin-bottom: -8px; }
            .client-info { white-space: pre; }
            .invoice-num { text-align: right; font-weight: bold; font-size: 11pt; padding-top: 26px; }
            
            .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            .invoice-table th { background-color: #ffffff; color: #000000; font-family: 'Inter', sans-serif; font-weight: bold; font-size: 9pt; padding: 4px 6px; border-bottom: 2px solid #000000; text-align: left; }
            .invoice-table td { font-family: monospace; font-size: 9pt; padding: 4px 6px; border-bottom: 1px solid #e9ecef; color: #333; }
            .invoice-table th.text-center, .invoice-table td.text-center { text-align: center; }
            .invoice-table th.text-right, .invoice-table td.text-right { text-align: right; }
            
            .bottom-section { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 25px; margin-bottom: 40px; }
            
            .totals-table { width: 100%; border-collapse: collapse; }
            .totals-table td { border: none; padding: 2px 0; }
            .totals-table .grand-total-row { font-weight: bold; border-top: 1px solid #ccc; border-bottom: 3px double #000; }
            .totals-table .grand-total-row td { padding: 4px 0; font-size: 11pt; }
            
            .signature-container { display: flex; gap: 40px; font-family: 'Inter', sans-serif; font-size: 8.5pt; color: #555; align-items: flex-end; }
            .signature-line { text-align: center; width: 150px; }
            .signature-line-border { border-top: 1px solid #777; padding-top: 6px; }
            
            .qr-signature-section { display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px; }
            .qr-block { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; font-family: monospace; font-size: 8.5pt; }
            .qr-img { width: 100px; height: 100px; }
             .invoice-footer-repeated {
              position: fixed;
              bottom: 0px;
              left: 0;
              right: 0;
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-top: 1px solid #cbd5e1;
              padding-top: 8px;
              background-color: white;
              height: 90px;
            }
            .qr-img-repeated {
              width: 85px;
              height: 85px;
            }
          </style>
        </head>
        <body>
          ${copiesHtml}
          <script>
            window.addEventListener('DOMContentLoaded', () => {
              const wrappers = document.querySelectorAll('.invoice-wrapper');
              wrappers.forEach(wrapper => {
                wrapper.style.minHeight = '0px';
                const contentHeight = wrapper.offsetHeight;
                const pageHeight = 917; // Letter page height in pixels inside print printable area
                const pagesCount = Math.ceil(contentHeight / pageHeight);
                wrapper.style.minHeight = (pagesCount * pageHeight - 20) + 'px';
              });
            });
          </script>
        </body>
        </html>
      `;
    }

    const css = this.getBaseCss(layout);
    const logoHtml = company.logoUrl && layout !== '58mm' && layout !== '80mm'
      ? `<img src="${company.logoUrl}" class="logo" alt="Logo">`
      : '';

    // Group lines by category for ticket layout
    const ticketGrouped: Record<string, any[]> = {};
    (lines || []).forEach((line: any) => {
      const cat = line.categoryName || 'General';
      if (!ticketGrouped[cat]) ticketGrouped[cat] = [];
      ticketGrouped[cat].push(line);
    });

    const ticketCategories = Object.keys(ticketGrouped).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    const linesHtml = ticketCategories.map((category) => {
      const headerRow = `
        <tr style="background-color: #f1f5f9;">
          <td colspan="4" style="font-weight: bold; font-size: 8pt; padding: 4px 2px; border-bottom: 1px solid #ddd; text-transform: uppercase;">
            ${category}
          </td>
        </tr>
      `;

      const itemsRows = ticketGrouped[category].map((line: any) => {
        const qty = Number(line.quantity);
        const uPrice = Number(line.unitPrice);
        const lineTotal = Number(line.total);

        return `
          <tr>
            <td>${qty}</td>
            <td>${line.productName}</td>
            <td class="text-right">$${uPrice.toFixed(2)}</td>
            <td class="text-right">$${lineTotal.toFixed(2)}</td>
          </tr>
        `;
      }).join('');

      return headerRow + itemsRows;
    }).join('');

    const taxesHtml = taxes.map((tax: any) => `
      <tr>
        <th>${tax.taxType} (${tax.rate}%)</th>
        <td class="text-right">$${tax.amount.toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Factura ${inv.ncf}</title>
        <style>${css}</style>
      </head>
      <body>
        <div class="header">
          <div class="company-info">
            ${logoHtml}
            <div class="title">${company.name}</div>
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info">
            <div class="subtitle">FACTURA CON VALOR FISCAL</div>
            <div><strong>e-NCF:</strong> ${inv.ncf}</div>
            <div><strong>Fecha:</strong> ${new Date(inv.createdAt).toLocaleDateString()}</div>
            <div><strong>Condición:</strong> ${inv.paymentStatus}</div>
          </div>
        </div>

        <div class="info-grid">
          <div class="box client-info">
            <div class="box-title">Facturado a:</div>
            <div><strong>${customer ? customer.name : 'Cliente de Contado'}</strong></div>
            ${customer && customer.rncCedula ? `<div>RNC/Cédula: ${customer.rncCedula}</div>` : ''}
            ${customer && customer.address ? `<div>Dirección: ${customer.address}</div>` : ''}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Cant</th>
              <th>Descripción</th>
              <th class="text-right">Precio</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
          </tbody>
        </table>

        <div class="totals-container">
          <div class="totals">
            <table>
              <tr>
                <th>Subtotal</th>
                <td class="text-right">$${Number(inv.subtotal).toFixed(2)}</td>
              </tr>
              ${Number(inv.discount) > 0 ? `
              <tr>
                <th>Descuento</th>
                <td class="text-right">-$${Number(inv.discount).toFixed(2)}</td>
              </tr>
              ` : ''}
              ${taxesHtml}
              <tr class="${Array.isArray(inv.retentions) && inv.retentions.length > 0 ? '' : 'grand-total'}">
                <th>TOTAL BRUTO</th>
                <td class="text-right">$${Number(inv.total).toFixed(2)}</td>
              </tr>
              ${Array.isArray(inv.retentions) && inv.retentions.length > 0 ? `
                <tr><th colspan="2" style="color:#b45309; padding-top:4px; font-size:7pt; text-transform:uppercase;">RETENCIONES</th></tr>
                ${inv.retentions.map((r: any) => `
                <tr>
                  <th style="color:#b45309; font-size:7pt;">${r.retentionName} (${Number(r.retentionPercentage).toFixed(1)}%)</th>
                  <td class="text-right" style="color:#b45309;">-$${Number(r.retentionAmount).toFixed(2)}</td>
                </tr>`).join('')}
                <tr class="grand-total" style="color:#065f46;">
                  <th>TOTAL NETO</th>
                  <td class="text-right">$${Number(inv.totalNet).toFixed(2)}</td>
                </tr>
              ` : ''}
            </table>
          </div>
        </div>

        <div class="qr-section">
          <div class="qr-text">
            <strong>Firma Digital Válida</strong><br>
            ${inv.securityCode ? `<strong>Código de Seguridad:</strong> ${inv.securityCode}<br>` : ''}
            <strong>Fecha de Firma:</strong> ${new Date(inv.signatureDate || inv.createdAt).toLocaleString('es-DO')}<br>
            Puede validar este e-CF en el portal de la DGII.
          </div>
          ${qrBase64 ? `<img src="${qrBase64}" class="qr-code" alt="QR Code">` : ''}
        </div>

        <div class="footer">
          Generado por ContFast Enterprise - Sistema de Facturación Electrónica Autorizado
        </div>
      </body>
      </html>
    `;
  }

  static renderReceipt(data: any, layout: 'carta' | '80mm' | '58mm'): string {
    const css = this.getBaseCss(layout);
    const { company, customer, id, date, paymentMethod, amount, reference, notes, appliedInvoices, customerTotalBalance } = data;

    const logoHtml = company.logoUrl && layout !== '58mm'
      ? `<img src="${company.logoUrl}" class="logo" style="${layout === 'carta' ? 'margin-left: -20px;' : ''}" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml ? '' : `<div class="title">${company.name}</div>`;

    const methodLabel = paymentMethod === 'cash' ? 'Efectivo / Caja Chica' :
      paymentMethod === 'bank' ? 'Transferencia / Depósito' :
        paymentMethod === 'check' ? 'Cheque' : 'Tarjeta';

    const formatNum = (val: number) => {
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const linesHtml = appliedInvoices.map((inv: any) => {
      const isPaid = (inv.remainingBalance || 0) <= 0.01;
      const typeLabel = isPaid ? 'SALDO' : 'ABONO';
      const typeColor = isPaid ? '#1e7e34' : '#d39e00';
      const invoiceLabel = inv.codigoFactura || inv.invoiceNumber || 'N/A';
      return `
        <tr>
          <td>${invoiceLabel}</td>
          <td>${new Date(inv.invoiceDate).toLocaleDateString('es-DO')}</td>
          <td class="text-right">$${formatNum(inv.totalAmount)}</td>
          <td class="text-right" style="font-weight: bold; color: #001e40;">$${formatNum(inv.amountApplied)}</td>
          <td class="text-center" style="font-weight: bold; color: ${typeColor};">${typeLabel}</td>
          <td class="text-right" style="font-weight: bold; color: #dc3545;">$${formatNum(inv.remainingBalance || 0)}</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Recibo de Ingreso REC-${id.slice(0, 8).toUpperCase()}</title>
        <style>${css}</style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8pt; color: #555; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info">
            <div class="subtitle" style="margin-bottom: 8px;">RECIBO DE INGRESO</div>
            <div><strong>Recibo #:</strong> REC-${id.slice(0, 8).toUpperCase()}</div>
            <div><strong>Fecha:</strong> ${new Date(date).toLocaleDateString('es-DO')}</div>
            <div><strong>Método:</strong> ${methodLabel}</div>
            ${reference ? `<div><strong>Referencia:</strong> ${reference}</div>` : ''}
          </div>
        </div>

        <div class="info-grid">
          <div class="box client-info">
            <div class="box-title">Recibido de:</div>
            <div><strong>${customer ? customer.name : 'Cliente General'}</strong></div>
            ${customer && customer.rncCedula ? `<div>RNC/Cédula: ${customer.rncCedula}</div>` : ''}
            ${customer && customer.address ? `<div>Dirección: ${customer.address}</div>` : ''}
          </div>
        </div>

        <h4 style="margin-top: 20px; color: #111; border-bottom: 1px solid #eee; padding-bottom: 5px;">Detalle de Facturas Aplicadas</h4>
        <table>
          <thead>
            <tr>
              <th>Factura</th>
              <th>Fecha Factura</th>
              <th class="text-right">Monto Factura</th>
              <th class="text-right">Monto Aplicado</th>
              <th class="text-center">Tipo de Transacción</th>
              <th class="text-right">Balance Restante</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
          </tbody>
        </table>

        <div class="totals-container">
          <div class="totals">
            <table>
              <tr class="grand-total">
                <th>TOTAL RECIBIDO</th>
                <td class="text-right">$${formatNum(amount)}</td>
              </tr>
              ${customerTotalBalance !== undefined ? `
              <tr class="grand-total" style="border-top: 1px solid #dee2e6; color: #dc3545;">
                <th style="font-size: 10pt;">BALANCE PENDIENTE</th>
                <td class="text-right" style="font-weight: bold; font-size: 10pt;">$${formatNum(customerTotalBalance)}</td>
              </tr>
              ` : ''}
            </table>
          </div>
        </div>

        ${notes ? `
        <div class="box" style="margin-top: 20px;">
          <div class="box-title">Observaciones:</div>
          <div>${notes}</div>
        </div>
        ` : ''}

        <div class="footer" style="margin-top: 50px;">
          Generado por ContFast Enterprise - Módulo de Cuentas por Cobrar
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Renderiza el HTML para un Conduce de Entrega (Delivery Note)
   */
  static renderDeliveryNote(data: any): string {
    const { company, customer, invoice, deliveryNote, lines } = data;
    const padDots = (label: string, length: number) => {
      const dotsNeeded = length - label.length;
      return label + '.'.repeat(Math.max(0, dotsNeeded)) + ':';
    };

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" style="max-height: 50px; margin-bottom: 8px;" alt="Logo"/>`
      : '';

    const delDate = new Date(deliveryNote.deliveryDate);
    const formattedDelDate = `${String(delDate.getDate()).padStart(2, '0')}/${String(delDate.getMonth() + 1).padStart(2, '0')}/${delDate.getFullYear()}`;

    const linesHtml = lines.map((line: any) => {
      const invQty = Number(line.invoicedQty || 0);
      const prevQty = Number(line.previouslyDeliveredQty || 0);
      const currentQty = Number(line.quantity || 0);
      const remainingQty = Math.max(0, invQty - prevQty - currentQty);

      return `
        <tr>
          <td>${line.productSku || 'N/A'}</td>
          <td>${line.productName}</td>
          <td>${line.unitOfMeasure || 'Unidad'}</td>
          <td class="text-center">${invQty}</td>
          <td class="text-center">${prevQty}</td>
          <td class="text-center" style="font-weight: bold; color: #005E6A;">${currentQty}</td>
          <td class="text-center">${remainingQty}</td>
        </tr>
      `;
    }).join('');

    const statusBadge = deliveryNote.status === 'approved'
      ? '<span style="background-color: #d1e7dd; color: #0f5132; padding: 4px 8px; border-radius: 4px; font-weight: bold;">APROBADO</span>'
      : deliveryNote.status === 'voided'
        ? '<span style="background-color: #f8d7da; color: #842029; padding: 4px 8px; border-radius: 4px; font-weight: bold;">ANULADO</span>'
        : '<span style="background-color: #fff3cd; color: #664d03; padding: 4px 8px; border-radius: 4px; font-weight: bold;">BORRADOR</span>';

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Conduce ${deliveryNote.deliveryNumber}</title>
        <style>
          body { font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 10pt; color: #333; margin: 0; padding: 0; }
          .header-container { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
          .company-info { font-family: monospace; font-size: 9.5pt; line-height: 1.5; white-space: pre; margin-top: -15px; }
          .doc-info { text-align: right; font-family: 'Inter', sans-serif; white-space: nowrap; }
          .doc-title { font-size: 14pt; font-weight: bold; color: #005E6A; margin-bottom: 5px; }
          .doc-ncf { font-size: 11.5pt; font-weight: bold; color: #000; }
          
          .condition-bar { text-align: center; border-top: 2px solid #005E6A; border-bottom: 2px solid #005E6A; padding: 6px 0; margin: 15px 0; font-family: 'Inter', sans-serif; font-weight: bold; font-size: 11pt; letter-spacing: 1px; color: #000; }
          
          .details-section { display: flex; justify-content: space-between; font-family: monospace; font-size: 9.5pt; line-height: 1.5; margin-bottom: 20px; }
          .client-info { white-space: pre; }
          .logistic-info { white-space: pre; text-align: right; }
          
          .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .invoice-table th { background-color: #005E6A; color: #fff; font-family: 'Inter', sans-serif; font-weight: bold; font-size: 9pt; padding: 8px 6px; border: none; text-align: left; }
          .invoice-table td { font-family: monospace; font-size: 9pt; padding: 8px 6px; border-bottom: 1px solid #e9ecef; color: #333; }
          .invoice-table th.text-center, .invoice-table td.text-center { text-align: center; }
          .invoice-table th.text-right, .invoice-table td.text-right { text-align: right; }
          
          .bottom-section { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 40px; }
          
          .signature-box { border-top: 1px solid #777; width: 200px; text-align: center; padding-top: 6px; font-family: 'Inter', sans-serif; font-size: 8.5pt; color: #555; }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div>
            ${logoHtml}
            <div class="company-info">
  ${padDots('RNC', 12)} ${company.rnc}
  ${padDots('Teléfono', 12)} ${company.phone || ''}
  ${padDots('Email', 12)} ${company.email || ''}
  ${padDots('Dirección', 12)} ${company.address || ''}
            </div>
          </div>
          <div class="doc-info">
            <div class="doc-title">CONDUCE DE ENTREGA</div>
            <div class="doc-ncf">No: <span style="font-family: monospace;">${deliveryNote.deliveryNumber}</span></div>
            <div style="font-size: 10pt; color: #333; margin-top: 5px; font-weight: bold;">
              Fecha: <span style="font-family: monospace; font-weight: normal;">${formattedDelDate}</span>
            </div>
            <div style="margin-top: 5px;">
              Estado: ${statusBadge}
            </div>
          </div>
        </div>

        <div class="condition-bar">
          DOCUMENTO DE CONTROL DE DESPACHO
        </div>

        <div class="details-section">
          <div class="client-info">
  <span style="font-weight: bold; font-family: 'Inter', sans-serif; color: #005E6A;">DATOS DEL CLIENTE:</span>
  ${padDots('Razon Social', 15)} ${customer.name}
  ${padDots('RNC/Cédula', 15)} ${customer.rncCedula}
  ${padDots('Dirección', 15)} ${customer.address || ''}
          </div>
          <div class="logistic-info">
  <span style="font-weight: bold; font-family: 'Inter', sans-serif; color: #005E6A;">DATOS DE TRANSPORTE:</span>
  Factura Ref : ${invoice.codigoFactura || invoice.ncf}
  Chofer      : ${deliveryNote.driverName || 'N/A'}
  Placa       : ${deliveryNote.vehiclePlate || 'N/A'}
  Despachador : ${deliveryNote.dispatcherName || 'N/A'}
          </div>
        </div>

        <table class="invoice-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción del Artículo</th>
              <th>Medida</th>
              <th class="text-center">Facturado</th>
              <th class="text-center">Entregado Ant.</th>
              <th class="text-center">Despachado Hoy</th>
              <th class="text-center">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
          </tbody>
        </table>

        <div style="font-family: monospace; font-size: 9pt; line-height: 1.4; margin-top: 20px;">
          <div style="font-weight: bold; color: #005E6A; margin-bottom: 5px; font-family: 'Inter', sans-serif;">Observaciones:</div>
          <div style="color: #555; white-space: pre-wrap; border: 1px solid #e9ecef; padding: 10px; border-radius: 6px;">${deliveryNote.notes || 'Sin observaciones.'}</div>
        </div>

        <div class="bottom-section" style="margin-top: 80px;">
          <div class="signature-box">
            Firma Despachador
          </div>
          <div class="signature-box">
            Firma Chofer / Transportista
          </div>
          <div class="signature-box">
            Recibido Conforme (Cliente)
          </div>
        </div>
      </body>
      </html>
    `;
  }

  static renderCustomerStatement(data: any): string {
    const { company, customer, items } = data;
    const css = this.getBaseCss('carta');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="margin-left: -20px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml ? '' : `<div class="title">${company.name}</div>`;

    const formatNum = (val: number) => {
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const linesHtml = items.map((item: any) => {
      const methodLabel = item.paymentMethod === 'cash' ? 'Efectivo' :
        item.paymentMethod === 'bank' ? 'Banco' :
          item.paymentMethod === 'check' ? 'Cheque' : 'Tarjeta';
      return `
        <tr>
          <td>${new Date(item.receiptDate).toLocaleDateString('es-DO')}</td>
          <td class="font-mono">REC-${item.receiptId.slice(0, 8).toUpperCase()}</td>
          <td class="font-semibold text-slate-800">${item.codigoFactura || 'N/A'}${item.invoiceNumber ? ` (${item.invoiceNumber})` : ''}</td>
          <td>${methodLabel}${item.reference ? ` - Ref: ${item.reference}` : ''}</td>
          <td class="text-right font-mono">$${formatNum(item.invoiceTotal)}</td>
          <td class="text-right font-mono" style="font-weight: bold; color: #1e7e34;">$${formatNum(item.amountApplied)}</td>
          <td class="text-right font-mono" style="font-weight: bold; color: #dc3545;">$${formatNum(item.progressiveBalance)}</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Estado de Cuenta - ${customer.name}</title>
        <style>
          ${css}
          .font-mono { font-family: monospace; }
          .font-semibold { font-weight: 600; }
          .text-slate-800 { color: #334155; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8pt; color: #555; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info" style="text-align: right;">
            <div class="subtitle" style="margin-bottom: 8px; font-size: 14pt; color: #003366; font-weight: bold;">ESTADO DE CUENTA</div>
            <div><strong>Cliente:</strong> ${customer.name}</div>
            ${customer.rncCedula ? `<div><strong>RNC/Cédula:</strong> ${customer.rncCedula}</div>` : ''}
            <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
          </div>
        </div>

        <h4 style="margin-top: 20px; color: #003366; border-bottom: 2px solid #003366; padding-bottom: 5px; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.5px;">Detalle de Historial de Cobros y Abonos</h4>
        <table>
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th>Fecha</th>
              <th>Recibo</th>
              <th>Factura / NCF</th>
              <th>Método de Pago</th>
              <th class="text-right">Monto Factura</th>
              <th class="text-right">Abono</th>
              <th class="text-right" style="color: #dc3545;">Restante</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
          </tbody>
        </table>

        <div class="footer" style="margin-top: 50px;">
          Documento Informativo - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderSupplierAPStatement(data: any): string {
    const { company, supplier, items, totalBalance } = data;
    const css = this.getBaseCss('carta');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="margin-left: -20px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml ? '' : `<div class="title">${company.name}</div>`;

    const formatNum = (val: number) => {
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const linesHtml = items.map((item: any) => {
      const isOverdue = new Date(item.dueDate) < new Date();

      const formattedIssueDate = (() => {
        if (!item.issueDate) return '-';
        const parts = item.issueDate.split('-');
        if (parts.length !== 3) return item.issueDate;
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
      })();

      const formattedDueDate = (() => {
        if (!item.dueDate) return '-';
        const parts = item.dueDate.split('-');
        if (parts.length !== 3) return item.dueDate;
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
      })();

      return `
        <tr>
          <td class="font-mono">${item.apId.slice(0, 8).toUpperCase()}</td>
          <td>${item.ncf || 'S/N'}</td>
          <td>${formattedIssueDate}</td>
          <td>${formattedDueDate}</td>
          <td class="text-right font-mono">$${formatNum(item.amount)}</td>
          <td class="text-right font-mono" style="font-weight: bold; color: #dc3545;">$${formatNum(item.balance)}</td>
          <td>
            <span style="padding: 2px 6px; border-radius: 4px; font-size: 8pt; font-weight: bold; background-color: ${isOverdue ? '#fce8e6' : '#e6f4ea'}; color: ${isOverdue ? '#c5221f' : '#137333'};">
              ${isOverdue ? 'Vencido' : 'Pendiente'}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Cuentas por Pagar - ${supplier.name}</title>
        <style>
          ${css}
          .font-mono { font-family: monospace; }
          .font-semibold { font-weight: 600; }
          .text-slate-800 { color: #334155; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8pt; color: #555; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info" style="text-align: right;">
            <div class="subtitle" style="margin-bottom: 8px; font-size: 14pt; color: #003366; font-weight: bold;">ESTADO DE CUENTAS POR PAGAR</div>
            <div><strong>Proveedor:</strong> ${supplier.name}</div>
            ${supplier.rnc ? `<div><strong>RNC:</strong> ${supplier.rnc}</div>` : ''}
            <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
            <div style="margin-top: 8px; font-size: 11pt; font-weight: bold; color: #dc3545;">Total Pendiente: $${formatNum(totalBalance)}</div>
          </div>
        </div>

        <h4 style="margin-top: 20px; color: #003366; border-bottom: 2px solid #003366; padding-bottom: 5px; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.5px;">Detalle de Cuentas por Pagar Pendientes</h4>
        <table>
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th>Referencia CXP</th>
              <th>Factura / NCF</th>
              <th>Emisión</th>
              <th>Vencimiento</th>
              <th class="text-right">Monto Original</th>
              <th class="text-right">Balance Pendiente</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
          </tbody>
        </table>

        <div class="footer" style="margin-top: 50px;">
          Documento Informativo - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderARStatement(data: any, asOf: string): string {
    const { company, customer, openItems, totalPending } = data;
    const css = this.getBaseCss('carta');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="margin-left: -20px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml ? '' : `<div class="title">${company.name}</div>`;

    const formatNum = (val: number) => {
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const linesHtml = openItems.map((item: any) => {
      const isOverdue = new Date(item.dueDate) < new Date();
      const invoiceLabel = item.codigoFactura || 'Factura';
      const ncfLabel = item.ncf ? ` / NCF: ${item.ncf}` : '';
      return `
        <tr>
          <td>${invoiceLabel}${ncfLabel}</td>
          <td>${new Date(item.date).toLocaleDateString('es-DO')}</td>
          <td>
            <span style="${isOverdue ? 'color: #dc3545; font-weight: bold;' : ''}">
              ${new Date(item.dueDate).toLocaleDateString('es-DO')}
            </span>
          </td>
          <td class="text-right font-mono">$${formatNum(Number(item.amount))}</td>
          <td class="text-right font-mono" style="font-weight: bold; color: #dc3545;">$${formatNum(Number(item.balance))}</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Estado de Cuentas por Cliente - ${customer.name}</title>
        <style>
          ${css}
          .font-mono { font-family: monospace; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8pt; color: #555; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info" style="text-align: right;">
            <div class="subtitle" style="margin-bottom: 8px; font-size: 14pt; color: #003366; font-weight: bold;">ESTADO DE CUENTAS POR CLIENTE</div>
            <div><strong>Cliente:</strong> ${customer.name}</div>
            ${customer.rncCedula ? `<div><strong>RNC/Cédula:</strong> ${customer.rncCedula}</div>` : ''}
            <div><strong>Fecha de Corte:</strong> ${new Date(asOf).toLocaleDateString('es-DO')}</div>
          </div>
        </div>

        <h4 style="margin-top: 20px; color: #003366; border-bottom: 2px solid #003366; padding-bottom: 5px; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.5px;">Facturas Pendientes y Balances Adeudados</h4>
        <table>
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th>Factura / NCF</th>
              <th>Fecha Emisión</th>
              <th>Fecha Vencimiento</th>
              <th class="text-right">Monto Original</th>
              <th class="text-right" style="color: #dc3545;">Balance Pendiente</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
          </tbody>
        </table>

        <div class="totals-container" style="margin-top: 20px;">
          <div class="totals">
            <table>
              <tr class="grand-total" style="border-top: 2px solid #003366; color: #dc3545;">
                <th>TOTAL PENDIENTE</th>
                <td class="text-right">$${formatNum(totalPending)}</td>
              </tr>
            </table>
          </div>
        </div>

        <div class="footer" style="margin-top: 60px;">
          Documento de Balance Pendiente - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderProductsList(data: any): string {
    const { company, items } = data;
    const css = this.getBaseCss('carta');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="margin-left: -20px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml ? '' : `<div class="title">${company.name}</div>`;

    const formatNum = (val: number | string) => {
      return Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const linesHtml = items.map((item: any) => {
      return `
        <tr>
          <td class="font-mono">${item.sku || 'N/A'}</td>
          <td class="font-semibold text-slate-800">${item.name}</td>
          <td style="text-transform: capitalize;">${item.unitOfMeasure}</td>
          <td class="text-right font-mono">$${formatNum(item.cost)}</td>
          <td class="text-right font-mono" style="font-weight: bold; color: #16a34a;">$${formatNum(item.price)}</td>
          <td class="text-center">
            <span style="padding: 2px 6px; border-radius: 4px; font-size: 8pt; font-weight: bold; background-color: ${item.status === 'active' ? '#e6f4ea' : '#f1f3f4'}; color: ${item.status === 'active' ? '#137333' : '#5f6368'};">
              ${item.status === 'active' ? 'Activo' : 'Inactivo'}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Catálogo de Productos</title>
        <style>
          ${css}
          .font-mono { font-family: monospace; }
          .font-semibold { font-weight: 600; }
          .text-slate-800 { color: #334155; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8pt; color: #555; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info" style="text-align: right;">
            <div class="subtitle" style="margin-bottom: 8px; font-size: 14pt; color: #003366; font-weight: bold;">CATÁLOGO DE PRODUCTOS</div>
            <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
            <div><strong>Total Productos:</strong> ${items.length}</div>
          </div>
        </div>

        <h4 style="margin-top: 20px; color: #003366; border-bottom: 2px solid #003366; padding-bottom: 5px; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.5px;">Listado de Productos y Precios</h4>
        <table>
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th>SKU / Código</th>
              <th>Nombre</th>
              <th>Medida</th>
              <th class="text-right">Costo</th>
              <th class="text-right">Precio Venta</th>
              <th class="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
          </tbody>
        </table>

        <div class="footer" style="margin-top: 50px;">
          Documento de Catálogo - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderSuppliersList(data: any): string {
    const { company, items } = data;
    const css = this.getBaseCss('carta');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="margin-left: -20px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml ? '' : `<div class="title">${company.name}</div>`;

    const linesHtml = items.map((item: any) => {
      return `
        <tr>
          <td class="font-semibold text-slate-800">${item.name}</td>
          <td class="font-mono">${item.rnc}</td>
          <td>${item.email || '-'}</td>
          <td>${item.phone || '-'}</td>
          <td style="font-size: 9pt;">${item.address || '-'}</td>
          <td class="text-center">
            <span style="padding: 2px 6px; border-radius: 4px; font-size: 8pt; font-weight: bold; background-color: ${item.status === 'active' ? '#e6f4ea' : '#f1f3f4'}; color: ${item.status === 'active' ? '#137333' : '#5f6368'};">
              ${item.status === 'active' ? 'Activo' : 'Inactivo'}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte de Suplidores</title>
        <style>
          ${css}
          .font-mono { font-family: monospace; }
          .font-semibold { font-weight: 600; }
          .text-slate-800 { color: #334155; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8pt; color: #555; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info" style="text-align: right;">
            <div class="subtitle" style="margin-bottom: 8px; font-size: 14pt; color: #003366; font-weight: bold;">DIRECTORIO DE SUPLIDORES</div>
            <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
            <div><strong>Total Suplidores:</strong> ${items.length}</div>
          </div>
        </div>

        <h4 style="margin-top: 20px; color: #003366; border-bottom: 2px solid #003366; padding-bottom: 5px; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.5px;">Listado de Proveedores Registrados</h4>
        <table>
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th>Suplidor / Empresa</th>
              <th>RNC</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th>Dirección</th>
              <th class="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
          </tbody>
        </table>

        <div class="footer" style="margin-top: 50px;">
          Directorio de Suplidores - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderCustomersList(data: any): string {
    const { company, items } = data;
    const css = this.getBaseCss('carta');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="margin-left: -20px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml ? '' : `<div class="title">${company.name}</div>`;

    const linesHtml = items.map((item: any) => {
      return `
        <tr>
          <td class="font-semibold text-slate-800">${item.name}</td>
          <td class="font-mono">${item.rncCedula || '-'}</td>
          <td>${item.email || '-'}</td>
          <td>${item.phone || '-'}</td>
          <td style="font-size: 9pt;">${item.address || '-'}</td>
          <td class="text-center">
            <span style="padding: 2px 6px; border-radius: 4px; font-size: 8pt; font-weight: bold; background-color: ${item.status === 'active' ? '#e6f4ea' : '#f1f3f4'}; color: ${item.status === 'active' ? '#137333' : '#5f6368'};">
              ${item.status === 'active' ? 'Activo' : 'Inactivo'}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte de Clientes</title>
        <style>
          ${css}
          .font-mono { font-family: monospace; }
          .font-semibold { font-weight: 600; }
          .text-slate-800 { color: #334155; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8pt; color: #555; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info" style="text-align: right;">
            <div class="subtitle" style="margin-bottom: 8px; font-size: 14pt; color: #003366; font-weight: bold;">DIRECTORIO DE CLIENTES</div>
            <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
            <div><strong>Total Clientes:</strong> ${items.length}</div>
          </div>
        </div>

        <h4 style="margin-top: 20px; color: #003366; border-bottom: 2px solid #003366; padding-bottom: 5px; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.5px;">Listado de Clientes Registrados</h4>
        <table>
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th>Cliente / Empresa</th>
              <th>RNC/Cédula</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th>Dirección</th>
              <th class="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
          </tbody>
        </table>

        <div class="footer" style="margin-top: 50px;">
          Directorio de Clientes - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderIncomeStatement(data: any, startDate: string, endDate: string): string {
    const { company, revenueAccounts, totalRevenue, costAccounts, totalCost, grossProfit, expenseAccounts, totalExpense, netIncome } = data;
    const css = this.getBaseCss('carta');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="margin-left: -20px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml ? '' : `<div class="title">${company.name}</div>`;

    const formatNum = (val: number) => {
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const renderAccountRows = (accounts: any[]) => {
      if (!accounts || accounts.length === 0) {
        return `<tr><td colspan="3" class="text-center text-slate-400 font-mono">Sin registros</td></tr>`;
      }
      return accounts.map(acc => `
        <tr>
          <td class="font-mono text-slate-500">${acc.code}</td>
          <td>${acc.name}</td>
          <td class="text-right font-mono">$${formatNum(Number(acc.balance ?? acc.net ?? 0))}</td>
        </tr>
      `).join('');
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Estado de Resultados - ${company.name}</title>
        <style>
          ${css}
          .font-mono { font-family: monospace; }
          .section-title { font-weight: bold; font-size: 11pt; color: #003366; background-color: #f1f5f9; padding: 6px 10px; margin-top: 15px; border-left: 3px solid #003366; }
          .summary-row { font-weight: bold; background-color: #fafafa; border-top: 1.5px solid #e2e8f0; }
          .grand-total-section { border-top: 2px double #003366; border-bottom: 2px double #003366; background-color: #f8fafc; font-size: 11pt; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8pt; color: #555; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info" style="text-align: right;">
            <div class="subtitle" style="margin-bottom: 8px; font-size: 14pt; color: #003366; font-weight: bold;">ESTADO DE RESULTADOS</div>
            <div><strong>Periodo:</strong> Desde ${new Date(startDate).toLocaleDateString('es-DO')} Hasta ${new Date(endDate).toLocaleDateString('es-DO')}</div>
            <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
          </div>
        </div>

        <!-- INGRESOS -->
        <div class="section-title">INGRESOS</div>
        <table>
          <thead>
            <tr>
              <th style="width: 100px;">Código</th>
              <th>Cuenta / Descripción</th>
              <th class="text-right" style="width: 150px;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${renderAccountRows(revenueAccounts)}
            <tr class="summary-row">
              <td></td>
              <td>TOTAL INGRESOS</td>
              <td class="text-right font-mono">$${formatNum(totalRevenue)}</td>
            </tr>
          </tbody>
        </table>

        <!-- COSTOS -->
        <div class="section-title">COSTOS DE VENTA</div>
        <table>
          <thead>
            <tr>
              <th style="width: 100px;">Código</th>
              <th>Cuenta / Descripción</th>
              <th class="text-right" style="width: 150px;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${renderAccountRows(costAccounts)}
            <tr class="summary-row">
              <td></td>
              <td>TOTAL COSTOS DE VENTA</td>
              <td class="text-right font-mono">$${formatNum(totalCost)}</td>
            </tr>
          </tbody>
        </table>

        <!-- UTILIDAD BRUTA -->
        <table style="margin-top: 10px;">
          <tbody>
            <tr class="grand-total-section">
              <td style="width: 100px;"></td>
              <td>UTILIDAD BRUTA (Ingresos - Costos)</td>
              <td class="text-right font-mono" style="color: #003366;">$${formatNum(grossProfit)}</td>
            </tr>
          </tbody>
        </table>

        <!-- GASTOS OPERATIVOS -->
        <div class="section-title">GASTOS OPERATIVOS</div>
        <table>
          <thead>
            <tr>
              <th style="width: 100px;">Código</th>
              <th>Cuenta / Descripción</th>
              <th class="text-right" style="width: 150px;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${renderAccountRows(expenseAccounts)}
            <tr class="summary-row">
              <td></td>
              <td>TOTAL GASTOS OPERATIVOS</td>
              <td class="text-right font-mono">$${formatNum(totalExpense)}</td>
            </tr>
          </tbody>
        </table>

        <!-- UTILIDAD NETA -->
        <table style="margin-top: 15px; margin-bottom: 40px;">
          <tbody>
            <tr class="grand-total-section" style="background-color: #f0fdf4; border-top: 2px double #1e7e34; border-bottom: 2px double #1e7e34;">
              <td style="width: 100px;"></td>
              <td style="color: #1e7e34;">UTILIDAD NETA DEL PERIODO</td>
              <td class="text-right font-mono" style="color: #1e7e34; font-size: 12pt;">$${formatNum(netIncome)}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          Estado Financiero de Resultados - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderBalanceSheet(data: any, asOf: string): string {
    const { company, assetAccounts, totalAsset, liabilityAccounts, totalLiability, equityAccounts, totalEquity } = data;
    const css = this.getBaseCss('carta');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="margin-left: -20px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml ? '' : `<div class="title">${company.name}</div>`;

    const formatNum = (val: number) => {
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const renderAccountRows = (accounts: any[]) => {
      if (!accounts || accounts.length === 0) {
        return `<tr><td colspan="3" class="text-center text-slate-400 font-mono">Sin registros</td></tr>`;
      }
      return accounts.map(acc => `
        <tr>
          <td class="font-mono text-slate-500">${acc.code}</td>
          <td>${acc.name}</td>
          <td class="text-right font-mono">$${formatNum(Number(acc.balance ?? acc.net ?? 0))}</td>
        </tr>
      `).join('');
    };

    const totalLE = totalLiability + totalEquity;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Balance General - ${company.name}</title>
        <style>
          ${css}
          .font-mono { font-family: monospace; }
          .section-title { font-weight: bold; font-size: 11pt; color: #003366; background-color: #f1f5f9; padding: 6px 10px; margin-top: 15px; border-left: 3px solid #003366; }
          .summary-row { font-weight: bold; background-color: #fafafa; border-top: 1.5px solid #e2e8f0; }
          .grand-total-section { border-top: 2px double #003366; border-bottom: 2px double #003366; background-color: #f8fafc; font-size: 11pt; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8pt; color: #555; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info" style="text-align: right;">
            <div class="subtitle" style="margin-bottom: 8px; font-size: 14pt; color: #003366; font-weight: bold;">BALANCE GENERAL</div>
            <div><strong>Corte Al:</strong> ${new Date(asOf).toLocaleDateString('es-DO')}</div>
            <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
          </div>
        </div>

        <!-- ACTIVOS -->
        <div class="section-title">ACTIVOS</div>
        <table>
          <thead>
            <tr>
              <th style="width: 100px;">Código</th>
              <th>Cuenta / Descripción</th>
              <th class="text-right" style="width: 150px;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${renderAccountRows(assetAccounts)}
            <tr class="summary-row">
              <td></td>
              <td>TOTAL ACTIVOS</td>
              <td class="text-right font-mono" style="color: #003366;">$${formatNum(totalAsset)}</td>
            </tr>
          </tbody>
        </table>

        <!-- PASIVOS -->
        <div class="section-title">PASIVOS</div>
        <table>
          <thead>
            <tr>
              <th style="width: 100px;">Código</th>
              <th>Cuenta / Descripción</th>
              <th class="text-right" style="width: 150px;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${renderAccountRows(liabilityAccounts)}
            <tr class="summary-row">
              <td></td>
              <td>TOTAL PASIVOS</td>
              <td class="text-right font-mono">$${formatNum(totalLiability)}</td>
            </tr>
          </tbody>
        </table>

        <!-- CAPITAL -->
        <div class="section-title">CAPITAL / PATRIMONIO</div>
        <table>
          <thead>
            <tr>
              <th style="width: 100px;">Código</th>
              <th>Cuenta / Descripción</th>
              <th class="text-right" style="width: 150px;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${renderAccountRows(equityAccounts)}
            <tr class="summary-row">
              <td></td>
              <td>TOTAL CAPITAL</td>
              <td class="text-right font-mono">$${formatNum(totalEquity)}</td>
            </tr>
          </tbody>
        </table>

        <!-- PASIVO Y CAPITAL -->
        <table style="margin-top: 20px; margin-bottom: 40px;">
          <tbody>
            <tr class="grand-total-section" style="background-color: #f8fafc; border-top: 2px double #003366; border-bottom: 2px double #003366;">
              <td style="width: 100px;"></td>
              <td>TOTAL PASIVO Y CAPITAL</td>
              <td class="text-right font-mono" style="color: #003366; font-size: 11pt;">$${formatNum(totalLE)}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          Balance General Financiero - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderWindowBreakdown(data: { company: any; items: any[] }): string {
    const { company, items } = data;
    const currentDateStr = new Date().toLocaleDateString('es-DO');

    const padDots = (label: string, length: number) => {
      const dotsNeeded = length - label.length;
      return label + '.'.repeat(Math.max(0, dotsNeeded)) + ':';
    };

    // 1. Group by type and count
    const typeCounts: Record<string, number> = {};
    items.forEach(item => {
      const t = item.tipo || 'Desconocido';
      typeCounts[t] = (typeCounts[t] || 0) + (Number(item.cantidad) || 0);
    });

    // 2. Systems calculations
    const systems = ['Tradicional', 'P-65', 'P-92'];
    const systemsSummary = systems.map(sys => {
      const sysItems = items.filter(item => item.tipo === sys);
      const totalUnits = sysItems.reduce((acc, item) => acc + (Number(item.cantidad) || 0), 0);

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

      return {
        sys,
        totalUnits,
        hasItems: sysItems.length > 0,
        cabezalPies,
        llavinPies,
        rielPies,
        lateralPies,
        ruedas,
        cierres,
        gomaPies
      };
    });

    const logoHtml = company.logoUrl
      ? `<img class="logo" src="${company.logoUrl}" alt="Logo">`
      : '';

    const isLatinDoors = company.name.toLowerCase().includes('doors') || company.rnc === '132796845';
    const tel = company.phone || (isLatinDoors ? '1-829-214-4128' : '809-555-0199');
    const email = company.email || (isLatinDoors ? 'latindoors@gmail.com' : 'info@contfast.com');
    const dir = company.address || (isLatinDoors ? 'Hato del Yaque, Santiago R.D.' : 'Santo Domingo, R.D.');

    const formatPies = (val: number) => val > 0 ? `${val.toFixed(2)} pies` : '0.00 pies';
    const formatPiesCU = (val: number) => val > 0 ? `${val.toFixed(2)} pies c/u` : '0.00 pies c/u';

    const rowsHtml = items.map((item, index) => {
      let glassText = item.vidrio || '-';
      if (glassText.includes(' x ')) {
        glassText = glassText.replace(' x ', ' * ');
      }
      return `
        <tr>
          <td class="text-center font-mono">${index + 1}</td>
          <td class="text-center font-bold">${item.tipo || ''}</td>
          <td class="text-center font-mono font-bold">${item.cantidad}</td>
          <td class="text-center font-mono">${item.ancho} x ${item.altura}</td>
          <td class="text-center font-mono">${item.vias}</td>
          <td class="font-mono">${item.cabezal || '-'}</td>
          <td class="font-mono">${item.llavin || '-'}</td>
          <td class="font-mono">${item.riel || '-'}</td>
          <td class="font-mono">${item.lateral || '-'}</td>
          <td class="font-mono font-bold" style="color: #0f172a;">${glassText}</td>
        </tr>
      `;
    }).join('');

    const huecosHtml = Object.entries(typeCounts).map(([t, count]) => {
      return `
        <div class="hueco-item">
          <span class="hueco-label">${padDots(t, 25)}</span>
          <span class="hueco-value font-mono">${count} piezas</span>
        </div>
      `;
    }).join('');

    const systemsHtml = systemsSummary.map(s => {
      if (!s.hasItems) {
        return `
          <div class="system-card empty">
            <div class="system-card-header">${s.sys}</div>
            <div class="system-card-body" style="text-align: center; color: #94a3b8; padding: 20px 0;">
              No hay elementos en este sistema
            </div>
          </div>
        `;
      }

      const cabLabel = s.sys === 'Tradicional' ? 'Cabezal/Afeizal' : 'Cabezal';
      const rielLabel = 'Rieles (2/4 vías)';
      const latLabel = 'Laterales (2/4 vías)';

      return `
        <div class="system-card">
          <div class="system-card-header">${s.sys}</div>
          <div class="system-card-body">
            <div class="material-row">
              <span>${padDots(cabLabel, 18)}</span>
              <span class="font-mono font-bold">${s.sys === 'Tradicional' ? formatPiesCU(s.cabezalPies) : formatPies(s.cabezalPies)}</span>
            </div>
            <div class="material-row">
              <span>${padDots('Lavín/Enganche', 18)}</span>
              <span class="font-mono font-bold">${formatPiesCU(s.llavinPies)}</span>
            </div>
            <div class="material-row">
              <span>${padDots(rielLabel, 18)}</span>
              <span class="font-mono font-bold">${formatPiesCU(s.rielPies)}</span>
            </div>
            <div class="material-row">
              <span>${padDots(latLabel, 18)}</span>
              <span class="font-mono font-bold">${formatPies(s.lateralPies)}</span>
            </div>
            <div class="material-row">
              <span>${padDots('Ruedas', 18)}</span>
              <span class="font-mono font-bold">${s.ruedas} unidades</span>
            </div>
            <div class="material-row">
              <span>${padDots('Cierre de Centro', 18)}</span>
              <span class="font-mono font-bold">${s.cierres} unidades</span>
            </div>
            <div class="material-row">
              <span>${padDots('Goma', 18)}</span>
              <span class="font-mono font-bold">${formatPies(s.gomaPies)}</span>
            </div>
            <div class="system-card-footer font-bold">
              Total unidades: ${s.totalUnits}
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Desglose de Ventanas</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
          
          @page {
            size: letter landscape;
            margin: 10mm 0 10mm 25mm;
          }
          
          body {
            font-family: 'Inter', Helvetica, Arial, sans-serif;
            font-size: 8.5pt;
            color: #1e293b;
            margin: 0;
            padding: 0;
            background-color: #ffffff;
            -webkit-print-color-adjust: exact;
          }
          
          .top-bar {
            height: 6px;
            background: linear-gradient(90deg, #002244 0%, #005E6A 50%, #C5A059 100%);
            width: 100%;
            margin-bottom: 15px;
          }
          
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 15px;
          }
          
          .logo {
            max-height: 55px;
            max-width: 200px;
            object-fit: contain;
            margin-bottom: 8px;
            margin-left: -3px;
          }
          
          .company-info {
            font-family: monospace;
            font-size: 8.5pt;
            line-height: 1.4;
            color: #475569;
          }
          
          .doc-info {
            text-align: right;
          }
          
          .doc-title {
            font-size: 16pt;
            font-weight: 800;
            color: #002244;
            margin: 0 0 4px 0;
            letter-spacing: -0.5px;
          }
          
          .doc-subtitle {
            font-size: 10pt;
            font-weight: 600;
            color: #005E6A;
            margin: 0 0 2px 0;
            text-transform: uppercase;
          }
          
          .doc-meta {
            font-size: 8.5pt;
            color: #64748b;
          }
          
          .section-banner {
            color: #000000;
            text-align: center;
            font-weight: 700;
            font-size: 9.5pt;
            padding: 6px 0;
            letter-spacing: 1px;
            text-transform: uppercase;
            margin-bottom: 12px;
            border-bottom: 1px solid #e2e8f0;
          }
          
          .desglose-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          
          .desglose-table th {
            background-color: #005E6A;
            color: #ffffff;
            font-weight: 700;
            font-size: 8pt;
            padding: 6px 4px;
            text-align: left;
            border: 1px solid #004d57;
            text-transform: uppercase;
          }
          
          .desglose-table th.text-center, .desglose-table td.text-center {
            text-align: center;
          }
          
          .desglose-table td {
            font-size: 8pt;
            padding: 6px 4px;
            border: 1px solid #e2e8f0;
            color: #334155;
          }
          
          .desglose-table tr:nth-child(even) td {
            background-color: #f8fafc;
          }
          
          .summary-section {
            display: flex;
            gap: 20px;
            margin-top: 20px;
            page-break-inside: avoid;
          }
          
          .huecos-card {
            flex: 1;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 12px;
            background-color: #f8fafc;
          }
          
          .card-title {
            font-size: 9pt;
            font-weight: 700;
            color: #002244;
            border-bottom: 2px solid #005E6A;
            padding-bottom: 6px;
            margin-bottom: 10px;
            text-transform: uppercase;
            text-align: center;
          }
          
          .hueco-item {
            display: flex;
            justify-content: space-between;
            font-family: monospace;
            font-size: 8.5pt;
            margin-bottom: 6px;
            color: #334155;
          }
          
          .hueco-label {
            color: #64748b;
          }
          
          .hueco-value {
            font-weight: bold;
            color: #0f172a;
          }
          
          .systems-container {
            flex: 3;
            display: flex;
            gap: 12px;
          }
          
          .system-card {
            flex: 1;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            background-color: #ffffff;
          }
          
          .system-card.empty {
            background-color: #f8fafc;
            border-style: dashed;
          }
          
          .system-card-header {
            background-color: #005E6A;
            color: #ffffff;
            font-weight: 700;
            font-size: 9pt;
            padding: 6px;
            text-align: center;
            text-transform: uppercase;
          }
          
          .system-card-body {
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 5px;
            flex-grow: 1;
          }
          
          .material-row {
            display: flex;
            justify-content: space-between;
            font-family: monospace;
            font-size: 8pt;
            color: #475569;
          }
          
          .material-row span:first-child {
            color: #64748b;
          }
          
          .system-card-footer {
            margin-top: auto;
            border-top: 1px solid #f1f5f9;
            padding-top: 6px;
            font-size: 8pt;
            color: #0f172a;
            text-align: right;
          }
          
          .footer-signature {
            margin-top: 40px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            page-break-inside: avoid;
          }
          
          .signature-box {
            width: 200px;
            text-align: center;
            font-size: 8pt;
            color: #64748b;
          }
          
          .signature-line {
            border-top: 1px solid #94a3b8;
            margin-bottom: 4px;
          }
          
          .footer-note {
            text-align: center;
            font-size: 7.5pt;
            color: #94a3b8;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="top-bar"></div>
        
        <div class="header-container">
          <div>
            ${logoHtml}
            <div class="company-info">
              RNC.........: ${company.rnc || 'N/A'}<br>
              Teléfono....: ${tel}<br>
              Email.......: ${email}<br>
              Dirección...: ${dir}
            </div>
          </div>
          <div class="doc-info">
            <h2 class="doc-subtitle">PRODUCCIÓN Y CORTE</h2>
            <h1 class="doc-title">Desglose Ventanas</h1>
            <div class="doc-meta">
              Lote Interno / Control de Producción<br>
              Fecha: <strong>${currentDateStr}</strong>
            </div>
          </div>
        </div>
        
        <div class="section-banner">
          DETALLES DE CORTE Y MATERIALES
        </div>
        
        <table class="desglose-table">
          <thead>
            <tr>
              <th class="text-center" style="width: 3%;">#</th>
              <th class="text-center" style="width: 8%;">Tipo</th>
              <th class="text-center" style="width: 5%;">Cant</th>
              <th class="text-center" style="width: 12%;">Medida Base</th>
              <th class="text-center" style="width: 5%;">Vías</th>
              <th style="width: 15%;">Afel/Cabezal</th>
              <th style="width: 15%;">Llavin/Enganche</th>
              <th style="width: 12%;">Rieles</th>
              <th style="width: 12%;">Laterales</th>
              <th style="width: 13%;">Vidrio (A x H)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        
        <div class="summary-section">
          <div class="huecos-card">
            <div class="card-title">No. Hueco Por Tipo</div>
            ${huecosHtml}
          </div>
          
          <div class="systems-container">
            ${systemsHtml}
          </div>
        </div>
        
        <div class="footer-signature">
          <div class="signature-box">
            <div class="signature-line"></div>
            Preparado por
          </div>
          <div class="signature-box">
            <div class="signature-line"></div>
            Recibido por (Taller)
          </div>
        </div>
        
        <div class="footer-note">
          Reporte Técnico de Producción - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderPurchase(data: any): string {
    const { company, supplier, purchase, lines } = data;
    const css = this.getBaseCss('carta');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="max-height: 80px; margin-left: -24px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml ? '' : `<div class="title">${company.name}</div>`;

    const formatNum = (val: number | string) => {
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? '0.00' : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const paymentMethods: Record<string, string> = {
      '01': 'Efectivo',
      '02': 'Cheque/Transferencia/Depósito',
      '03': 'Tarjeta de Crédito/Débito',
      '04': 'Compra a Crédito',
      '05': 'Permuta',
      '06': 'Nota de Crédito',
      '07': 'Mixto'
    };

    const expenseTypes: Record<string, string> = {
      '01': 'Gastos de Personal',
      '02': 'Gastos por Trabajos, Suministros y Servicios',
      '03': 'Arrendamientos',
      '04': 'Gastos de Activos Fijos',
      '05': 'Gastos de Representación',
      '06': 'Otras Deducciones Admitidas',
      '07': 'Gastos Financieros',
      '08': 'Gastos Extraordinarios',
      '09': 'Compras y Gastos que formarán parte del Costo de Venta',
      '10': 'Adquisiciones de Activos'
    };

    const linesHtml = lines.map((line: any) => {
      const qty = parseFloat(line.quantity) || 0;
      const cost = parseFloat(line.unitCost) || 0;
      const sub = parseFloat(line.subtotal) || (qty * cost);
      const itbis = parseFloat(line.itbis) || 0;
      const total = parseFloat(line.total) || (sub + itbis);

      return `
        <tr>
          <td>${line.description}</td>
          <td class="text-center">${qty}</td>
          <td class="text-right">$${formatNum(cost)}</td>
          <td class="text-right" style="color: #059669;">$${formatNum(itbis)}</td>
          <td class="text-right" style="font-weight: bold;">$${formatNum(total)}</td>
        </tr>
      `;
    }).join('');

    const subtotal = parseFloat(purchase.amount) || 0;
    const itbisVal = parseFloat(purchase.itbis) || 0;
    const iscVal = parseFloat(purchase.isc) || 0;
    const otherTaxesVal = parseFloat(purchase.otherTaxes) || 0;
    const tipVal = parseFloat(purchase.tip) || 0;
    const totalVal = subtotal + itbisVal + iscVal + otherTaxesVal + tipVal;

    const issueDateStr = new Date(purchase.issueDate).toLocaleDateString('es-DO');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Comprobante de Compra - ${purchase.id.slice(0, 8).toUpperCase()}</title>
        <style>
          ${css}
          .font-mono { font-family: monospace; }
          .font-bold { font-weight: bold; }
          .text-emerald { color: #059669; }
          .section-title {
            color: #003366;
            border-bottom: 2px solid #003366;
            padding-bottom: 4px;
            margin-top: 20px;
            font-size: 11pt;
            text-transform: uppercase;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8.5pt; color: #475569; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div class="font-bold" style="font-size: 11pt; color: #0f172a; margin-bottom: 4px;">${company.name}</div>
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info" style="text-align: right; font-size: 9pt; line-height: 1.4;">
            <div class="subtitle" style="margin-bottom: 8px; font-size: 13pt; color: #003366; font-weight: bold;">COMPROBANTE DE COMPRA</div>
            <div><strong>Referencia:</strong> <span class="font-mono">${purchase.id.toUpperCase()}</span></div>
            <div><strong>NCF:</strong> <span class="font-mono" style="font-weight: bold; font-size: 10.5pt; color: #0f172a;">${purchase.ncf || 'N/A'}</span></div>
            <div><strong>Tipo:</strong> ${expenseTypes[purchase.expenseType] || purchase.expenseType || 'N/A'}</div>
            <div><strong>Fecha Emisión:</strong> ${issueDateStr}</div>
            <div><strong>Método Pago:</strong> ${paymentMethods[purchase.paymentMethod] || purchase.paymentMethod || 'Otros'}</div>
          </div>
        </div>

        <div class="info-grid">
          <div class="box">
            <div class="box-title">INFORMACIÓN DEL PROVEEDOR</div>
            <div style="line-height: 1.5; font-size: 9pt;">
              ${purchase.isMinorExpense ? `
                <strong>Proveedor Informal / Caja Chica</strong>
              ` : `
                <strong>${supplier?.name || 'N/A'}</strong><br>
                RNC/Cedula: ${supplier?.rnc || 'N/A'}<br>
                ${supplier?.address ? `Dirección: ${supplier.address}` : ''}
              `}
            </div>
          </div>
          <div class="box">
            <div class="box-title">INFORMACIÓN DE ENTREGA / ALMACÉN</div>
            <div style="line-height: 1.5; font-size: 9pt;">
              Almacén Destino: <strong>${purchase.warehouseName || 'No afecta inventario'}</strong><br>
              ${purchase.description ? `Descripción: <em>${purchase.description}</em>` : ''}
            </div>
          </div>
        </div>

        <div class="section-title">Detalle de Artículos / Servicios</div>
        <table>
          <thead>
            <tr>
              <th>Descripción</th>
              <th class="text-center" style="width: 10%;">Cant</th>
              <th class="text-right" style="width: 15%;">Costo Unit.</th>
              <th class="text-right" style="width: 15%;">ITBIS</th>
              <th class="text-right" style="width: 18%;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml || `<tr><td colspan="5" class="text-center">No hay líneas en este comprobante</td></tr>`}
          </tbody>
        </table>

        <div class="totals-container">
          <div class="totals">
            <table style="width: 100%; font-size: 9.5pt;">
              <tr>
                <td>Subtotal:</td>
                <td class="text-right font-mono">$${formatNum(subtotal)}</td>
              </tr>
              <tr>
                <td>ITBIS Soportado:</td>
                <td class="text-right font-mono text-emerald">$${formatNum(itbisVal)}</td>
              </tr>
              ${iscVal > 0 ? `
              <tr>
                <td>ISC:</td>
                <td class="text-right font-mono">$${formatNum(iscVal)}</td>
              </tr>
              ` : ''}
              ${otherTaxesVal > 0 ? `
              <tr>
                <td>Otros Impuestos:</td>
                <td class="text-right font-mono">$${formatNum(otherTaxesVal)}</td>
              </tr>
              ` : ''}
              ${tipVal > 0 ? `
              <tr>
                <td>Propina Legal (10%):</td>
                <td class="text-right font-mono">$${formatNum(tipVal)}</td>
              </tr>
              ` : ''}
              <tr class="grand-total">
                <td style="font-weight: bold; padding-top: 8px;">TOTAL GENERAL:</td>
                <td class="text-right font-mono" style="font-weight: bold; padding-top: 8px; font-size: 11pt; color: #0f172a;">$${formatNum(totalVal)}</td>
              </tr>
            </table>
          </div>
        </div>

        <div class="footer" style="margin-top: 60px;">
          Comprobante de Compra Interno - ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderPurchasesReport(data: any): string {
    const { company, items, filters } = data;
    const css = this.getBaseCss('carta');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="max-height: 80px; margin-left: -24px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml
      ? ''
      : `<div class="font-bold" style="font-size: 11pt; color: #0f172a; margin-bottom: 4px;">${company.name}</div>`;

    const formatNum = (val: number | string) => {
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? '0.00' : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    let totalAmount = 0;
    let totalItbis = 0;
    let totalTaxed = 0;

    const linesHtml = items.map((item: any, idx: number) => {
      const amount = parseFloat(item.amount) || 0;
      const itbis = parseFloat(item.itbis) || 0;
      const total = amount + itbis + (parseFloat(item.isc) || 0) + (parseFloat(item.otherTaxes) || 0);

      totalAmount += total;
      totalItbis += itbis;
      totalTaxed += amount;

      const supplierName = item.isMinorExpense ? 'Gastos Menores / Caja Chica' : (item.supplierName || 'N/A');
      const supplierRnc = item.supplierRnc ? ` (${item.supplierRnc})` : '';

      return `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td class="ellipsis">
            <strong>${supplierName}</strong>${supplierRnc}
          </td>
          <td class="font-mono text-center">${item.ncf || '-'}</td>
          <td class="text-center">${new Date(item.issueDate).toLocaleDateString('es-DO')}</td>
          <td class="text-right font-mono">$${formatNum(amount)}</td>
          <td class="text-right font-mono" style="color: #059669;">$${formatNum(itbis)}</td>
          <td class="text-right font-mono font-bold">$${formatNum(total)}</td>
        </tr>
      `;
    }).join('');

    const formatRangeDate = (dateStr: string) => {
      if (!dateStr || dateStr === 'Inicio' || dateStr === 'Hoy') return dateStr;
      const parts = dateStr.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return dateStr;
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte de Compras y Gastos</title>
        <style>
          ${css}
          .font-mono { font-family: monospace; }
          .font-bold { font-weight: bold; }
          .text-emerald { color: #059669; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { 
            padding: 3px 5px !important; 
            font-size: 7.5pt !important; 
            white-space: nowrap !important;
          }
          th { background-color: #003366; color: white; font-weight: bold; text-transform: uppercase; font-size: 8pt !important; }
          .ellipsis {
            max-width: 320px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8.5pt; color: #475569; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info" style="text-align: right; font-size: 9pt; line-height: 1.4;">
            <div class="subtitle" style="margin-bottom: 8px; font-size: 13pt; color: #003366; font-weight: bold;">REPORTE DE COMPRAS Y GASTOS</div>
            <div><strong>Rango:</strong> ${formatRangeDate(filters.startDate)} al ${formatRangeDate(filters.endDate)}</div>
            <div><strong>Tipo:</strong> ${filters.type === 'purchases' ? 'Compras Comerciales' : filters.type === 'expenses' ? 'Gastos Menores' : 'Todos'}</div>
            <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
            <div style="font-size: 11pt; font-weight: bold; margin-top: 5px; color: #003366;">Total Lote: $${formatNum(totalAmount)}</div>
          </div>
        </div>

        <table style="width: 100%; margin-top: 20px;">
          <thead>
            <tr>
              <th class="text-center" style="width: 5%;">#</th>
              <th>Suplidor / Proveedor</th>
              <th class="text-center" style="width: 18%;">NCF</th>
              <th class="text-center" style="width: 12%;">Fecha</th>
              <th class="text-right" style="width: 12%;">Subtotal</th>
              <th class="text-right" style="width: 12%;">ITBIS</th>
              <th class="text-right" style="width: 15%;">Total Neto</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml || '<tr><td colspan="7" class="text-center">No se encontraron compras/gastos en el rango</td></tr>'}
          </tbody>
        </table>

        <div class="totals-container" style="margin-top: 20px;">
          <div class="totals">
            <table style="width: 100%; font-size: 9.5pt;">
              <tr>
                <td>Subtotal Total:</td>
                <td class="text-right font-mono">$${formatNum(totalTaxed)}</td>
              </tr>
              <tr>
                <td>ITBIS Total:</td>
                <td class="text-right font-mono text-emerald">$${formatNum(totalItbis)}</td>
              </tr>
              <tr class="grand-total">
                <td style="font-weight: bold; padding-top: 8px;">TOTAL GENERAL:</td>
                <td class="text-right font-mono" style="font-weight: bold; padding-top: 8px; font-size: 11pt; color: #0f172a;">$${formatNum(totalAmount)}</td>
              </tr>
            </table>
          </div>
        </div>

        <div class="footer" style="margin-top: 60px;">
          Reporte de Compras - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderGuaranteeChecksReport(data: any): string {
    const { company, pendingChecks, appliedChecks, filters } = data;
    const css = this.getBaseCss('carta');

    const isLatinDoors = company.name.toLowerCase().includes('doors') || company.rnc === '132796845';
    const displayPhone = company.phone || (isLatinDoors ? '1-829-214-4128' : '809-555-0199');
    const displayAddress = company.address || (isLatinDoors ? 'Hato del Yaque, Santiago R.D.' : 'Santo Domingo, R.D.');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="max-height: 80px; margin-left: -24px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml
      ? ''
      : `<div class="font-bold" style="font-size: 11pt; color: #0f172a; margin-bottom: 4px;">${company.name}</div>`;

    const formatNum = (val: number | string) => {
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? '0.00' : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatDateStr = (dateStr: string | null | undefined) => {
      if (!dateStr) return '-';
      const parts = dateStr.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return dateStr;
    };

    const pendingRowsHtml = pendingChecks.map((p: any, idx: number) => `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td><strong>${p.supplierName}</strong></td>
        <td class="font-mono text-center">${p.checkNumber || 'S/N'}</td>
        <td class="text-center">${formatDateStr(p.paymentDate)}</td>
        <td class="text-center font-bold" style="color: #b45309;">${formatDateStr(p.dueDate)}</td>
        <td class="text-right font-mono">RD$ ${formatNum(p.amount)}</td>
      </tr>
    `).join('');

    const appliedRowsHtml = appliedChecks.map((p: any, idx: number) => `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td><strong>${p.supplierName}</strong></td>
        <td class="font-mono text-center">${p.checkNumber || 'S/N'}</td>
        <td class="text-center">${formatDateStr(p.paymentDate)}</td>
        <td class="text-center">${formatDateStr(p.dueDate)}</td>
        <td class="text-right font-mono" style="color: #047857;">RD$ ${formatNum(p.amount)}</td>
      </tr>
    `).join('');

    const totalPendingAmount = pendingChecks.reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);
    const totalAppliedAmount = appliedChecks.reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte de Cheques en Garantía</title>
        <style>
          ${css}
          .font-mono { font-family: monospace; }
          .font-bold { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { 
            padding: 5px 8px !important; 
            font-size: 8pt !important; 
            white-space: nowrap !important;
          }
          th { background-color: #003366; color: white; font-weight: bold; text-transform: uppercase; font-size: 8pt !important; }
          h3 { font-size: 11pt; color: #003366; margin-top: 25px; margin-bottom: 10px; border-bottom: 2px solid #003366; padding-bottom: 5px; text-transform: uppercase; }
          .total-box { display: flex; justify-content: flex-end; margin-top: 10px; margin-bottom: 20px; }
          .total-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; min-width: 180px; text-align: right; }
          .total-label { font-size: 7.5pt; color: #64748b; text-transform: uppercase; font-weight: bold; }
          .total-value { font-size: 11pt; font-weight: bold; color: #003366; font-family: monospace; margin-top: 2px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8.5pt; color: #475569; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            ${displayAddress ? `<div>${displayAddress}</div>` : ''}
            ${displayPhone ? `<div>Tel: ${displayPhone}</div>` : ''}
          </div>
          <div class="doc-info" style="text-align: right; font-size: 9pt; line-height: 1.4;">
            <div class="subtitle" style="margin-bottom: 8px; font-size: 13pt; color: #003366; font-weight: bold;">REPORTE DE CHEQUES EN GARANTÍA</div>
            <div><strong>Rango:</strong> ${formatDateStr(filters.startDate)} al ${formatDateStr(filters.endDate)}</div>
            <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
          </div>
        </div>

        <h3>1. Cheques Pendientes por Cobrar</h3>
        <table>
          <thead>
            <tr>
              <th class="text-center" style="width: 5%;">#</th>
              <th>Suplidor / Beneficiario</th>
              <th class="text-center" style="width: 15%;">Cheque #</th>
              <th class="text-center" style="width: 15%;">Fecha Emisión</th>
              <th class="text-center" style="width: 18%;">Fecha de Cobro</th>
              <th class="text-right" style="width: 18%;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${pendingRowsHtml || '<tr><td colspan="6" class="text-center" style="color: #64748b; font-style: italic; padding: 15px;">No hay cheques pendientes registrados en este rango.</td></tr>'}
          </tbody>
        </table>
        <div class="total-box">
          <div class="total-card">
            <div class="total-label">Total Pendientes</div>
            <div class="total-value">RD$ ${formatNum(totalPendingAmount)}</div>
          </div>
        </div>

        <h3>2. Historial de Cheques Aplicados</h3>
        <table>
          <thead>
            <tr>
              <th class="text-center" style="width: 5%;">#</th>
              <th>Suplidor / Beneficiario</th>
              <th class="text-center" style="width: 15%;">Cheque #</th>
              <th class="text-center" style="width: 15%;">Fecha Emisión</th>
              <th class="text-center" style="width: 18%;">Fecha Cobrado</th>
              <th class="text-right" style="width: 18%;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${appliedRowsHtml || '<tr><td colspan="6" class="text-center" style="color: #64748b; font-style: italic; padding: 15px;">No hay cheques aplicados registrados en este rango.</td></tr>'}
          </tbody>
        </table>
        <div class="total-box">
          <div class="total-card">
            <div class="total-label">Total Aplicados</div>
            <div class="total-value" style="color: #047857;">RD$ ${formatNum(totalAppliedAmount)}</div>
          </div>
        </div>

        <div class="footer" style="margin-top: 60px;">
          Reporte de Cheques en Garantía - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderInvoicesReport(data: any): string {
    const { company, items, filters } = data;
    const css = this.getBaseCss('carta');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="max-height: 80px; margin-left: -24px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml
      ? ''
      : `<div class="font-bold" style="font-size: 13pt; color: #0f172a; margin-bottom: 4px;">${company.name}</div>`;

    const formatNum = (val: number | string) => {
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? '0.00' : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    let totalSubtotal = 0;
    let totalDiscount = 0;
    let totalItbis = 0;
    let totalAmount = 0;

    const linesHtml = items.map((item: any, idx: number) => {
      const subtotal = parseFloat(item.subtotal) || 0;
      const discount = parseFloat(item.discount) || 0;
      const itbis = parseFloat(item.totalTaxes) || 0;
      const total = parseFloat(item.total) || 0;

      totalSubtotal += subtotal;
      totalDiscount += discount;
      totalItbis += itbis;
      totalAmount += total;

      const buyerName = item.buyerName || item.customerName || 'Consumidor Final';
      const buyerRnc = (item.buyerRnc || item.customerRnc) ? ` (${item.buyerRnc || item.customerRnc})` : '';

      return `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td class="ellipsis">
            <strong>${buyerName}</strong>${buyerRnc}
          </td>
          <td class="font-mono text-center">${item.ncf || '-'}</td>
          <td class="text-center">${new Date(item.createdAt).toLocaleDateString('es-DO')}</td>
          <td class="text-right font-mono">$${formatNum(subtotal)}</td>
          <td class="text-right font-mono" style="color: #ef4444;">$${formatNum(discount)}</td>
          <td class="text-right font-mono" style="color: #059669;">$${formatNum(itbis)}</td>
          <td class="text-right font-mono font-bold">$${formatNum(total)}</td>
        </tr>
      `;
    }).join('');

    const formatRangeDate = (dateStr: string) => {
      if (!dateStr || dateStr === 'Inicio' || dateStr === 'Hoy') return dateStr;
      const parts = dateStr.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return dateStr;
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte de Facturación (Ventas)</title>
        <style>
          ${css}
          .font-mono { font-family: monospace; }
          .font-bold { font-weight: bold; }
          .text-emerald { color: #059669; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { 
            padding: 3px 5px !important; 
            font-size: 7.5pt !important; 
            white-space: nowrap !important;
          }
          th { background-color: #003366; color: white; font-weight: bold; text-transform: uppercase; font-size: 8pt !important; }
          .ellipsis {
            max-width: 320px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8.5pt; color: #475569; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info" style="text-align: right; font-size: 9pt; line-height: 1.4;">
            <div class="subtitle" style="margin-bottom: 8px; font-size: 13pt; color: #003366; font-weight: bold;">REPORTE DE FACTURACIÓN (VENTAS)</div>
            <div><strong>Rango:</strong> ${formatRangeDate(filters.startDate)} al ${formatRangeDate(filters.endDate)}</div>
            <div><strong>Estado:</strong> ${filters.status === 'draft' ? 'Borrador' : filters.status === 'signed' ? 'Firmado' : filters.status === 'submitted' ? 'Transmitido' : filters.status === 'accepted' ? 'Aceptado DGII' : filters.status === 'rejected' ? 'Rechazado' : 'Todos'}</div>
            <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
            <div style="font-size: 11pt; font-weight: bold; margin-top: 5px; color: #003366;">Total Facturado: $${formatNum(totalAmount)}</div>
          </div>
        </div>

        <table style="width: 100%; margin-top: 20px;">
          <thead>
            <tr>
              <th class="text-center" style="width: 4%;">#</th>
              <th>Adquiriente / Cliente</th>
              <th class="text-center" style="width: 18%;">NCF</th>
              <th class="text-center" style="width: 12%;">Fecha</th>
              <th class="text-right" style="width: 12%;">Subtotal</th>
              <th class="text-right" style="width: 12%;">Descuento</th>
              <th class="text-right" style="width: 12%;">ITBIS</th>
              <th class="text-right" style="width: 15%;">Total Neto</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml || '<tr><td colspan="8" class="text-center">No se encontraron facturas en el rango</td></tr>'}
          </tbody>
        </table>

        <div class="totals-container" style="margin-top: 20px;">
          <div class="totals">
            <table style="width: 100%; font-size: 9.5pt;">
              <tr>
                <td>Subtotal Facturado:</td>
                <td class="text-right font-mono">$${formatNum(totalSubtotal)}</td>
              </tr>
              <tr>
                <td>Descuentos Otorgados:</td>
                <td class="text-right font-mono" style="color: #ef4444;">$${formatNum(totalDiscount)}</td>
              </tr>
              <tr>
                <td>ITBIS Total:</td>
                <td class="text-right font-mono text-emerald">$${formatNum(totalItbis)}</td>
              </tr>
              <tr class="grand-total">
                <td style="font-weight: bold; padding-top: 8px;">TOTAL GENERAL:</td>
                <td class="text-right font-mono" style="font-weight: bold; padding-top: 8px; font-size: 11pt; color: #0f172a;">$${formatNum(totalAmount)}</td>
              </tr>
            </table>
          </div>
        </div>

        <div class="footer" style="margin-top: 60px;">
          Reporte de Facturación - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderSalesVsPurchases(data: any, startDate: string, endDate: string) {
    const { company, totalSales, totalPurchases, margin } = data;
    const formatNum = (num: any) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(num) || 0);
    const css = this.getBaseCss('carta');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="margin-left: -20px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml ? '' : `<div class="title">${company.name}</div>`;

    const marginColor = margin >= 0 ? '#10b981' : '#ef4444';
    const marginLabel = margin >= 0 ? 'Utilidad Bruta' : 'Déficit (Pérdida)';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte Compras vs Ventas</title>
        <style>
          ${css}
          body { padding: 20px; }
          .summary-cards { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 40px; }
          .card { flex: 1; padding: 20px; border-radius: 12px; text-align: center; border: 1px solid #e2e8f0; }
          .card-sales { background-color: #f0f9ff; border-color: #bae6fd; }
          .card-purchases { background-color: #fef2f2; border-color: #fecaca; }
          .card-margin { background-color: #f0fdf4; border-color: #bbf7d0; }
          .card-title { font-size: 12pt; font-weight: bold; margin-bottom: 10px; color: #475569; text-transform: uppercase; letter-spacing: 1px; }
          .card-value { font-size: 24pt; font-weight: 900; }
          .val-sales { color: #0369a1; }
          .val-purchases { color: #b91c1c; }
          .table-container { margin-top: 30px; }
          .footer { margin-top: 50px; text-align: center; font-size: 8.5pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8pt; color: #555; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info" style="text-align: right;">
            <div class="subtitle" style="margin-bottom: 8px; font-size: 14pt; color: #003366; font-weight: bold;">COMPRAS VS VENTAS</div>
            <div><strong>Periodo:</strong> Desde ${startDate} Hasta ${endDate}</div>
            <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
          </div>
        </div>

        <div class="summary-cards">
          <div class="card card-sales">
            <div class="card-title">Total Ventas</div>
            <div class="card-value val-sales">RD$ ${formatNum(totalSales)}</div>
          </div>
          <div class="card card-purchases">
            <div class="card-title">Total Compras / Gastos</div>
            <div class="card-value val-purchases">RD$ ${formatNum(totalPurchases)}</div>
          </div>
        </div>

        <div class="summary-cards" style="margin-top: -20px;">
          <div class="card card-margin" style="border-color: ${marginColor}40; background-color: ${marginColor}10;">
            <div class="card-title" style="color: ${marginColor}">${marginLabel}</div>
            <div class="card-value" style="color: ${marginColor}">RD$ ${formatNum(margin)}</div>
          </div>
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                <th class="text-right">Monto (RD$)</th>
                <th class="text-right">% del Total de Ventas</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Ingresos por Ventas</strong></td>
                <td class="text-right"><strong>${formatNum(totalSales)}</strong></td>
                <td class="text-right">100.00%</td>
              </tr>
              <tr>
                <td>Compras y Gastos</td>
                <td class="text-right" style="color: #ef4444;">- ${formatNum(totalPurchases)}</td>
                <td class="text-right">${totalSales > 0 ? ((totalPurchases / totalSales) * 100).toFixed(2) : '0.00'}%</td>
              </tr>
              <tr style="background-color: #f8fafc;">
                <td style="padding-top: 20px;"><strong>${marginLabel}</strong></td>
                <td class="text-right" style="padding-top: 20px; color: ${marginColor};"><strong>${formatNum(margin)}</strong></td>
                <td class="text-right" style="padding-top: 20px;"><strong>${totalSales > 0 ? ((margin / totalSales) * 100).toFixed(2) : '0.00'}%</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="footer">
          Reporte de Análisis Comparativo - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderCustomerFinancialStatement(data: any): string {
    const { company, customer, movements, summary } = data;
    const css = this.getBaseCss('carta');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="margin-left: -20px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml ? '' : `<div class="title">${company.name}</div>`;

    const formatNum = (val: number) => {
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const getMovementTypeLabel = (type: string) => {
      switch (type) {
        case 'invoice': return 'Factura';
        case 'receipt': return 'Recibo Cobro';
        case 'credit_note': return 'Nota de Crédito';
        case 'debit_note': return 'Nota de Débito';
        case 'retention': return 'Retención';
        case 'advance': return 'Anticipo';
        case 'void': return 'Anulación';
        default: return type.toUpperCase();
      }
    };

    const linesHtml = movements.map((m: any) => {
      const typeLabel = getMovementTypeLabel(m.movementType);
      return `
        <tr>
          <td>${new Date(m.date + 'T00:00:00').toLocaleDateString('es-DO')}</td>
          <td class="font-mono">${m.documentNumber}</td>
          <td><span style="font-weight: 600;">${typeLabel}</span></td>
          <td style="font-size: 8pt; color: #555;">${m.notes || ''}</td>
          <td class="text-right font-mono" style="${m.debit > 0 ? 'color: #003366;' : ''}">${m.debit > 0 ? '$' + formatNum(m.debit) : '-'}</td>
          <td class="text-right font-mono" style="${m.credit > 0 ? 'color: #1e7e34;' : ''}">${m.credit > 0 ? '$' + formatNum(m.credit) : '-'}</td>
          <td class="text-right font-mono" style="font-weight: bold; color: ${m.balance > 0 ? '#b07b1d' : '#1e7e34'};">$${formatNum(m.balance)}</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Estado de Cuenta Histórico - ${customer.name}</title>
        <style>
          ${css}
          .font-mono { font-family: monospace; }
          .font-semibold { font-weight: 600; }
          .text-slate-800 { color: #334155; }
          .summary-card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 10px 15px;
            background-color: #f8fafc;
            display: inline-block;
            min-width: 150px;
            margin-right: 10px;
            margin-bottom: 10px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8pt; color: #555; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info" style="text-align: right;">
            <div class="subtitle" style="margin-bottom: 8px; font-size: 14pt; color: #003366; font-weight: bold;">ESTADO DE CUENTA (CLIENTE)</div>
            <div><strong>Cliente:</strong> ${customer.name}</div>
            ${customer.rncCedula ? `<div><strong>RNC/Cédula:</strong> ${customer.rncCedula}</div>` : ''}
            <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
            <div style="margin-top: 5px; font-weight: bold; color: #003366; font-size: 12pt;">Saldo Actual: $${formatNum(summary.currentBalance)}</div>
          </div>
        </div>

        <div style="margin-top: 25px; margin-bottom: 15px;">
          <div class="summary-card">
            <div style="font-size: 7.5pt; color: #555; text-transform: uppercase;">Total Facturado</div>
            <div style="font-size: 11pt; font-weight: bold; color: #003366;">$${formatNum(summary.totalInvoiced)}</div>
          </div>
          <div class="summary-card">
            <div style="font-size: 7.5pt; color: #555; text-transform: uppercase;">Total Cobrado</div>
            <div style="font-size: 11pt; font-weight: bold; color: #1e7e34;">$${formatNum(summary.totalPaid)}</div>
          </div>
          <div class="summary-card">
            <div style="font-size: 7.5pt; color: #555; text-transform: uppercase;">Notas de Crédito</div>
            <div style="font-size: 11pt; font-weight: bold; color: #ef4444;">$${formatNum(summary.totalCreditNotes)}</div>
          </div>
          <div class="summary-card">
            <div style="font-size: 7.5pt; color: #555; text-transform: uppercase;">Notas de Débito</div>
            <div style="font-size: 11pt; font-weight: bold; color: #003366;">$${formatNum(summary.totalDebitNotes)}</div>
          </div>
        </div>

        <h4 style="margin-top: 20px; color: #003366; border-bottom: 2px solid #003366; padding-bottom: 5px; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.5px;">Auxiliar de Movimientos Financieros</h4>
        <table>
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th>Fecha</th>
              <th>Documento</th>
              <th>Tipo</th>
              <th>Descripción</th>
              <th class="text-right">Débito (+)</th>
              <th class="text-right">Crédito (-)</th>
              <th class="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${movements.length === 0 ? '<tr><td colspan="7" class="text-center" style="padding: 20px; color: #555;">No existen movimientos para este período.</td></tr>' : linesHtml}
          </tbody>
        </table>

        <div class="footer" style="margin-top: 50px;">
          Documento Auxiliar de Cuenta de Cliente - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderSupplierFinancialStatement(data: any): string {
    const { company, supplier, movements, summary } = data;
    const css = this.getBaseCss('carta');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="margin-left: -20px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml ? '' : `<div class="title">${company.name}</div>`;

    const formatNum = (val: number) => {
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const getMovementTypeLabel = (type: string) => {
      switch (type) {
        case 'invoice': return 'Compra/Gasto';
        case 'payment': return 'Pago';
        case 'credit_note': return 'Nota de Crédito';
        case 'debit_note': return 'Nota de Débito';
        case 'retention': return 'Retención';
        case 'advance': return 'Anticipo';
        case 'void': return 'Anulación';
        default: return type.toUpperCase();
      }
    };

    const linesHtml = movements.map((m: any) => {
      const typeLabel = getMovementTypeLabel(m.movementType);
      return `
        <tr>
          <td>${new Date(m.date + 'T00:00:00').toLocaleDateString('es-DO')}</td>
          <td class="font-mono">${m.documentNumber}</td>
          <td><span style="font-weight: 600;">${typeLabel}</span></td>
          <td style="font-size: 8pt; color: #555;">${m.notes || ''}</td>
          <td class="text-right font-mono" style="${m.debit > 0 ? 'color: #1e7e34;' : ''}">${m.debit > 0 ? '$' + formatNum(m.debit) : '-'}</td>
          <td class="text-right font-mono" style="${m.credit > 0 ? 'color: #003366;' : ''}">${m.credit > 0 ? '$' + formatNum(m.credit) : '-'}</td>
          <td class="text-right font-mono" style="font-weight: bold; color: ${m.balance > 0 ? '#dc3545' : '#1e7e34'};">$${formatNum(m.balance)}</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Estado de Cuenta Histórico - ${supplier.name}</title>
        <style>
          ${css}
          .font-mono { font-family: monospace; }
          .font-semibold { font-weight: 600; }
          .text-slate-800 { color: #334155; }
          .summary-card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 10px 15px;
            background-color: #f8fafc;
            display: inline-block;
            min-width: 150px;
            margin-right: 10px;
            margin-bottom: 10px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info" style="font-size: 8pt; color: #555; line-height: 1.4;">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info" style="text-align: right;">
            <div class="subtitle" style="margin-bottom: 8px; font-size: 14pt; color: #003366; font-weight: bold;">ESTADO DE CUENTA (PROVEEDOR)</div>
            <div><strong>Proveedor:</strong> ${supplier.name}</div>
            ${supplier.rnc ? `<div><strong>RNC:</strong> ${supplier.rnc}</div>` : ''}
            <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
            <div style="margin-top: 5px; font-weight: bold; color: #dc3545; font-size: 12pt;">Balance Pendiente: $${formatNum(summary.currentBalance)}</div>
          </div>
        </div>

        <div style="margin-top: 25px; margin-bottom: 15px;">
          <div class="summary-card">
            <div style="font-size: 7.5pt; color: #555; text-transform: uppercase;">Total Comprado</div>
            <div style="font-size: 11pt; font-weight: bold; color: #003366;">$${formatNum(summary.totalPurchased)}</div>
          </div>
          <div class="summary-card">
            <div style="font-size: 7.5pt; color: #555; text-transform: uppercase;">Total Pagado</div>
            <div style="font-size: 11pt; font-weight: bold; color: #1e7e34;">$${formatNum(summary.totalPaid)}</div>
          </div>
          <div class="summary-card">
            <div style="font-size: 7.5pt; color: #555; text-transform: uppercase;">Notas de Crédito</div>
            <div style="font-size: 11pt; font-weight: bold; color: #1e7e34;">$${formatNum(summary.totalCreditNotes)}</div>
          </div>
          <div class="summary-card">
            <div style="font-size: 7.5pt; color: #555; text-transform: uppercase;">Notas de Débito</div>
            <div style="font-size: 11pt; font-weight: bold; color: #dc3545;">$${formatNum(summary.totalDebitNotes)}</div>
          </div>
        </div>

        <h4 style="margin-top: 20px; color: #003366; border-bottom: 2px solid #003366; padding-bottom: 5px; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.5px;">Auxiliar de Movimientos Financieros</h4>
        <table>
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th>Fecha</th>
              <th>Documento</th>
              <th>Tipo</th>
              <th>Descripción</th>
              <th class="text-right">Débito (-)</th>
              <th class="text-right">Crédito (+)</th>
              <th class="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${movements.length === 0 ? '<tr><td colspan="7" class="text-center" style="padding: 20px; color: #555;">No existen movimientos para este suplidor.</td></tr>' : linesHtml}
          </tbody>
        </table>

        <div class="footer" style="margin-top: 50px;">
          Documento Auxiliar de Cuenta de Suplidor - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }

  static renderSupplierOrder(data: any): string {
    const order = data.order || data;
    const company = data.company || {};
    const lines = data.lines || [];

    const padDots = (label: string, length: number) => {
      return label.padEnd(length, '.') + ':';
    };

    const ordDate = new Date(order.orderDate || new Date());
    const formattedDate = `${String(ordDate.getDate()).padStart(2, '0')}-${String(ordDate.getMonth() + 1).padStart(2, '0')}-${ordDate.getFullYear()}`;

    const totalQty = lines.reduce((acc: number, line: any) => acc + Number(line.quantityRequested || 0), 0);

    const conditions = order.generalConditions
      ? order.generalConditions.split('\n').filter((c: string) => c.trim().length > 0)
      : [
        'Este pedido está sujeto a disponibilidad y tiempos de producción.',
        'Confirmar cantidades y fecha de entrega.',
        'Cualquier cambio debe ser notificado por escrito.'
      ];

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" style="max-height: 85px; max-width: 250px; object-fit: contain; margin-left: -5px;" alt="Logo">`
      : `<div style="font-size: 20px; font-weight: bold; color: #002D62; margin-left: -5px;">${company.name || 'Latin Doors'}</div>`;

    const subTitleLogo = '';

    const statusLabel = order.status === 'Draft' ? 'Borrador' :
      order.status === 'Sent' ? 'Enviado' :
        order.status === 'Partial' ? 'Parcial' :
          order.status === 'Received' ? 'Recibido' : 'Cancelado';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Pedido ${order.orderNumber}</title>
        <style>
          @page {
            margin: 12mm 12mm 12mm 12mm;
          }
          body {
            font-family: 'Inter', Helvetica, Arial, sans-serif;
            font-size: 10pt;
            color: #333;
            margin: 0;
            padding: 0;
            line-height: 1.4;
          }
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 15px;
          }
          .logo-area {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
           
          }
        
          .company-info {
            font-family: monospace;
            font-size: 9.5pt;
            line-height: 1.5;
            white-space: pre;
            margin-top: 5px;
            color: #333;
          }
          .right-cards {
            display: flex;
            flex-direction: column;
            gap: 10px;
            width: 230px;
          }
          .title-text {
            font-size: 16pt;
            font-weight: 800;
            color: #002D62;
            text-align: right;
            margin-bottom: 5px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .card {
            border: 1px solid #002D62;
            border-radius: 6px;
            overflow: hidden;
            text-align: center;
          }
          .card-header {
            background-color: #002D62;
            color: white;
            font-weight: bold;
            font-size: 8.5pt;
            padding: 4px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .card-body {
            background-color: white;
            color: #000;
            font-weight: bold;
            font-size: 12pt;
            padding: 6px 0;
            font-family: monospace;
          }
          .divider {
            border-top: 1px solid #ddd;
            margin: 15px 0;
          }
          .info-columns {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
          }
          .info-column {
            width: 48%;
          }
          .info-title {
            color: #002D62;
            font-weight: bold;
            font-size: 9pt;
            text-transform: uppercase;
            margin-bottom: 8px;
            border-bottom: 1.5px solid #002D62;
            padding-bottom: 3px;
            display: inline-block;
          }
          .info-body {
            font-size: 9.5pt;
            line-height: 1.6;
          }
          .info-name {
            font-weight: bold;
            font-size: 11pt;
            margin-bottom: 5px;
            color: #000;
          }
          .info-item {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 4px;
          }
          .section-title-bar {
            background-color: white;
            color: black;
            font-weight: bold;
            font-size: 10pt;
            text-align: center;
            padding: 5px 0;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            margin-bottom: 10px;
          }
          .order-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
          }
          .order-table th {
            border: 1px solid #002D62;
            background-color: #002D62;
            color: white;
            font-weight: bold;
            font-size: 8.5pt;
            padding: 4px 6px;
            text-align: center;
            text-transform: uppercase;
          }
          .order-table td {
            border: 1px solid #bbb;
            padding: 4px 6px;
            font-size: 9pt;
            color: #111;
          }
          .order-table td.center {
            text-align: center;
          }
          .total-bar-container {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 25px;
          }
          .total-bar {
            display: flex;
            border: 1px solid #002D62;
            border-radius: 4px;
            overflow: hidden;
            width: 250px;
          }
          .total-label {
            background-color: #002D62;
            color: white;
            font-weight: bold;
            font-size: 9pt;
            padding: 6px 12px;
            text-transform: uppercase;
            flex: 1;
            text-align: center;
          }
          .total-value {
            background-color: white;
            color: #000;
            font-weight: bold;
            font-size: 11pt;
            padding: 6px 15px;
            min-width: 60px;
            text-align: center;
          }
          .bottom-boxes {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
            gap: 20px;
          }
          .bottom-box {
            width: 50%;
            border: 1px solid #002D62;
            border-radius: 6px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }
          .bottom-box-header {
            background-color: #002D62;
            color: white;
            font-weight: bold;
            font-size: 9pt;
            text-align: center;
            padding: 5px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .bottom-box-body {
            padding: 12px;
            font-size: 9pt;
            flex: 1;
            background-color: #fafafa;
            min-height: 80px;
          }
          .bottom-box-body ul {
            margin: 0;
            padding-left: 18px;
          }
          .bottom-box-body li {
            margin-bottom: 6px;
          }
          .signature-section {
            margin-top: 40px;
            text-align: center;
            display: flex;
            flex-direction: row;
            justify-content: space-around;
            width: 100%;
          }
          .signature-box {
            width: 40%;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .signature-line {
            width: 100%;
            border-top: 1px solid #333;
            margin-top: 50px;
            margin-bottom: 5px;
          }
          .signature-title-detail {
            font-size: 8.5pt;
            color: #555;
            text-align: center;
          }
          .footer-banner {
            background-color: #002D62;
            color: white;
            text-align: center;
            padding: 8px 0;
            font-size: 9.5pt;
            font-weight: bold;
            font-style: italic;
            border-radius: 4px;
            margin-top: 30px;
          }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div class="logo-area">
            ${logoHtml}
           
            <div class="company-info">${company.rnc ? `${padDots('RNC', 12)} ${company.rnc}\n` : ''}${company.phone ? `${padDots('Teléfono', 12)} ${company.phone}\n` : ''}${company.email ? `${padDots('Email', 12)} ${company.email}\n` : ''}${company.address ? `${padDots('Dirección', 12)} ${company.address}` : ''}</div>
            
          </div>
          <div class="right-cards" >
            <div class="card">
              <div class="card-header">Número de Pedido</div>
              <div class="card-body" style="font-size: 11pt; padding: 8px 0;">
                ${order.orderNumber}
                <div style="font-size: 8.5pt; font-weight: bold; color: #000; border-top: 1px solid #ddd; margin-top: 6px; padding-top: 4px; font-family: sans-serif;">
                  Fecha: ${formattedDate}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="info-columns">
          <div class="info-column" style="width: 100%;">
            <div class="info-title">Datos del Suplidor:</div>
            <div class="info-body">
              <div class="info-name">${order.supplierName || ''}</div>
              ${order.supplierRnc ? `<div><strong>RNC:</strong> ${order.supplierRnc}</div>` : ''}
              ${order.supplierPhone ? `<div><strong>Tel:</strong> ${order.supplierPhone}</div>` : ''}
              ${order.supplierEmail ? `<div><strong>Email:</strong> ${order.supplierEmail}</div>` : ''}
              ${order.supplierAddress ? `<div><strong>Dirección:</strong> ${order.supplierAddress}</div>` : ''}
            </div>
          </div>
        </div>

        <div class="section-title-bar">Detalle del Pedido</div>

        <table class="order-table">
          <thead>
            <tr>
              <th style="width: 5%;">#</th>
              <th style="width: 20%;">Código (SKU)</th>
              <th style="width: 45%;">Nombre del Producto</th>
              <th style="width: 12%;">Cant</th>
              <th style="width: 18%;">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            ${lines.map((line: any, idx: number) => `
              <tr>
                <td class="center">${idx + 1}</td>
                <td>${line.productSku || '-'}</td>
                <td>${line.productName || ''}</td>
                <td class="center" style="font-weight: bold;">${line.quantityRequested}</td>
                <td>${line.observations || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-bar-container">
          <div class="total-bar">
            <div class="total-label">Total Unidades</div>
            <div class="total-value">${totalQty}</div>
          </div>
        </div>

        <div class="bottom-boxes">
          <div class="bottom-box">
            <div class="bottom-box-header">Observaciones Generales</div>
            <div class="bottom-box-body" style="white-space: pre-wrap;">${order.observations || 'Sin observaciones.'}</div>
          </div>
          <div class="bottom-box">
            <div class="bottom-box-header">Condiciones Generales</div>
            <div class="bottom-box-body">
              <ul>
                ${conditions.map((c: string) => `<li>${c}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>

        <div class="signature-section">
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-title-detail">
              <strong>Solicitado por:</strong><br>
              ${order.userName || 'Usuario del Sistema'}<br>
              ${company.name || 'Latin Doors SRL'}
            </div>
          </div>
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-title-detail">
              <strong>Recibido por:</strong><br>
              Firma y Sello del Suplidor
            </div>
          </div>
        </div>


      </body>
      </html>
    `;
  }

  static renderSupplierOrderListReport(data: any): string {
    const { company, items, filters } = data;
    const css = this.getBaseCss('carta');

    const logoHtml = company.logoUrl
      ? `<img src="${company.logoUrl}" class="logo" style="max-height: 80px; margin-left: -24px;" alt="Logo">`
      : '';

    const companyTitleHtml = logoHtml
      ? ''
      : `<div class="font-bold" style="font-size: 11pt; color: #0f172a; margin-bottom: 4px;">${company.name}</div>`;

    const linesHtml = items.map((item: any, idx: number) => {
      const statusLabel = item.status === 'Draft' ? 'Borrador' :
        item.status === 'Sent' ? 'Enviado' :
          item.status === 'Partial' ? 'Parcial' :
            item.status === 'Received' ? 'Recibido' : 'Cancelado';
      return `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td class="font-mono text-center"><strong>${item.orderNumber}</strong></td>
          <td class="text-center">${new Date(item.orderDate).toLocaleDateString('es-DO')}</td>
          <td>
            <strong>${item.supplierName}</strong>${item.supplierRnc ? ` (${item.supplierRnc})` : ''}
          </td>
          <td>${item.userName}</td>
          <td class="text-center">${statusLabel}</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte de Pedidos a Suplidores</title>
        <style>
          ${css}
          .font-mono { font-family: monospace; }
          .font-bold { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { 
            padding: 5px 8px !important; 
            font-size: 8pt !important; 
            border-bottom: 1px solid #e2e8f0;
          }
          th { background-color: #003366; color: white; font-weight: bold; text-transform: uppercase; font-size: 8.5pt !important; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-info">
            ${logoHtml}
            ${companyTitleHtml}
            <div>RNC: ${company.rnc}</div>
            <div>Dirección: ${company.address}</div>
          </div>
          <div class="doc-info">
            <div class="subtitle">Reporte de Pedidos a Suplidores</div>
            <div>Fecha: ${new Date().toLocaleDateString('es-DO')}</div>
            <div>Total Pedidos: ${items.length}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 5%;">#</th>
              <th style="width: 15%;">No. Pedido</th>
              <th style="width: 15%;">Fecha</th>
              <th style="width: 35%;">Suplidor</th>
              <th style="width: 15%;">Creado Por</th>
              <th style="width: 15%;" class="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${items.length === 0 ? '<tr><td colspan="6" class="text-center" style="padding: 20px !important;">No existen pedidos registrados.</td></tr>' : linesHtml}
          </tbody>
        </table>

        <div class="footer" style="margin-top: 50px;">
          Reporte de Pedidos a Suplidores - Generado por ContFast Enterprise
        </div>
      </body>
      </html>
    `;
  }
}


// Auto-wrap all static render methods to automatically escape input data
for (const key of Object.getOwnPropertyNames(DocumentTemplates)) {
  if (key.startsWith('render') && typeof (DocumentTemplates as any)[key] === 'function') {
    const originalMethod = (DocumentTemplates as any)[key];
    (DocumentTemplates as any)[key] = function (data: any, ...args: any[]) {
      const escapedData = deepEscape(data);
      return originalMethod.call(this, escapedData, ...args);
    };
  }
}
