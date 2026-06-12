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
    const css = this.getBaseCss(layout);
    const { company, customer, invoice, lines, taxes } = data;
    const inv = invoice || data;
    
    const logoHtml = company.logoUrl && layout !== '58mm' 
      ? `<img src="${company.logoUrl}" class="logo" alt="Logo">` 
      : '';

    const linesHtml = lines.map((line: any) => `
      <tr>
        <td>${line.quantity}</td>
        <td>${line.productName}</td>
        <td class="text-right">$${line.unitPrice.toFixed(2)}</td>
        ${layout === 'carta' ? `<td class="text-right">$${line.discount.toFixed(2)}</td>` : ''}
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
              ${layout === 'carta' ? '<th class="text-right">Desc</th>' : ''}
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
}
