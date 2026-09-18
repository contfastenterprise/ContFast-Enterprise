import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { avisosVivos, marcarLeidos } from '@/services/avisos/sincronizarAvisos';
import { z } from 'zod';

/**
 * Lote 160: los avisos guardados, para la campana de la cabecera.
 *
 * Sin permiso de modulo a proposito: son los avisos de LA EMPRESA de la sesion
 * y cualquiera que entre los ve, igual que ve el panel. El enlace de cada uno
 * lleva a su pantalla, y esa si comprueba permisos.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    if (!(await checkRateLimit(ip, 'standard'))) {
      return NextResponse.json({ success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } }, { status: 429 });
    }
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const avisos = await avisosVivos(session.companyId, session.modo);
    return NextResponse.json({
      success: true,
      data: avisos,
      meta: { sinLeer: avisos.filter((a) => !a.readAt).length },
    });
  } catch (error: unknown) {
    console.error('Error listando avisos:', error);
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: (error as Error).message } }, { status: 500 });
  }
}

const esquemaLeer = z.object({
  /** Los avisos a marcar. Sin lista, se marcan TODOS los vivos sin leer. */
  ids: z.array(z.string().uuid()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const cuerpo = await req.json().catch(() => ({}));
    const parsed = esquemaLeer.safeParse(cuerpo);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } }, { status: 400 });
    }

    //  Marcar leido NO resuelve el aviso: el cheque sigue por cobrar y el 607
    //  sin presentar. Solo deja de destacarse. Se resuelve cuando el panel deja
    //  de calcularlo, y eso lo hace `sincronizarAvisos`.
    await marcarLeidos(session.companyId, session.modo, parsed.data.ids);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error marcando avisos como leídos:', error);
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: (error as Error).message } }, { status: 500 });
  }
}
