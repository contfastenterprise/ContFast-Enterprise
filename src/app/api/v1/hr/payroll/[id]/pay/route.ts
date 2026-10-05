import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permissions';
import { diaRD } from '@/utils/fechasLocales';
import { NominaNoPermitidaError } from '@/services/nomina/estadoDeNomina';
import { validarPeticionDePago, type PeticionDePago } from '@/services/nomina/pagoDeNomina';
import { hayTablaDePagos, pagarNomina, pagoDeLaNomina } from '@/services/nomina/pagarNomina';

/**
 * Lote 295 (el "lote D" de `docs/diseno_asientos_nomina.md`): pagar una nomina
 * aprobada, y leer su pago.
 *
 *   POST  { metodo: 'transfer'|'check'|'cash', bankAccountId?, fecha, referencia? }
 *   GET   el pago (fecha, origen, referencia, autor) con su asiento; `null` si no tiene.
 *
 * El permiso es el de aprobar la nomina (`nomina:write`). Ruta aparte, y no
 * una `action` mas del PUT de `hr/payroll`: un pago lleva su propio cuerpo,
 * y la ruta de la nomina ya decide recalcular y aprobar.
 */
function respuestaDeError(error: unknown) {
  if (error instanceof NominaNoPermitidaError) {
    return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.status });
  }
  const e = error as Error & { status?: number };
  const status = e.status === 404 || e.status === 400 ? e.status : 500;
  return NextResponse.json({ success: false, error: { message: e.message } }, { status });
}

export async function POST(req: NextRequest, segmentData: { params: Promise<{ id: string }> }) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }
    const denegado = await requirePermission(session, 'nomina', 'write');
    if (denegado) return denegado;

    const { id } = await segmentData.params;
    const body = (await req.json().catch(() => null)) as PeticionDePago | null;
    const valido = validarPeticionDePago(body ?? ({} as PeticionDePago), diaRD());
    if (!valido.ok) {
      return NextResponse.json({ success: false, error: { message: valido.motivo } }, { status: 400 });
    }

    const pago = await pagarNomina(id, session.companyId, session.modo, session.userId, valido.pago);
    return NextResponse.json({ success: true, message: 'Nómina pagada', data: { pago } });
  } catch (error: unknown) {
    return respuestaDeError(error);
  }
}

export async function GET(req: NextRequest, segmentData: { params: Promise<{ id: string }> }) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }
    const denegado = await requirePermission(session, 'nomina', 'read');
    if (denegado) return denegado;

    const { id } = await segmentData.params;
    const [pago, hayTabla] = await Promise.all([
      pagoDeLaNomina(id, session.companyId, session.modo),
      hayTablaDePagos(),
    ]);
    return NextResponse.json({ success: true, data: { pago, hayTabla } });
  } catch (error: unknown) {
    return respuestaDeError(error);
  }
}
