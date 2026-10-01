import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { companies } from '@/db/schema/companies';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { Logger } from '@/utils/logger';
import { generateCompanySlug } from '@/services/storefront/companyService';
import { erroresDePortada, limpiarPortada, PORTADA_VACIA, TEXTO_POR_DEFECTO, tituloPorDefecto } from '@/services/storefront/portada';
import { FaltaLaMigracionDePortada, PortadaRepositorio } from '@/services/storefront/portadaRepositorio';
import { esFotoAdmisible } from '@/services/productos/fotoDeProducto';

/**
 * Lote 235: la portada de la tienda publica de ESTA empresa (anuncio, titulo,
 * texto e imagen). Va en su propia ruta y no en `admin/settings` a proposito:
 * alli un ajuste nuevo tiene seis sitios que tocar, y en los lotes 178 y 200 uno
 * se quedo sin escribir en la columna sin que nada fallara ("parametro sordo").
 * Aqui lo que se valida es lo que se guarda, en un solo sitio.
 */
const noAutenticado = () =>
  NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } }, { status: 401 });

const fallo = (error: unknown, donde: string) => {
  const e = error as Error & { status?: number; code?: string };
  if (e.status === 403) {
    return NextResponse.json({ success: false, error: { code: e.code || 'FORBIDDEN', message: e.message } }, { status: 403 });
  }
  if (e instanceof FaltaLaMigracionDePortada) {
    return NextResponse.json({ success: false, error: { code: 'MIGRATION_PENDING', message: e.message } }, { status: 409 });
  }
  Logger.error(`[portada] ${donde}`, { motivo: e.message });
  return NextResponse.json({ success: false, error: { code: 'SERVER_ERROR', message: 'No se pudo completar la operación.' } }, { status: 500 });
};

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return noAutenticado();
  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'administracion', 'read');
    const [empresa] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, auth.companyId)).limit(1);
    const nombre = empresa?.name ?? '';
    const portada = (await PortadaRepositorio.leer(auth.companyId)) ?? PORTADA_VACIA;
    return NextResponse.json({
      success: true,
      data: {
        portada,
        //  Lo que la tienda ensena cuando un campo esta vacio: la pantalla lo pone
        //  de ejemplo en cada campo, para que "vacio" no parezca "roto".
        porDefecto: { titulo: tituloPorDefecto(nombre), texto: TEXTO_POR_DEFECTO },
        tienda: `/${generateCompanySlug(nombre)}`,
      },
    });
  } catch (error: unknown) {
    return fallo(error, 'no se pudo leer');
  }
}

export async function PUT(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return noAutenticado();
  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, auth.companyId, 'administracion', 'write');

    const cuerpo: unknown = await req.json().catch(() => null);
    if (!cuerpo || typeof cuerpo !== 'object') {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Faltan los datos de la portada.' } }, { status: 400 });
    }
    const portada = limpiarPortada(cuerpo as Record<string, unknown>);

    const campos: Record<string, string> = { ...erroresDePortada(portada) };
    //  La imagen solo puede ser una SUBIDA por esta empresa (o ninguna): la tienda
    //  es publica, y una direccion ajena serviria para rastrear a los visitantes.
    if (!esFotoAdmisible(portada.imagenUrl, process.env.SUPABASE_URL || '', auth.companyId)) {
      campos.imagenUrl = 'La imagen no es válida. Súbela desde este formulario.';
    }
    if (Object.keys(campos).length > 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: Object.values(campos)[0], fields: campos } },
        { status: 400 },
      );
    }

    const guardada = await PortadaRepositorio.guardar(auth.companyId, portada);
    if (!guardada) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Esta empresa aún no tiene configuración. Guarda primero los datos de la empresa.' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: { portada } });
  } catch (error: unknown) {
    return fallo(error, 'no se pudo guardar');
  }
}
