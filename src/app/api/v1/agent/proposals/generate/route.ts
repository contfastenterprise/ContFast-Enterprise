import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { AgentRepository } from '@/repositories/agentRepository';
import { GeminiService } from '@/services/geminiService';

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'administracion' && user.role !== 'sistemas') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const companyId = user.companyId;
    const modo = user.modo || 'PRODUCCION';

    // 1. Get Aggregated Metrics
    const metrics = await AgentRepository.aggregateCashFlow(companyId, 30, modo);

    console.log('--- DATOS ENVIADOS A GEMINI ---');
    console.log(JSON.stringify(metrics, null, 2));
    console.log('-------------------------------');

    // 2. Call AI
    const aiResult = await GeminiService.analyzeCashFlow(metrics);

    // 3. Save Proposal
    const proposal = await AgentRepository.createProposal(companyId, modo, 'flujo_efectivo', aiResult);

    return NextResponse.json(proposal, { status: 201 });
  } catch (error: any) {
    console.error('Error generating proposal:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
