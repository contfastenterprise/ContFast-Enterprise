import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { CompanyRepository } from '@/repositories/companyRepository';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for storage
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limiting
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const allowed = await checkRateLimit(ip, 'standard');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiadas peticiones. Intente más tarde.' } },
        { status: 429 }
      );
    }

    // 2. Authentication
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    // 3. Authorization (only admins can change company logo)
    await enforcePermission(session.userId, session.role, session.roleId, 'administracion', 'write');

    // 4. Parse FormData
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: { message: 'No se recibió ningún archivo' } }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ success: false, error: { message: 'El archivo debe ser una imagen' } }, { status: 400 });
    }

    // 5. Upload to Supabase Storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${session.companyId}_logo_${Date.now()}.${fileExt}`;
    const filePath = `${session.companyId}/${fileName}`;

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('company_logos')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Error subiendo la imagen: ${uploadError.message}`);
    }

    // 6. Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('company_logos')
      .getPublicUrl(filePath);

    // 7. Update database
    await CompanyRepository.updateLogoUrl(session.companyId, publicUrl);

    return NextResponse.json({
      success: true,
      data: { logoUrl: publicUrl },
      message: 'Logo corporativo actualizado exitosamente'
    });
  } catch (error: any) {
    console.error('Logo Upload Error:', error);
    return NextResponse.json(
      { success: false, error: { message: error.message || 'Error interno del servidor' } },
      { status: 500 }
    );
  }
}
