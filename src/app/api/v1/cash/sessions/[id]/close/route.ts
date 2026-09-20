import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { CashService } from '@/services/cashService';

// Lote 172: el cuerpo trae el CONTEO, no el total. `actualBalance` ya no se
// acepta: lo calcula el servidor a partir del desglose
// (services/caja/conteoDeCaja.ts). Un total recibido es un numero que nadie
// conto, y asi se cerraron las tres sesiones de Latin Doors al centavo.
const closeSessionSchema = z.object({
  conteo: z.array(z.object({
    denominacion: z.number().int().positive(),
    cantidad: z.number().int().nonnegative('No se puede contar una cantidad negativa de billetes'),
  })).min(1, 'Registre el conteo de la caja'),
  justification: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    // Enforce "caja:write" permission
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'caja', 'write');

    const body = await req.json();
    const result = closeSessionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400, headers: resHeaders }
      );
    }

    const closeResult = await CashService.closeSession(
      auth.userId,
      auth.companyId,
      auth.modo,
      id,
      result.data.conteo,
      result.data.justification
    );

    return NextResponse.json(
      { success: true, data: closeResult },
      { headers: resHeaders }
    );
  } catch (error: unknown) {
    console.error('Error in POST /api/v1/cash/sessions/[id]/close:', error);
    const e = error as Error & { status?: number; code?: string };
    const status = e.status || 500;
    const code = e.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: e.message } },
      { status, headers: resHeaders }
    );
  }
}
