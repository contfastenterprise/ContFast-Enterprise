import { NextResponse } from 'next/server';
import { db, companies } from '@/db';
import { count } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await db.select({ value: count() }).from(companies);
    const totalCompanies = result[0]?.value || 0;

    return NextResponse.json({
      success: true,
      data: {
        initialized: totalCompanies > 0
      }
    });
  } catch (error: any) {
    // Este endpoint esta excluido de la autenticacion en proxy.ts: lo consulta
    // cualquiera sin sesion. Devolver error.message expondria el detalle del
    // fallo de Postgres (host, base de datos, a veces la cadena de conexion),
    // asi que el detalle se queda en el log del servidor y al cliente solo le
    // llega un mensaje generico. El codigo DATABASE_ERROR se mantiene para no
    // romper a ningun consumidor que ramifique por el.
    console.error('Error in GET /api/v1/setup/status:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'No se pudo verificar el estado del sistema. Intente nuevamente en unos minutos.',
        },
      },
      { status: 500 }
    );
  }
}
