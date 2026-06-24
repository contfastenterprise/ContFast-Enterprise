import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { parseOcrText } from '@/utils/ocrParser';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execPromise = promisify(exec);
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

    console.log('[OCR-Server] Procesando string de imagen...');
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Create a temporary file to pass to the standalone node process
    const tempDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    tempFilePath = path.join(tempDir, `ocr_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
    fs.writeFileSync(tempFilePath, buffer);

    console.log(`[OCR-Server] Ejecutando proceso de OCR externo sobre: ${tempFilePath}`);
    
    // Execute standalone Node script to run OCR outside Next.js webpack sandbox
    const scriptPath = path.join(process.cwd(), 'scripts', 'run-ocr.js');
    const command = `node "${scriptPath}" "${tempFilePath}"`;
    
    const { stdout, stderr } = await execPromise(command);

    if (stderr && stderr.includes('ERROR:')) {
      throw new Error(stderr);
    }

    console.log(`[OCR-Server] OCR finalizado con éxito.`);

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
    console.error('Error in Server-side OCR:', error);
    return NextResponse.json({ 
      success: false, 
      error: { message: error.message || 'Fallo interno al procesar el OCR' } 
    }, { status: 500 });
  } finally {
    // Ensure the temp file is deleted
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log(`[OCR-Server] Archivo temporal eliminado: ${tempFilePath}`);
      } catch (err) {
        console.error('[OCR-Server] Error eliminando archivo temporal:', err);
      }
    }
  }
}
