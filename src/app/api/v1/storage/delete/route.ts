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

    const { path } = await req.json();

    if (!path) {
      return NextResponse.json(
        { success: false, error: { message: 'Ruta del archivo no especificada.' } },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      }
    });

    const { error } = await supabase.storage
      .from('avatars')
      .remove([path]);

    if (error) {
      return NextResponse.json({ success: false, error: { message: error.message } }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Archivo eliminado exitosamente.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { message: err.message || 'Error interno del servidor.' } },
      { status: 500 }
    );
  }
}
