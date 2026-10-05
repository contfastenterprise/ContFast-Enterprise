import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { validarTicket } from '@/services/soporte/ticketDeSoporte';
import { enviarTicketDeSoporte } from '@/services/soporte/enviarTicketDeSoporte';
import { motivoDelError } from '@/utils/motivoDelError';

/**
 * Lote 288: el ticket de la pantalla de Soporte sale por correo al correo de la empresa
 * de la sesion (Configuracion > Empresa).
 *
 * SIN PERMISO DE MODULO, A PROPOSITO (va en `ABIERTAS_A_PROPOSITO` de
 * `permisosRutas.vitest.ts`): pedir ayuda lo puede cualquier usuario autenticado,
 * tambien uno al que le falta justo el permiso con el que tiene el problema. La empresa
 * y el usuario salen de la SESION, nunca del cuerpo: quien escribe no elige en nombre de
 * quien escribe.
 *
 * Responde "enviado" SOLO si el SMTP acepto el correo. Sin correo de empresa, 409 con el
 * motivo (es la configuracion de la empresa, no un fallo del servidor); con el SMTP caido,
 * 502. Nunca un "creado" que no salio.
 */
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const cuerpo = await req.json().catch(() => null);
    const valido = validarTicket(cuerpo);
    if (!valido.bien) {
      return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: valido.motivo } }, { status: 400 });
    }

    //  Por USUARIO y no por IP: detras de una misma oficina hay varios usuarios, y un
    //  usuario no esquiva el tope cambiando de red. Cinco cada diez minutos.
    if (!(await checkRateLimit(`soporte:${session.userId}`, 'soporte'))) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Ha enviado varios tickets seguidos. Espere unos minutos e inténtelo de nuevo.' } },
        { status: 429 },
      );
    }

    const r = await enviarTicketDeSoporte(valido.ticket, {
      userId: session.userId,
      companyId: session.companyId,
      modo: session.modo,
    });

    if (r.enviado) {
      return NextResponse.json({ success: true, data: { id: r.id } }, { status: 201 });
    }
    return NextResponse.json(
      { success: false, error: { code: r.codigo, message: r.mensaje } },
      { status: r.codigo === 'SIN_CORREO_DE_EMPRESA' ? 409 : 502 },
    );
  } catch (error: unknown) {
    console.error('[soporte] error al recibir el ticket:', motivoDelError(error));
    return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: 'No se pudo enviar el ticket. Inténtelo de nuevo.' } }, { status: 500 });
  }
}
