import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { CustomerRepository } from '@/repositories/customerRepository';
import { z } from 'zod';

const createCustomerSchema = z.object({
  rncCedula: z.string().min(9, 'El RNC o Cédula es muy corto').max(15, 'El RNC o Cédula es muy largo').optional().or(z.literal('')),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    await checkRateLimit(ip, 'standard');

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = await CustomerRepository.findAll(session.companyId, search, limit, offset);

    return NextResponse.json({
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        limit,
        offset
      }
    });
  } catch (error: any) {
    console.error('Error fetching customers:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    await checkRateLimit(ip, 'standard');

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createCustomerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const newCustomer = await CustomerRepository.create({
      ...parsed.data,
      companyId: session.companyId,
      rncCedula: parsed.data.rncCedula || '',
    });

    return NextResponse.json({ success: true, data: newCustomer }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating customer:', error);
    const isDuplicate = error.message.includes('ya existe') || error.message.includes('duplicate');
    return NextResponse.json(
      { success: false, error: { code: isDuplicate ? 'CONFLICT' : 'SERVER_ERROR', message: error.message } },
      { status: isDuplicate ? 409 : 500 }
    );
  }
}
