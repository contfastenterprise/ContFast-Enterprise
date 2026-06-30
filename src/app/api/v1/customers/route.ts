import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { CustomerRepository } from '@/repositories/customerRepository';
import { enforcePermission } from '@/middleware/permissions';
import { z } from 'zod';
import { syncCustomerToGoogleContacts } from '@/services/googleContactsService';
import { getCache, setCache, clearCachePattern } from '@/infrastructure/redis';

const createCustomerSchema = z.object({
  rncCedula: z.string().min(9, 'El RNC o Cédula es muy corto').max(15, 'El RNC o Cédula es muy largo').optional().or(z.literal('')),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  creditLimit: z.string().optional().or(z.number()).transform(v => v ? String(v) : '0.00'),
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

    await enforcePermission(session.userId, session.role, session.roleId, 'clientes', 'read');

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const cacheKey = `cache:customers:${session.companyId}:limit_${limit}_offset_${offset}_search_${search || ''}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), { headers: resHeaders });
    }

    const result = await CustomerRepository.findAll(session.companyId, search, limit, offset);
    const responseData = {
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        limit,
        offset
      }
    };

    await setCache(cacheKey, JSON.stringify(responseData), 3600);

    return NextResponse.json(responseData, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error fetching customers:', error);
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

    await enforcePermission(session.userId, session.role, session.roleId, 'clientes', 'write');

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

    // Invalidate customer cache for this company
    await clearCachePattern(`cache:customers:${session.companyId}:*`);

    // Asynchronously synchronize to Google Contacts in the background
    syncCustomerToGoogleContacts({
      name: newCustomer.name,
      email: newCustomer.email,
      phone: newCustomer.phone,
      address: newCustomer.address,
    }).catch(err => console.error('[CustomersRoute] Google Contacts sync failed:', err.message));

    return NextResponse.json({ success: true, data: newCustomer }, { status: 201, headers: resHeaders });
  } catch (error: any) {
    console.error('Error creating customer:', error);
    const isDuplicate = error.message.includes('ya existe') || error.message.includes('duplicate');
    const status = error.status || (isDuplicate ? 409 : 500);
    return NextResponse.json(
      { success: false, error: { code: isDuplicate ? 'CONFLICT' : (error.code || 'SERVER_ERROR'), message: error.message } },
      { status }
    );
  }
}
