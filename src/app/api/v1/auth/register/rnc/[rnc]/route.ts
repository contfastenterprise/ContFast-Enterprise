import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { DGIIService } from '@/services/dgii/rncLookup';
import { RNC_INVALIDO, rncDeLaEmpresa } from '@/services/empresas/rncDeLaEmpresa';

/**
 * "Buscar DGII" del registro publico (lote 287).
 *
 * La consulta de siempre (`DGIIService.lookupRNC`, el padron de la DGII del lote
 * 198) con otra puerta: `/api/v1/dgii/rnc/[rnc]` exige sesion, y quien se registra
 * todavia no la tiene. El dato es publico -- la DGII publica el padron entero --,
 * asi que abrirlo no enseña nada que no este ya en su web.
 *
 * Lo que se cuida:
 *  · limite 'auth' (5/min), el unico que sigue contando sin Redis, con su propia
 *    clave: buscar no se come los intentos de registrarse, ni al reves;
 *  · solo devuelve lo del PADRON (nombre, estado, actividad). NO dice si ese RNC
 *    ya tiene empresa en ContFast: seria un listado gratis de quien es cliente.
 *    Eso solo se sabe al registrarse, y entonces se rechaza (409).
 *
 * Vive bajo `/api/v1/auth/register`, que el proxy ya trata como publica (y a la
 * que le limpia las cabeceras de identidad).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ rnc: string }> }) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    if (!(await checkRateLimit(`registro-rnc:${ip}`, 'auth'))) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas consultas. Intente en un minuto.' } },
        { status: 429 }
      );
    }

    const { rnc } = await params;
    const buscado = rncDeLaEmpresa(rnc);
    if (!buscado) {
      return NextResponse.json({ success: false, error: { message: RNC_INVALIDO } }, { status: 400 });
    }

    const r = await DGIIService.lookupRNC(buscado);
    if (!r.success || !r.name) {
      //  No encontrarlo no es un error de la peticion: se puede escribir a mano.
      return NextResponse.json({
        success: false,
        error: { message: r.message || 'No se encontró en el padrón de la DGII. Escriba la razón social a mano.' },
      });
    }
    return NextResponse.json({
      success: true,
      data: { rnc: r.rnc, nombre: r.name, estado: r.status, actividad: r.actividad_economica ?? null, aviso: r.message ?? null },
    });
  } catch (error: unknown) {
    console.error('Error in public RNC lookup:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: 'No se pudo consultar el padrón. Escriba la razón social a mano.' } },
      { status: 500 }
    );
  }
}
