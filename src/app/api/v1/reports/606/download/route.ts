import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { generate606Txt } from '@/services/expenseService';

/** GET: Return the generated 606 TXT file for download */
export async function GET(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);
  if (!auth) {
    return NextResponse.json({ success: false, error: { message: 'No autenticado.' } }, { status: 401 });
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'reportes', 'read');

    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get('companyId');
    const period = searchParams.get('period');

    if (!companyId || !period) {
      return NextResponse.json({ error: 'companyId and period are required' }, { status: 400 });
    }

    if (auth.role !== 'sistemas' && auth.companyId !== companyId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const txtContent = await generate606Txt(companyId, period);
    
    // Merge resHeaders into the download headers
    const headers = new Headers(resHeaders);
    headers.set('Content-Type', 'text/plain');
    headers.set('Content-Disposition', `attachment; filename="606_${companyId}_${period}.txt"`);
    return new NextResponse(txtContent, { status: 200, headers });
  } catch (error: any) {
    console.error('Error generating 606 download:', error);
    const status = error.status || 500;
    return NextResponse.json({ error: error.message || 'Error interno' }, { status });
  }
}
