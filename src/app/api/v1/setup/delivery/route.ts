import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const deliverySchema = z.object({
  autoDeliveryNotes: z.boolean({
    message: 'La opción de conducción automática debe ser un valor booleano',
  }),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = deliverySchema.safeParse(body);

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
