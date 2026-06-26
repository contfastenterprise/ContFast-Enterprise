import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { SupplierRepository } from '@/repositories/supplierRepository';
import { enforcePermission } from '@/middleware/permissions';
import { z } from 'zod';

const createSupplierSchema = z.object({
  rnc: z.string().min(9, 'El RNC es muy corto').max(15, 'El RNC es muy largo'),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const resHeaders = new Headers();
    const session = await verifyAuth(req, resHeaders);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    await enforcePermission(session.userId, session.role, session.roleId, 'proveedores', 'read');

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = await SupplierRepository.findAll(session.companyId, search, limit, offset);

    return NextResponse.json({
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        limit,
        offset
      }
    }, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error fetching suppliers:', error);
    const status = error.status || 500;
    return NextResponse.json(
      { success: false, error: { code: error.code || 'SERVER_ERROR', message: error.message } },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    const resHeaders = new Headers();
    const session = await verifyAuth(req, resHeaders);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    await enforcePermission(session.userId, session.role, session.roleId, 'proveedores', 'write');

    const body = await req.json();
    const parsed = createSupplierSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const newSupplier = await SupplierRepository.create({
      ...parsed.data,
      companyId: session.companyId,
    });

    return NextResponse.json({ success: true, data: newSupplier }, { status: 201, headers: resHeaders });
  } catch (error: any) {
    console.error('Error creating supplier:', error);
    const isDuplicate = error.message.includes('ya existe');
    const status = error.status || (isDuplicate ? 409 : 500);
    return NextResponse.json(
      { success: false, error: { code: isDuplicate ? 'CONFLICT' : (error.code || 'SERVER_ERROR'), message: error.message } },
      { status }
    );
  }
}
