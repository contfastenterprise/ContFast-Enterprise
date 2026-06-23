import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { HRRepository } from '@/repositories/hrRepository';
import { z } from 'zod';

const positionSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  description: z.string().optional().or(z.literal('')),
});

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const data = await HRRepository.findPositions(session.companyId);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const body = await req.json();
    const parsed = positionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const pos = await HRRepository.createPosition({
      companyId: session.companyId,
      name: parsed.data.name,
      description: parsed.data.description,
    });

    await HRRepository.logAudit(session.companyId, session.userId, 'create_position', 'positions', pos.id, null, pos);

    return NextResponse.json({ success: true, data: pos }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: { message: 'ID es obligatorio' } }, { status: 400 });
    }

    const body = await req.json();
    const parsed = positionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const oldPos = (await HRRepository.findPositions(session.companyId)).find(p => p.id === id);
    const pos = await HRRepository.updatePosition(id, session.companyId, {
      name: parsed.data.name,
      description: parsed.data.description,
    });

    await HRRepository.logAudit(session.companyId, session.userId, 'update_position', 'positions', id, oldPos, pos);

    return NextResponse.json({ success: true, data: pos });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: { message: 'ID es obligatorio' } }, { status: 400 });
    }

    const oldPos = (await HRRepository.findPositions(session.companyId)).find(p => p.id === id);
    const pos = await HRRepository.deletePosition(id, session.companyId);

    await HRRepository.logAudit(session.companyId, session.userId, 'delete_position', 'positions', id, oldPos, null);

    return NextResponse.json({ success: true, data: pos });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: { message: error.message } }, { status: 500 });
  }
}
