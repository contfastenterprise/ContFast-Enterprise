import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { AgentRepository } from '@/repositories/agentRepository';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'administracion' && user.role !== 'sistemas') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const companyId = user.companyId;
    const modo = user.modo;

    const proposals = await AgentRepository.getProposals(companyId, modo);
    return NextResponse.json(proposals);
  } catch (error: any) {
    console.error('Error fetching proposals:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
