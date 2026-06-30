import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: { message: 'El cliente de almacenamiento no está configurado en el servidor.' } },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: { message: 'Archivo no especificado.' } },
        { status: 400 }
      );
    }

    // Securely construct target filePath using the authenticated user's ID to prevent IDOR/Traversal
    const fileExt = file.name.split('.').pop() || 'webp';
    // Sanitize extension to prevent any injection
    const cleanExt = fileExt.replace(/[^a-zA-Z0-9]/g, '');
    const filePath = `${session.userId}/avatar_${Date.now()}.${cleanExt}`;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      }
    });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Asegurar que el bucket 'avatars' exista
    const { data: buckets } = await supabase.storage.listBuckets();
    const hasAvatarsBucket = buckets?.some(b => b.name === 'avatars');
    if (!hasAvatarsBucket) {
      const { error: createError } = await supabase.storage.createBucket('avatars', {
        public: true,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
        fileSizeLimit: 3 * 1024 * 1024 // 3MB
      });
      if (createError) {
        console.error('Failed to create avatars bucket:', createError.message);
      }
    }

    // Subir usando el cliente con Service Role para evitar problemas de firma JWT en cliente
    const { error } = await supabase.storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      return NextResponse.json({ success: false, error: { message: error.message } }, { status: 400 });
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      data: {
        publicUrl,
        filePath: filePath,
      }
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { message: err.message || 'Error interno del servidor.' } },
      { status: 500 }
    );
  }
}
