import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { CustomerRepository } from '@/repositories/customerRepository';
import { z } from 'zod';
import { syncCustomerToGoogleContacts } from '@/services/googleContactsService';
import { getCache, setCache, clearCachePattern } from '@/infrastructure/redis';

const updateCustomerSchema = z.object({
  rncCedula: z.string().min(9).max(15).optional(),
  name: z.string().min(2).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<any> }) {
  try {
    const { id } = await params;
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

    const cacheKey = `cache:customers:${session.companyId}:id_${id}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), { headers: resHeaders });
    }

    const customer = await CustomerRepository.findById(id, session.companyId);
    if (!customer) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Cliente no encontrado' } }, { status: 404 });
    }

    const responseData = { success: true, data: customer };
    await setCache(cacheKey, JSON.stringify(responseData), 3600);

    return NextResponse.json(responseData, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error fetching customer:', error);
    const status = error.status || 500;
    return NextResponse.json(
      { success: false, error: { code: error.code || 'SERVER_ERROR', message: error.message } },
      { status }
    );
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<any> }) {
  try {
    const { id } = await params;
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
    const parsed = updateCustomerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const updated = await CustomerRepository.update(id, session.companyId, parsed.data);
    if (!updated) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Cliente no encontrado' } }, { status: 404 });
    }

    // Invalidate customer cache for this company
    await clearCachePattern(`cache:customers:${session.companyId}:*`);

    // Asynchronously synchronize to Google Contacts in the background
    syncCustomerToGoogleContacts({
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      address: updated.address,
    }).catch(err => console.error('[CustomerByIdRoute] Google Contacts sync failed:', err.message));

    return NextResponse.json({ success: true, data: updated }, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error updating customer:', error);
    const isDuplicate = error.message.includes('en uso');
    const status = error.status || (isDuplicate ? 409 : 500);
    return NextResponse.json(
      { success: false, error: { code: isDuplicate ? 'CONFLICT' : (error.code || 'SERVER_ERROR'), message: error.message } },
      { status }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<any> }) {
  try {
    const { id } = await params;
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

    await enforcePermission(session.userId, session.role, session.roleId, 'clientes', 'delete');

    const deleted = await CustomerRepository.softDelete(id, session.companyId);
    if (!deleted) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Cliente no encontrado' } }, { status: 404 });
    }

    // Invalidate customer cache for this company
    await clearCachePattern(`cache:customers:${session.companyId}:*`);

    return NextResponse.json({ success: true, message: 'Cliente eliminado correctamente' }, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error deleting customer:', error);
    const status = error.status || 500;
    return NextResponse.json(
      { success: false, error: { code: error.code || 'SERVER_ERROR', message: error.message } },
      { status }
    );
  }
}
