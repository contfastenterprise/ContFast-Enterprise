// src/app/api/v1/reports/606/download/route.ts
import { NextResponse } from 'next/server';
import { generate606Txt } from '@/services/expenseService';

/** GET: Return the generated 606 TXT file for download */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get('companyId');
  const period = url.searchParams.get('period');
  if (!companyId || !period) {
    return NextResponse.json({ error: 'companyId and period are required' }, { status: 400 });
  }
  const txtContent = await generate606Txt(companyId, period);
  const headers = new Headers();
  headers.set('Content-Type', 'text/plain');
  headers.set('Content-Disposition', `attachment; filename="606_${companyId}_${period}.txt"`);
  return new NextResponse(txtContent, { status: 200, headers });
}
