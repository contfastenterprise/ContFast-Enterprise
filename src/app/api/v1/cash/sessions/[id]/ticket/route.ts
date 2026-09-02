import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { db, cashSessions, cashSessionSummary, users } from '@/db';
import { eq, and } from 'drizzle-orm';
import { CompanyRepository } from '@/repositories/companyRepository';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<any> }
) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Fetch session and user
    const [session] = await db
      .select({
        openedAt: cashSessions.createdAt,
        closedAt: cashSessions.closedAt,
        userId: cashSessions.userId,
      })
      .from(cashSessions)
      .where(and(eq(cashSessions.id, id), eq(cashSessions.companyId, auth.companyId), eq(cashSessions.modo, auth.modo)))
      .limit(1);

    if (!session) return NextResponse.json({ error: 'Sesión no encontrada.' }, { status: 404 });

    const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, session.userId)).limit(1);

    // Fetch summary
    const [summary] = await db
      .select()
      .from(cashSessionSummary)
      .where(and(eq(cashSessionSummary.cashSessionId, id), eq(cashSessionSummary.companyId, auth.companyId), eq(cashSessionSummary.modo, auth.modo)))
      .limit(1);

    if (!summary) return NextResponse.json({ error: 'Arqueo no generado.' }, { status: 404 });

    // Fetch company info
    const company = await CompanyRepository.getProfile(auth.companyId);
    const settings = await CompanyRepository.getSettings(auth.companyId);

    // Build ticket data
    // El ticket NO se bloquea si falta la empresa: es un arqueo de caja y
    // frenar un cierre por esto seria peor que imprimirlo incompleto. Pero
    // tampoco se inventa la identidad fiscal. Antes ponia `rnc: '000000000'`,
    // que tiene FORMA de RNC valido y por eso nadie lo mira dos veces: un
    // identificador tributario falso impreso y sin marcar. Va `null`, y el
    // ticket sale sin la linea del RNC.
    if (!company) {
      console.error(
        `[ticket] No se encontro la empresa ${auth.companyId} al imprimir el arqueo ` +
        `de la sesion ${id}. El ticket sale SIN identificacion fiscal.`
      );
    }

    const ticketData = {
      company: {
        name: company?.name ?? null,
        rnc: company?.rnc ?? null,
        settings: { printLayout: settings?.printLayout || '80mm' }
      },
      cashier: user?.name || 'Cajero',
      openedAt: session.openedAt,
      closedAt: session.closedAt || new Date(),
      initialBalance: parseFloat(summary.initialBalance),
      totalCashIn: parseFloat(summary.totalCashIn),
      totalCashOut: parseFloat(summary.totalCashOut),
      expectedBalance: parseFloat(summary.expectedBalance),
    };

    // Note: the component expects direct JSON, not wrapped in { success, data }
    return NextResponse.json(ticketData, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error in GET ticket:', error);
    return NextResponse.json({ error: error.message }, { status: 500, headers: resHeaders });
  }
}
