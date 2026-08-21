import { NextRequest, NextResponse } from 'next/server';
import { sendDocumentEmailAction } from '@/actions/documents';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const { type, id } = await params;
    const body = await req.json();
    const { toEmail } = body;

    if (!toEmail) {
      return NextResponse.json({ error: 'Email destino es requerido' }, { status: 400 });
    }

    const result = await sendDocumentEmailAction(type, id, toEmail);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
