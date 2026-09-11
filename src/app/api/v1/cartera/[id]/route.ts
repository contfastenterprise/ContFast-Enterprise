import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission, type PermissionModule } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { CarteraRepository, type TipoCartera } from '@/repositories/carteraRepository';
import { Logger } from '@/utils/logger';

const esquemaConsulta = z.object({
  tipo: z.enum(['clientes', 'suplidores'], {
    message: 'El tipo de cartera debe ser "clientes" o "suplidores".',
  }),
  // El id viene de la URL y NO se valida en ninguna capa anterior: si no es un
  // uuid, no llega a la consulta.
  id: z.string({ message: 'Falta la entidad.' }).uuid('La entidad no es válida.'),
});

// Tipado con `PermissionModule` y no con `string`: asi un modulo mal escrito
// lo caza el compilador aqui y no `enforcePermission` en tiempo de ejecucion,
// que es donde un permiso equivocado deja de ser un error y pasa a ser un
// agujero.
const MODULO: Record<TipoCartera, PermissionModule> = {
  clientes: 'cobros',
  suplidores: 'proveedores',
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params;
    const validacion = esquemaConsulta.safeParse({
      tipo: req.nextUrl.searchParams.get('tipo') ?? undefined,
      id,
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

    // La empresa y el modo van SIEMPRE con el id: el id llega de la URL, asi
    // que sin ellos se podria pedir el estado de cuenta de otra empresa.
    const data = await CarteraRepository.detalle(
      session.companyId,
      session.modo,
      tipo,
      validacion.data.id
    );

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    Logger.error('[cartera/detalle] no se pudo armar el estado de cuenta', {
      tipo: req.nextUrl.searchParams.get('tipo'),
      motivo: (error as Error)?.message,
    });
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: (error as Error).message } },
      { status: 500 }
    );
  }
}
