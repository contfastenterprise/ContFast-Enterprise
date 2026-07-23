import { NextRequest, NextResponse } from 'next/server';
import { db, expenseTypes } from '@/db';
import { verifyAuth } from '@/middleware/auth';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { eq, and } from 'drizzle-orm';
import { getCache, setCache, delCache } from '@/infrastructure/redis';

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

    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    const cacheKey = `expense_types:${session.companyId}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        return NextResponse.json({ success: true, data: parsed, fromCache: true });
      } catch (e) {
        console.error('Failed to parse cached expense types:', e);
      }
    }

    // Fetch all (both active and inactive) for admin UI and report lookups
    const types = await db
      .select({
        id: expenseTypes.id,
        code: expenseTypes.code,
        name: expenseTypes.name,
        status: expenseTypes.status
      })
      .from(expenseTypes)
      .where(eq(expenseTypes.companyId, session.companyId));

    // Sort by code ascending
    types.sort((a, b) => a.code.localeCompare(b.code));

    // Cache for 1 hour (3600 seconds)
    await setCache(cacheKey, JSON.stringify(types), 3600);

    return NextResponse.json({ success: true, data: types });
  } catch (err: any) {
    console.error('Error fetching expense types:', err);
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    // Only administrators or systems can modify expense types
    if (session.role !== 'administracion' && session.role !== 'sistemas') {
      return NextResponse.json({ success: false, error: { message: 'Permiso denegado' } }, { status: 403 });
    }

    const body = await req.json();
    const { code, name } = body;

    if (!code || code.trim().length !== 2 || isNaN(Number(code))) {
      return NextResponse.json({ success: false, error: { message: 'El código debe tener exactamente 2 dígitos numéricos.' } }, { status: 400 });
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: { message: 'El nombre es requerido.' } }, { status: 400 });
    }

    const cleanCode = code.trim();
    const cleanName = name.trim();

    // Check if code already exists
    const [existing] = await db
      .select()
      .from(expenseTypes)
      .where(and(
        eq(expenseTypes.companyId, session.companyId),
        eq(expenseTypes.code, cleanCode)
      ))
      .limit(1);

    if (existing) {
      return NextResponse.json({ success: false, error: { message: `El código ${cleanCode} ya está registrado.` } }, { status: 400 });
    }

    const [newType] = await db
      .insert(expenseTypes)
      .values({
        companyId: session.companyId,
        code: cleanCode,
        name: cleanName,
        status: 'active'
      })
      .returning();

    // Invalidate Cache
    const cacheKey = `expense_types:${session.companyId}`;
    await delCache(cacheKey);

    return NextResponse.json({ success: true, data: newType });
  } catch (err: any) {
    console.error('Error creating expense type:', err);
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}
