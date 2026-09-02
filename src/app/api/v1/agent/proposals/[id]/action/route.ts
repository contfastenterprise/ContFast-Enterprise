import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { AgentRepository } from '@/repositories/agentRepository';

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'administracion' && user.role !== 'sistemas') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { status } = await req.json();
    if (status !== 'approved' && status !== 'rejected') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const companyId = user.companyId;
    const modo = user.modo;

    const updated = await AgentRepository.updateProposalStatus(id, companyId, modo, status, user.userId);
    if (!updated) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Error updating proposal:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
