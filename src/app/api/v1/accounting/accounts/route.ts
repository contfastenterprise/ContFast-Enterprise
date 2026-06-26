import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { AccountingRepository } from '@/repositories/accountingRepository';
import { enforcePermission } from '@/middleware/permissions';
import { getCache, setCache, clearCachePattern } from '@/infrastructure/redis';
import { z } from 'zod';

const createAccountSchema = z.object({
  code: z.string().min(1, 'El código es requerido'),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parentId: z.string().optional().nullable(),
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

    await enforcePermission(session.userId, session.role, session.roleId, 'contabilidad', 'read');

    // Caching layer
    const cacheKey = `cache:accounts:${session.companyId}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, data: JSON.parse(cached) }, { headers: resHeaders });
    }

    const accounts = await AccountingRepository.getChartOfAccounts(session.companyId);

    // Save to cache for 1 hour
    await setCache(cacheKey, JSON.stringify(accounts), 3600);

    return NextResponse.json({ success: true, data: accounts }, { headers: resHeaders });
  } catch (error: any) {
    console.error('Error fetching accounts:', error);
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

    await enforcePermission(session.userId, session.role, session.roleId, 'contabilidad', 'write');

    const body = await req.json();
    const parsed = createAccountSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } },
        { status: 400 }
      );
    }

    const newAccount = await AccountingRepository.createAccount({
      ...parsed.data,
      companyId: session.companyId,
      parentId: parsed.data.parentId || undefined
    });

    // Invalidate cache
    await clearCachePattern(`cache:accounts:${session.companyId}*`);

    return NextResponse.json({ success: true, data: newAccount }, { status: 201, headers: resHeaders });
  } catch (error: any) {
    console.error('Error creating account:', error);
    const isDuplicate = error.message.includes('ya existe');
    const status = error.status || (isDuplicate ? 409 : 500);
    return NextResponse.json(
      { success: false, error: { code: isDuplicate ? 'CONFLICT' : (error.code || 'SERVER_ERROR'), message: error.message } },
      { status }
    );
  }
}
