import { NextRequest, NextResponse } from 'next/server';
import { DocumentService } from '@/services/print/documentService';

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
  //  LOTE 183: se lee del BUCKET, no del disco de esta instancia. El PDF lo
  //  escribio otra peticion, y Vercel enruta cada una por su cuenta: leyendo del
  //  disco local, la mitad de las veces el fichero no estaba aqui -- y eso era el
  //  404 que veia quien imprimia un recibo.
  const fileBuffer = await DocumentService.leerTemporal(uuid, extension);
  if (!fileBuffer) {
    //  Ya no dice "or already downloaded": desde el lote 183 descargar NO borra.
    //  Si no esta, es que el enlace caduco (10 minutos) o el barrido se lo llevo
    //  (una hora).
    return NextResponse.json({ error: 'El documento ya no está disponible: vuelva a generarlo' }, { status: 404 });
  }

  try {
    
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

    //  `new Uint8Array(...)`: `Buffer` no encaja en `BodyInit` con los tipos de
    //  Node actuales. Es el mismo molde que ya usa la ruta de impresion de
    //  facturas.
    const response = new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers
    });

    //  AQUI SE BORRABA EL FICHERO un segundo despues de servirlo, y era la
    //  segunda causa del 404 (lote 183): los visores de PDF piden el documento
    //  DOS veces -- la segunda con `Range` --, y la segunda llegaba cuando ya no
    //  estaba. Recargar la pestaña, igual.
    //
    //  Ahora no se borra al descargar: el enlace caduca a los 10 minutos y
    //  `DocumentService.barrerViejos()` se lleva lo de mas de una hora cada vez
    //  que se guarda uno nuevo. Ademas ese `setTimeout` no era de fiar en
    //  serverless: la funcion se congela al responder y puede no ejecutarse.
    return response;
  } catch (error) {
    console.error('Error serving document:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
