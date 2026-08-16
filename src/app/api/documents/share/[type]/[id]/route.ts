import { NextRequest, NextResponse } from 'next/server';
import { createShareTokenAction } from '@/actions/documents';

export async function POST(
  req: NextRequest,
  { params }: { params: { type: string; id: string } }
) {
  try {
    const { type, id } = params;

    const result = await createShareTokenAction(type, id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ url: result.url });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
