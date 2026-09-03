import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const fiscalSchema = z.object({
  // CERTIFICACION se reconoce como modo y le corresponde el ambiente CerteCF,
  // pero el sistema NO lo soporta todavia (135 declaraciones fijan PRODUCCION o
  // PRUEBA). Se rechaza AQUI, en la entrada, y no mas adentro: guardarlo hacia
  // que la empresa operase contra TesteCF mientras la insignia del panel decia
  // "CERT". Mejor no poder elegirlo que elegirlo y que no signifique nada.
  dgiiEnv: z.enum(['PRUEBA', 'PRODUCCION'], {
    message: 'El modo debe ser PRUEBA o PRODUCCION. CERTIFICACION todavia no esta soportado.',
  }),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = fiscalSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: error.message } },
      { status: 400 }
    );
  }
}
