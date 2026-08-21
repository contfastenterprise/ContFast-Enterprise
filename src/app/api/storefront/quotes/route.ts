import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { StorefrontCompanyService } from '@/services/storefront/companyService';
import { StorefrontQuoteService } from '@/services/storefront/quoteService';
import { verifyAuth } from '@/middleware/auth';

const createQuoteSchema = z.object({
  empresaSlug: z.string(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive(),
  })).min(1, "El carrito no puede estar vacío")
});

export async function POST(req: NextRequest) {
  try {
    // 1. Verificar Autenticación
    const headers = new Headers();
    const session = await verifyAuth(req, headers);
    
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: { message: 'Debes iniciar sesión para enviar una cotización' } }, { status: 401 });
    }
    
    const userId = session.userId;

    // 2. Validar payload
    const body = await req.json();
    const parsed = createQuoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: 'Datos de carrito inválidos' } }, { status: 400 });
    }

    const { empresaSlug, items } = parsed.data;

    // 3. Resolver Empresa
    const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
    if (!company) {
      return NextResponse.json({ success: false, error: { message: 'Empresa no encontrada' } }, { status: 404 });
    }

    // 4. Crear Cotización
    const quote = await StorefrontQuoteService.createQuote(company.id, userId, items);

    return NextResponse.json({ success: true, data: quote });

  } catch (error: any) {
    console.error('Error al crear cotización:', error);
    return NextResponse.json({ success: false, error: { message: error.message || 'Error interno del servidor' } }, { status: 500 });
  }
}
