import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { HRRepository } from '@/repositories/hrRepository';
import { z } from 'zod';
import { leerSalarioMinimo, guardarSalarioMinimo } from '@/services/nomina/salarioMinimoRepositorio';
import { MOTIVO_SIN_COLUMNA_SALARIO_MINIMO } from '@/services/nomina/topesTss';

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
  // Lote 290: el salario minimo de los topes de la TSS (columna fuera de Drizzle,
  // migracion 0020). Opcional: quien no lo manda no lo cambia.
  salarioMinimoTss: z.number().positive('El salario mínimo de los topes tiene que ser mayor que cero').max(10_000_000).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const config = await HRRepository.getPayrollConfig(session.companyId);
    const brackets = await HRRepository.getIsrBrackets();
    const salarioMinimoTss = await leerSalarioMinimo(session.companyId);

    return NextResponse.json({
      success: true,
      data: {
        config,
        brackets,
        salarioMinimoTss,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: { message: (error as Error).message } }, { status: 500 });
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

    // Lote 290: el salario minimo va aparte (su columna no esta en Drizzle). Sin la
    // migracion 0020 solo se admite el de por defecto, y se dice ANTES de escribir nada.
    const { salarioMinimoTss, ...tasas } = parsed.data;
    if (salarioMinimoTss !== undefined) {
      const actual = await leerSalarioMinimo(session.companyId);
      if (!actual.hayColumna && salarioMinimoTss !== actual.valor) {
        return NextResponse.json({ success: false, error: { code: 'NOMINA_NO_PERMITIDA', message: MOTIVO_SIN_COLUMNA_SALARIO_MINIMO } }, { status: 409 });
      }
    }

    const oldConfig = await HRRepository.getPayrollConfig(session.companyId);
    
    // Convert to strings for database decimal columns
    const stringifiedData = Object.fromEntries(
      Object.entries(tasas).map(([key, val]) => [key, val.toString()])
    );

    const config = await HRRepository.updatePayrollConfig(session.companyId, stringifiedData);
    if (salarioMinimoTss !== undefined && (await leerSalarioMinimo(session.companyId)).hayColumna) {
      await guardarSalarioMinimo(session.companyId, salarioMinimoTss);
    }

    await HRRepository.logAudit(
      session.companyId, session.modo,
      session.userId,
      'update_payroll_config',
      'payroll_configs',
      config.id,
      oldConfig,
      config
    );

    return NextResponse.json({ success: true, data: config });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: { message: (error as Error).message } }, { status: 500 });
  }
}
