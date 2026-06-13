export class DocumentTemplates {
  private static getBaseCss(layout: 'carta' | '80mm' | '58mm') {
    if (layout === 'carta') {
      return `
        body { font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 10pt; color: #333; margin: 0; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 20px; }
        .logo { max-width: 150px; max-height: 80px; object-fit: contain; }
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
      const conditionLabel = isCredit ? 'FACTURA A CREDITO' : 'FACTURA AL CONTADO';

      // Lines processing
      const linesHtml = lines.map((line: any) => {
        const qty = Number(line.quantity);
        const uPrice = Number(line.unitPrice);
        const discUnit = Number(line.discount);
        const lineTotal = Number(line.total);

        const rawSubtotal = qty * uPrice;
        const rawDiscount = qty * discUnit;
        const rawTaxable = rawSubtotal - rawDiscount;

        let lineItbis = 0;
        if (rawTaxable > 0) {
          lineItbis = lineTotal - rawTaxable;
        }

        return `
          <tr>
            <td>${line.productSku || 'N/A'}</td>
            <td>${line.productName}</td>
            <td>${line.unitOfMeasure || 'Unidad'}</td>
            <td class="text-center">${qty}</td>
            <td class="text-right">${formatNum(uPrice)}</td>
            <td class="text-right">${formatNum(rawDiscount)}</td>
            <td class="text-right">${formatNum(lineItbis)}</td>
            <td class="text-right">${formatNum(lineTotal)}</td>
          </tr>
        `;
      }).join('');

      // Totals calculations
      const subtotalVal = formatNum(inv.subtotal);
      const discountVal = formatNum(inv.discount);
      const itbisVal = formatNum(inv.totalTaxes);
      const totalVal = formatNum(inv.total);

      // Signature Date formatting
      const sigDate = new Date(inv.signatureDate || inv.createdAt);
      const formattedSigDate = sigDate.toLocaleString('es-DO', {
        hour12: true,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).replace('am', 'a. m.').replace('pm', 'p. m.').replace('AM', 'a. m.').replace('PM', 'p. m.');

      const logoHtml = company.logoUrl 
        ? `<img src="${company.logoUrl}" style="max-height: 100px; max-width: 220px; object-fit: contain; margin-bottom: 3px;" alt="Logo">` 
        : '';

      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Factura ${inv.ncf}</title>
          <style>
            body { font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 10pt; color: #333; margin: 0; padding: 0; }
            .header-container { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
            .company-info { font-family: monospace; font-size: 9.5pt; line-height: 1.5; white-space: pre; margin-top: -15px; }
            .doc-info { text-align: right; font-family: 'Inter', sans-serif; white-space: nowrap; }
            .doc-title { font-size: 14pt; font-weight: bold; color: #005E6A; margin-bottom: 5px; white-space: nowrap; }
            .doc-ncf { font-size: 11.5pt; font-weight: bold; color: #000; white-space: nowrap; }
            
            .condition-bar { text-align: center; border-top: 2px solid #005E6A; border-bottom: 2px solid #005E6A; padding: 6px 0; margin: 15px 0; font-family: 'Inter', sans-serif; font-weight: bold; font-size: 11pt; letter-spacing: 1px; color: #000; }
            
            .client-section { display: flex; justify-content: space-between; font-family: monospace; font-size: 9.5pt; line-height: 1.5; margin-bottom: 20px; }
            .client-info { white-space: pre; }
            .invoice-num { text-align: right; font-weight: bold; font-size: 11pt; padding-top: 2px; }
            
            .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            .invoice-table th { background-color: #005E6A; color: #fff; font-family: 'Inter', sans-serif; font-weight: bold; font-size: 9pt; padding: 8px 6px; border: none; text-align: left; }
            .invoice-table td { font-family: monospace; font-size: 9pt; padding: 8px 6px; border-bottom: 1px solid #e9ecef; color: #333; }
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
          </style>
        </head>
        <body>
          <div class="header-container">
            <div>
              ${logoHtml}
              <div class="company-info">
  ${padDots('RNC', 12)} ${company.rnc}
  ${padDots('Teléfono', 12)} ${company.phone}
  ${padDots('Email', 12)} ${company.email}
  ${padDots('Dirección', 12)} ${company.address}
              </div>
            </div>
            <div class="doc-info">
              <div class="doc-title">${getEcfTypeName(inv.ecfType)}</div>
              <div class="doc-ncf">e-NCF: <span style="font-family: monospace;">${inv.ncf}</span></div>
              <div style="font-size: 10pt; color: #333; margin-top: 5px; font-weight: bold;">
                Fecha Emis: <span style="font-family: monospace; font-weight: normal;">${formattedEmiDate}</span>
              </div>
            </div>
          </div>

          <div class="condition-bar">
            ${conditionLabel}
          </div>

          <div class="client-section">
            <div class="client-info">
  ${padDots('Razon Social', 18)} ${customer.name}
  ${padDots('RNC/Cédula', 18)} ${customer.rncCedula}
  ${padDots('Teléfono', 18)} ${customer.phone || ''}
  ${padDots('Dirección', 18)} ${customer.address || ''}
            </div>
            <div class="invoice-num">
              Factura N°: FAC-${inv.ncf.substring(3)}
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
                <tr class="grand-total-row">
                  <td>${padDots('TOTAL NETO', 15)}</td>
                  <td class="text-right">${totalVal}</td>
                </tr>
              </table>
            </div>
          </div>

          <div class="qr-signature-section">
            <div style="display: flex; flex-direction: column; gap: 8px; align-items: flex-start;">
              ${qrBase64 ? `<img src="${qrBase64}" class="qr-img" alt="QR">` : ''}
              <div style="font-family: monospace; font-size: 8.5pt; line-height: 1.5; text-align: left;">
                Código de seguridad: ${inv.securityCode || 'N/A'}<br>
                Fecha Firma: ${formattedSigDate}
              </div>
            </div>
            <div class="signature-container">
              <div class="signature-line">
                <div class="signature-line-border">Recibido conforme</div>
              </div>
              <div class="signature-line">
                <div class="signature-line-border">Revisado por</div>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    const css = this.getBaseCss(layout);
    const logoHtml = company.logoUrl && layout !== '58mm' 
      ? `<img src="${company.logoUrl}" class="logo" alt="Logo">` 
      : '';

    const linesHtml = lines.map((line: any) => `
      <tr>
        <td>${line.quantity}</td>
        <td>${line.productName}</td>
        <td class="text-right">$${line.unitPrice.toFixed(2)}</td>
        <td class="text-right">$${line.total.toFixed(2)}</td>
      </tr>
    `).join('');

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
                <td class="text-right">$${inv.subtotal.toFixed(2)}</td>
              </tr>
              ${inv.discount > 0 ? `
              <tr>
                <th>Descuento</th>
                <td class="text-right">-$${inv.discount.toFixed(2)}</td>
              </tr>
              ` : ''}
              ${taxesHtml}
              <tr class="grand-total">
                <th>TOTAL</th>
                <td class="text-right">$${inv.total.toFixed(2)}</td>
              </tr>
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
    const { company, customer, id, date, paymentMethod, amount, reference, notes, appliedInvoices } = data;
    
    const logoHtml = company.logoUrl && layout !== '58mm' 
      ? `<img src="${company.logoUrl}" class="logo" alt="Logo">` 
      : '';

    const methodLabel = paymentMethod === 'cash' ? 'Efectivo / Caja Chica' : 
                        paymentMethod === 'bank' ? 'Transferencia / Depósito' : 
                        paymentMethod === 'check' ? 'Cheque' : 'Tarjeta';

    const linesHtml = appliedInvoices.map((inv: any) => `
      <tr>
        <td>${inv.invoiceNumber}</td>
        <td>${new Date(inv.invoiceDate).toLocaleDateString('es-DO')}</td>
        <td class="text-right">$${inv.totalAmount.toFixed(2)}</td>
        <td class="text-right">$${inv.amountApplied.toFixed(2)}</td>
      </tr>
    `).join('');

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
          <div class="company-info">
            ${logoHtml}
            <div class="title">${company.name}</div>
            <div>RNC: ${company.rnc}</div>
            ${company.address ? `<div>${company.address}</div>` : ''}
            ${company.phone ? `<div>Tel: ${company.phone}</div>` : ''}
          </div>
          <div class="doc-info">
            <div class="subtitle">RECIBO DE INGRESO</div>
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
              <th>NCF / Documento</th>
              <th>Fecha Factura</th>
              <th class="text-right">Monto Factura</th>
              <th class="text-right">Monto Aplicado</th>
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
                <td class="text-right">$${amount.toFixed(2)}</td>
              </tr>
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
  Factura Ref : ${invoice.ncf}
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
}
