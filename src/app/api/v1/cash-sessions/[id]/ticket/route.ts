import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    // Simulate database fetch
    /*
    const sessionRecord = await db.query.cashSessions.findFirst({
      where: eq(cashSessions.id, sessionId),
      with: { company: true, user: true }
    });
    const movements = await db.query.cashMovements.findMany({ ... });
    */

    const ticketData = {
      sessionId,
      company: {
        name: 'ContFast SRL',
        rnc: '130123456',
        address: 'Av. Winston Churchill',
        settings: { printLayout: '80mm' } // '80mm' o '58mm'
      },
      cashier: 'Juan Perez',
      openedAt: new Date().toISOString(),
      closedAt: new Date().toISOString(),
      initialBalance: 5000,
      totalCashIn: 15000,
      totalCashOut: 2000,
      expectedBalance: 18000,
      actualBalance: 18000,
      difference: 0,
      movements: [
        { type: 'sale', amount: 5000, reference: 'E310000000001' },
        { type: 'cash_in', amount: 10000, description: 'Fondo adicional' }
      ]
    };

    return NextResponse.json(ticketData);

  } catch (error) {
    console.error('Error fetching ticket data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
