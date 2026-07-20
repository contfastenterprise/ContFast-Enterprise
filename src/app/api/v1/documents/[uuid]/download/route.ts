import { NextRequest, NextResponse } from 'next/server';
import { DocumentService } from '@/services/print/documentService';
import fs from 'fs/promises';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<any> } // In Next.js 15, params is a Promise
) {
  const { uuid } = await params;
  
  const searchParams = request.nextUrl.searchParams;
  const expiresAt = searchParams.get('expiresAt');
  const signature = searchParams.get('signature');

  if (!expiresAt || !signature) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  // Validar firma y tiempo
  if (!DocumentService.validateSignature(uuid, expiresAt, signature)) {
    return NextResponse.json({ error: 'Invalid signature or link expired' }, { status: 403 });
  }

  const isExcel = searchParams.get('format') === 'xlsx';
  const extension = isExcel ? 'xlsx' : 'pdf';
  const filePath = DocumentService.getFilePath(uuid, extension);

  // Comprobar que existe
  const exists = await DocumentService.fileExists(filePath);
  if (!exists) {
    return NextResponse.json({ error: 'File not found or already downloaded' }, { status: 404 });
  }

  try {
    const fileBuffer = await fs.readFile(filePath);
    
    const customFilename = searchParams.get('filename');

    // Configurar Content-Type y Headers
    const headers = new Headers();
    if (isExcel) {
      headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const filenameStr = customFilename || `document_${uuid}.xlsx`;
      headers.set('Content-Disposition', `attachment; filename="${filenameStr}"`);
    } else {
      headers.set('Content-Type', 'application/pdf');
      const filenameStr = customFilename || 'document.pdf';
      headers.set('Content-Disposition', `inline; filename="${filenameStr}"`);
    }

    const response = new NextResponse(fileBuffer, {
      status: 200,
      headers
    });

    // En Node puro podíamos borrar el archivo con on('finish'), aquí podemos borrarlo asíncronamente
    // usando un timeout muy corto para asegurar que el buffer se envía.
    setTimeout(async () => {
      await DocumentService.deleteTemporaryFile(filePath);
    }, 1000);

    return response;
  } catch (error) {
    console.error('Error serving document:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
