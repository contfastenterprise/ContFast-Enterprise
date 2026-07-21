import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { ProductRepository } from '@/repositories/productRepository';
import { PdfGenerator } from '@/services/print/pdfGenerator';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const resHeaders = new Headers();
    const session = await verifyAuth(req, resHeaders);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    await enforcePermission(session.userId, session.role, session.roleId, 'catalogo', 'read');

    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get('ids');
    const quantity = parseInt(searchParams.get('quantity') || '1', 10);
    const size = searchParams.get('size') || '50x30';
    const brandText = searchParams.get('brandText') || 'ContFast Enterprise';
    const format = searchParams.get('format') || 'code128';
    const fieldsParam = searchParams.get('fields') || 'brand,name,price,sku,barcode,code';

    if (!idsParam) {
      return NextResponse.json({ success: false, error: { message: 'IDs de producto requeridos' } }, { status: 400 });
    }

    const ids = idsParam.split(',');
    const visibleFields = {
      brand: fieldsParam.includes('brand'),
      name: fieldsParam.includes('name'),
      price: fieldsParam.includes('price'),
      sku: fieldsParam.includes('sku'),
      barcode: fieldsParam.includes('barcode'),
      qr: fieldsParam.includes('qr'),
      code: fieldsParam.includes('code'),
    };

    // Parse size
    let width = 50;
    let height = 30;
    if (size !== 'custom') {
      const parts = size.split('x');
      if (parts.length === 2) {
        width = parseInt(parts[0], 10) || 50;
        height = parseInt(parts[1], 10) || 30;
      }
    } else {
      width = parseInt(searchParams.get('customWidth') || '50', 10);
      height = parseInt(searchParams.get('customHeight') || '30', 10);
    }

    // Fetch products
    const productsToPrint = [];
    for (const id of ids) {
      const prod = await ProductRepository.getById(id, session.companyId);
      if (prod && prod.barcode) {
        productsToPrint.push(prod);
      }
    }

    if (productsToPrint.length === 0) {
      return NextResponse.json({ success: false, error: { message: 'No hay productos con códigos de barra válidos para imprimir' } }, { status: 400 });
    }

    // Build items lists matching quantities
    const flatList: any[] = [];
    productsToPrint.forEach(p => {
      for (let i = 0; i < quantity; i++) {
        flatList.push(p);
      }
    });

    // Render HTML labels
    let labelsHtml = '';
    flatList.forEach((p, index) => {
      const barcodeValue = p.barcode || '';
      const priceText = parseFloat(p.price || '0').toLocaleString('es-DO', { minimumFractionDigits: 2 });
      
      const qrData = JSON.stringify({
        id: p.id,
        codigo: barcodeValue,
        nombre: p.name,
        precio: parseFloat(p.price || '0')
      });

      labelsHtml += `
        <div class="label-page">
          ${visibleFields.brand && brandText ? `<div class="brand">${brandText}</div>` : ''}
          ${visibleFields.name ? `<div class="name">${p.name}</div>` : ''}
          ${visibleFields.sku && p.sku ? `<div class="sku">SKU: ${p.sku}</div>` : ''}
          
          ${visibleFields.barcode && barcodeValue ? `
            <div class="barcode-container">
              <svg class="barcode-svg" data-barcode="${barcodeValue}" data-format="${format.toUpperCase()}" data-display="${visibleFields.code}"></svg>
            </div>
          ` : ''}
          
          ${visibleFields.qr ? `
            <div class="barcode-container">
              <canvas class="qr-canvas" data-qr='${qrData}'></canvas>
            </div>
          ` : ''}
          
          ${visibleFields.price ? `<div class="price">RD$ ${priceText}</div>` : ''}
        </div>
      `;
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Etiquetas</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;850&display=swap');
          
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background: white;
            font-family: 'Inter', sans-serif;
            -webkit-print-color-adjust: exact;
          }
          
          .label-page {
            width: ${width}mm;
            height: ${height}mm;
            box-sizing: border-box;
            padding: 1.5mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            page-break-after: always;
            page-break-inside: avoid;
            overflow: hidden;
            background: white;
          }
          
          .label-page:last-child {
            page-break-after: avoid;
          }
          
          .brand {
            font-size: 6.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
            margin-bottom: 0.5mm;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
          }
          
          .name {
            font-size: 7.5px;
            font-weight: 850;
            color: #0f172a;
            line-height: 1.2;
            margin-bottom: 0.5mm;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            width: 100%;
          }
          
          .sku {
            font-size: 6.5px;
            font-family: monospace;
            color: #94a3b8;
            margin-bottom: 0.5mm;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
          }
          
          .barcode-container {
            margin: 0.5mm 0;
            max-width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          
          .barcode-svg {
            max-width: 100%;
            height: auto;
            display: block;
          }
          
          .qr-canvas {
            display: block;
            margin: 0.5mm auto;
          }
          
          .price {
            font-size: 8.5px;
            font-weight: 800;
            color: #003366;
            margin-top: 0.5mm;
          }
        </style>
      </head>
      <body>
        ${labelsHtml}
        
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
        <script>
          document.addEventListener('DOMContentLoaded', function() {
            // Render standard barcodes
            document.querySelectorAll('.barcode-svg').forEach(function(svg) {
              var val = svg.getAttribute('data-barcode');
              var format = svg.getAttribute('data-format') || 'CODE128';
              var displayValue = svg.getAttribute('data-display') === 'true';
              try {
                JsBarcode(svg, val, {
                  format: format,
                  width: 1.2,
                  height: 18,
                  displayValue: displayValue,
                  fontSize: 10,
                  margin: 0
                });
              } catch (e) {
                console.error(e);
              }
            });
            
            // Render QR Codes
            document.querySelectorAll('.qr-canvas').forEach(function(canvas) {
              var val = canvas.getAttribute('data-qr');
              try {
                QRCode.toCanvas(canvas, val, {
                  width: 60,
                  margin: 1,
                  errorCorrectionLevel: 'M'
                });
              } catch (e) {
                console.error(e);
              }
            });
          });
        </script>
      </body>
      </html>
    `;

    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, `label:${width}mm:${height}mm`);

    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const printDate = `${day}-${month}-${year}`;
    const filename = `Etiquetas de Barra - ${size} - ${printDate}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        ...resHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error('Error generating label PDF:', err);
    return NextResponse.json({ success: false, error: { message: err.message || 'Error interno del servidor' } }, { status: 500 });
  }
}
