import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const companySchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  rnc: z.string().regex(/^(?:\d{9}|\d{11})$/, 'El RNC debe tener 9 u 11 dígitos numéricos'),
  businessActivity: z.string().min(5, 'La actividad económica debe tener al menos 5 caracteres').optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = companySchema.safeParse(body);

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
