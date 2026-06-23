import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { HRRepository } from '@/repositories/hrRepository';
import { z } from 'zod';

const configSchema = z.object({
  afpEmployee: z.number().nonnegative(),
  sfsEmployee: z.number().nonnegative(),
  afpEmployer: z.number().nonnegative(),
  sfsEmployer: z.number().nonnegative(),
  infotepEmployer: z.number().nonnegative(),
  riskEmployer: z.number().nonnegative(),
  overtimeDiurnaRate: z.number().nonnegative(),
  overtimeNocturnaRate: z.number().nonnegative(),
  overtimeFestivaRate: z.number().nonnegative(),
  overtimeDobleRate: z.number().nonnegative(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const config = await HRRepository.getPayrollConfig(session.companyId);
    const brackets = await HRRepository.getIsrBrackets();

    return NextResponse.json({
      success: true,
      data: {
        config,
        brackets,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session || (session.role !== 'sistemas' && session.role !== 'administracion' && session.role !== 'recursos_humanos')) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado. Permisos insuficientes.' } }, { status: 403 });
    }

    const body = await req.json();
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const oldConfig = await HRRepository.getPayrollConfig(session.companyId);
    
    // Convert to strings for database decimal columns
    const stringifiedData = Object.fromEntries(
      Object.entries(parsed.data).map(([key, val]) => [key, val.toString()])
    );

    const config = await HRRepository.updatePayrollConfig(session.companyId, stringifiedData);

    await HRRepository.logAudit(
      session.companyId,
      session.userId,
      'update_payroll_config',
      'payroll_configs',
      config.id,
      oldConfig,
      config
    );

    return NextResponse.json({ success: true, data: config });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}
