import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const fiscalSchema = z.object({
  dgiiEnv: z.enum(['test', 'production'], {
    message: "El ambiente debe ser 'test' o 'production'",
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
