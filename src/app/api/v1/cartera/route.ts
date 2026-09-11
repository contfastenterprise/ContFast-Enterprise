import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission, type PermissionModule } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { CarteraRepository, type TipoCartera } from '@/repositories/carteraRepository';
import { Logger } from '@/utils/logger';

/**
 * El `tipo` decide DOS cosas, no una: de que tabla se lee y que permiso hace
 * falta. Por eso se valida con esquema en vez de con un `if`: un valor que no
 * sea exactamente uno de los dos no puede pasar de aqui.
 */
const esquemaConsulta = z.object({
  tipo: z.enum(['clientes', 'suplidores'], {
    message: 'El tipo de cartera debe ser "clientes" o "suplidores".',
  }),
});

/** Cada cartera exige el permiso de SU modulo. Cobros no abre proveedores. */
// Tipado con `PermissionModule` y no con `string`: asi un modulo mal escrito
// lo caza el compilador aqui y no `enforcePermission` en tiempo de ejecucion,
// que es donde un permiso equivocado deja de ser un error y pasa a ser un
// agujero.
const MODULO: Record<TipoCartera, PermissionModule> = {
  clientes: 'cobros',
  suplidores: 'proveedores',
};

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } },
        { status: 401 }
      );
    }

    const validacion = esquemaConsulta.safeParse({
      tipo: req.nextUrl.searchParams.get('tipo') ?? undefined,
    });
    if (!validacion.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validacion.error.issues[0]?.message || 'Consulta inválida.',
          },
        },
        { status: 400 }
      );
    }

    const { tipo } = validacion.data;

    await enforcePermission(
      session.userId,
      session.role,
      session.roleId,
      session.companyId,
      MODULO[tipo],
      'read'
    );

    const data = await CarteraRepository.resumen(session.companyId, session.modo, tipo);

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    // Con contexto: sin saber que cartera se pedia, el log no sirve para
    // reproducirlo. (P2-43.)
    Logger.error('[cartera] no se pudo armar el resumen', {
      tipo: req.nextUrl.searchParams.get('tipo'),
      motivo: (error as Error)?.message,
    });
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: (error as Error).message } },
      { status: 500 }
    );
  }
}
