import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { parseOcrText } from '@/utils/ocrParser';
import { Logger } from '@/utils/logger';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFilePromise = promisify(execFile);
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let tempFilePath = '';
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const { image } = await req.json(); // image is a base64 string
    if (!image) {
      return NextResponse.json({ success: false, error: { message: 'Imagen requerida en formato Base64' } }, { status: 400 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (geminiApiKey) {
      Logger.info('[OCR-Server] Enrutando procesamiento visual a la API de Gemini 1.5 Flash...');
      try {
        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const mimeTypeMatch = image.match(/^data:(image\/\w+);base64,/);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';

        const prompt = `Analiza esta imagen de factura de República Dominicana y extrae la información contable. Devuelve estrictamente un objeto JSON con el siguiente formato, sin texto explicativo ni markdown alrededor, solo el objeto JSON crudo:
{
  "supplier": "Nombre de la empresa emisora",
  "rnc": "RNC del emisor (9 o 11 dígitos, solo números)",
  "ncf": "NCF o e-CF completo (11 o 13 caracteres, ej. B0100000001 o E310000000001)",
  "date": "Fecha en formato YYYY-MM-DD",
  "currency": "DOP o USD",
  "exchangeRate": 1.0,
  "subtotal": 0.00,
  "itbis": 0.00,
  "total": 0.00
}
Nota: Si no encuentras algún campo, devuélvelo vacío o en 0 para montos.`;

        const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

        const requestBody = {
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 seconds timeout

        const response = await fetch(geminiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Gemini API returned status ${response.status}: ${await response.text()}`);
        }

        const resultJson = await response.json();
        const textResponse = resultJson?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textResponse) {
          throw new Error('La API de Gemini no retornó una respuesta de texto válida.');
        }

        const parsedData = JSON.parse(textResponse.trim());
        
        // Ensure values are properly formatted and typed
        const mappedData = {
          supplier: parsedData.supplier || '',
          rnc: parsedData.rnc || '',
          ncf: parsedData.ncf || '',
          date: parsedData.date || new Date().toISOString().split('T')[0],
          currency: parsedData.currency || 'DOP',
          exchangeRate: Number(parsedData.exchangeRate || 1.0),
          subtotal: Number(parsedData.subtotal || 0.00),
          itbis: Number(parsedData.itbis || 0.00),
          total: Number(parsedData.total || 0.00),
          totalDOP: Number(parsedData.total || 0.00) * Number(parsedData.exchangeRate || 1.0)
        };

        Logger.info('[OCR-Server] Gemini OCR finalizado con éxito.');

        return NextResponse.json({
          success: true,
          data: mappedData,
          rawText: textResponse
        });
      } catch (err: any) {
        Logger.error('[OCR-Server] Error en procesamiento de Gemini, cayendo en Tesseract local...', err);
        // Fall through to Tesseract local execution
      }
    }

    Logger.info('[OCR-Server] Procesando string de imagen en Tesseract local...');
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Create a temporary file to pass to the standalone node process
    const tempDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    tempFilePath = path.join(tempDir, `ocr_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
    fs.writeFileSync(tempFilePath, buffer);

    Logger.info(`[OCR-Server] Ejecutando proceso de OCR externo sobre: ${tempFilePath}`);
    
    // Execute standalone Node script to run OCR outside Next.js webpack sandbox
    const scriptPath = path.join(process.cwd(), 'scripts', 'run-ocr.js');
    
    const { stdout, stderr } = await execFilePromise('node', [scriptPath, tempFilePath]);

    if (stderr && stderr.includes('ERROR:')) {
      throw new Error(stderr);
    }

    Logger.info(`[OCR-Server] OCR finalizado con éxito.`);

    if (!stdout || stdout.trim().length === 0) {
      return NextResponse.json({ success: false, error: { message: 'No se detectó texto legible en el comprobante. Intente con otra imagen más nítida.' } }, { status: 422 });
    }

    const parsedData = parseOcrText(stdout);

    return NextResponse.json({
      success: true,
      data: parsedData,
      rawText: stdout
    });
  } catch (error: any) {
    Logger.error('Error in Server-side OCR', error);
    return NextResponse.json({ 
      success: false, 
      error: { message: error.message || 'Fallo interno al procesar el OCR' } 
    }, { status: 500 });
  } finally {
    // Ensure the temp file is deleted
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        Logger.info(`[OCR-Server] Archivo temporal eliminado: ${tempFilePath}`);
      } catch (err) {
        Logger.error('[OCR-Server] Error eliminando archivo temporal', err);
      }
    }
  }
}
