import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { ApService } from '@/services/apService';

/**
 * POST /api/v1/ap/payments/apply-guarantees - Apply all due guarantee checks manually
 */
export async function POST(req: NextRequest) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'proveedores', 'write');

    let checkId: string | undefined;
    try {
      const body = await req.json();
      checkId = body?.checkId;
    } catch (e) {
      // Empty body is allowed for bulk apply
    }

    const result = checkId
      ? await ApService.applySingleGuaranteeCheck(auth.companyId, checkId)
      : await ApService.applyDueGuaranteeChecks(auth.companyId);

    return NextResponse.json(
      { 
        success: true, 
        message: checkId
          ? `Se aplicó contablemente el cheque en garantía con éxito.`
          : `Se aplicaron contablemente ${result.appliedCount} cheque(s) en garantía con un total de $${result.totalAppliedAmount.toFixed(2)}.`,
        data: result 
      },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/ap/payments/apply-guarantees:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
