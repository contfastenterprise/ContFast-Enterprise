import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { AdminRepository } from '@/repositories/adminRepository';

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session || session.roleName !== 'sistemas' && session.roleName !== 'administracion') {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 403 });
    }

    const roles = await AdminRepository.getRoles(session.companyId);
    return NextResponse.json({ success: true, data: roles });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}
