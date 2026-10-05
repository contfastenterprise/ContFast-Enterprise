import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { db, companies, subscriptions, plans } from '@/db';
import { z } from 'zod';
import { desc, eq, and, ne } from 'drizzle-orm';
import { crearEmpresaConSuSiembra, rncYaTieneEmpresa } from '@/services/empresas/altaDeEmpresa';
import { RNC_INVALIDO, RNC_YA_REGISTRADO, rncDeLaEmpresa, esRncRepetidoEnLaBase } from '@/services/empresas/rncDeLaEmpresa';
import { esSistemas } from '@/utils/rolMatch';

const createCompanySchema = z.object({
  name: z.string().min(1, 'El Nombre Comercial es requerido'),
  rnc: z.string().min(1, 'El RNC es requerido').refine((t) => rncDeLaEmpresa(t) !== null, RNC_INVALIDO),
  email: z.string().email('El correo electrónico no es válido').min(1, 'El correo electrónico es requerido'),
  businessActivity: z.string().optional(),
  address: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    // Auditoria P0-01 (2026-09-03): 'sistemas' es un rol ESTANDAR de cada
    // empresa cliente, no un rol de plataforma -- este endpoint lista/crea
    // empresas de TODA la plataforma, asi que ademas del rol exacto hace
    // falta la marca `isPlatformStaff`. Ver utils/rolMatch.ts y
    // drizzle/0048_staff_de_plataforma.sql.
    if (!session || !esSistemas(session.role) || !session.isPlatformStaff) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado. Se requiere ser staff de plataforma.' } }, { status: 403 });
    }

    const list = await db
      .select({
        id: companies.id,
        name: companies.name,
        rnc: companies.rnc,
        email: companies.email,
        businessActivity: companies.businessActivity,
        status: companies.status,
        createdAt: companies.createdAt,
        subscriptionId: subscriptions.id,
        subscriptionStatus: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        planId: plans.id,
        planName: plans.name,
      })
      .from(companies)
      .leftJoin(subscriptions, and(eq(companies.id, subscriptions.companyId), ne(subscriptions.status, 'canceled')))
      .leftJoin(plans, eq(subscriptions.planId, plans.id))
      .orderBy(desc(companies.createdAt));

    return NextResponse.json({ success: true, data: list });
  } catch (error: unknown) {
    console.error('Error fetching companies:', error);
    return NextResponse.json({ success: false, error: { message: 'Error interno del servidor' } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    // Auditoria P0-01 (2026-09-03): 'sistemas' es un rol ESTANDAR de cada
    // empresa cliente, no un rol de plataforma -- este endpoint lista/crea
    // empresas de TODA la plataforma, asi que ademas del rol exacto hace
    // falta la marca `isPlatformStaff`. Ver utils/rolMatch.ts y
    // drizzle/0048_staff_de_plataforma.sql.
    if (!session || !esSistemas(session.role) || !session.isPlatformStaff) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado. Se requiere ser staff de plataforma.' } }, { status: 403 });
    }

    const body = await req.json();
    const result = createCompanySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { message: result.error.issues[0].message } },
        { status: 400 }
      );
    }

    // Lote 287: la MISMA regla que el registro publico (services/empresas). El RNC
    // se guarda solo con digitos, y "ya registrado" mira todas las empresas, sin
    // guiones. Antes contestaba 400; un conflicto con lo que ya existe es 409.
    const rnc = rncDeLaEmpresa(result.data.rnc)!;
    if (await rncYaTieneEmpresa(db, rnc)) {
      return NextResponse.json(
        { success: false, error: { code: 'RNC_YA_REGISTRADO', message: RNC_YA_REGISTRADO } },
        { status: 409 }
      );
    }

    // Lote 287: el alta (empresa, ajustes, nomina, catalogo, periodos y permisos)
    // vive en services/empresas/altaDeEmpresa.ts, compartida con el registro.
    let newCompany;
    try {
      newCompany = await db.transaction(async (tx) => {
        const { empresa } = await crearEmpresaConSuSiembra(tx, {
          name: result.data.name,
          rnc,
          email: result.data.email,
          businessActivity: result.data.businessActivity,
          address: result.data.address,
          status: result.data.status,
        });
        return empresa;
      });
    } catch (e: unknown) {
      // Dos altas a la vez con el mismo RNC: la segunda choca con el indice unico.
      if (esRncRepetidoEnLaBase(e)) {
        return NextResponse.json(
          { success: false, error: { code: 'RNC_YA_REGISTRADO', message: RNC_YA_REGISTRADO } },
          { status: 409 }
        );
      }
      throw e;
    }

    return NextResponse.json({ success: true, data: newCompany });
  } catch (error: unknown) {
    console.error('Error creating company:', error);
    return NextResponse.json({ success: false, error: { message: 'Error interno del servidor' } }, { status: 500 });
  }
}
