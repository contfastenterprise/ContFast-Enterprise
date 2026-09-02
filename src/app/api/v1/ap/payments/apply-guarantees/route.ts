import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { ApService } from '@/services/apService';

/**
 * POST /api/v1/ap/payments/apply-guarantees
 *
 * Registra el COBRO de cheques en garantia que el banco ya pago.
 *
 * Auditoria ARP-25: hasta ahora un cuerpo vacio significaba "aplica todos los
 * cheques vencidos", y el sistema los daba por cobrados, movia el banco y
 * asentaba sin que nadie hubiera confirmado nada. Vencer no es cobrar. Ahora
 * hay que decir QUE cheques pago el banco y EN QUE FECHA.
 *
 *   { checkId: "..." , fechaCobro?: "AAAA-MM-DD" }              un cheque
 *   { checkIds: ["...", "..."], fechaCobro: "AAAA-MM-DD" }      varios
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
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'proveedores', 'write');

    let checkId: string | undefined;
    let checkIds: string[] | undefined;
    let fechaCobro: string | undefined;
    try {
      const body = await req.json();
      checkId = body?.checkId;
      checkIds = Array.isArray(body?.checkIds) ? body.checkIds : undefined;
      fechaCobro = body?.fechaCobro;
    } catch (e) {
      // Cuerpo vacio o ilegible. Antes valia como "aplica todos los vencidos";
      // ahora se rechaza justo aqui debajo.
    }

    if (!checkId && (!checkIds || checkIds.length === 0)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CONFIRMACION_REQUERIDA',
            message:
              'Seleccione los cheques que el banco pagó. Que un cheque en garantía haya vencido no ' +
              'significa que se haya presentado al banco: confírmelo contra el estado de cuenta.',
          },
        },
        { status: 400, headers: resHeaders }
      );
    }

    const result: any = checkId
      ? await ApService.applySingleGuaranteeCheck(
          auth.companyId,
          checkId,
          auth.modo,
          fechaCobro,
          // Auditoria JRN-16: quien confirma el cobro queda en el asiento.
          auth.userId
        )
      : await ApService.confirmarCobroDeChequesEnGarantia(
          auth.companyId,
          auth.modo,
          checkIds as string[],
          fechaCobro as string,
          auth.userId
        );

    return NextResponse.json(
      { 
        success: true, 
        message: checkId
          ? 'Se registró el cobro del cheque en garantía.'
          : `Se registró el cobro de ${result.appliedCount} cheque(s) por un total de ` +
            `$${result.totalAppliedAmount.toFixed(2)}.` +
            (result.noAplicados?.length
              ? ` ${result.noAplicados.length} no se pudo aplicar: revise el detalle.`
              : ''),
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
