import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { db, companies, companySettings, roles, chartOfAccounts, payrollConfigs, permissions, rolePermissions, subscriptions, plans } from '@/db';
import { seedRolePermissionsForCompany } from '@/middleware/permissions';
import { DEFAULT_COMPANY_ROLES } from '@/utils/defaultRoles';
import { z } from 'zod';
import { desc, eq, and, ne, count } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { AccountingRepository } from '@/repositories/accountingRepository';
import { esSistemas } from '@/utils/rolMatch';

const createCompanySchema = z.object({
  name: z.string().min(1, 'El Nombre Comercial es requerido'),
  rnc: z.string().min(9, 'El RNC es requerido').max(11, 'El RNC debe tener entre 9 y 11 caracteres'),
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
  } catch (error: any) {
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

    // Check if RNC already exists
    const [existing] = await db.select().from(companies).where(eq(companies.rnc, result.data.rnc)).limit(1);
    if (existing) {
      return NextResponse.json(
        { success: false, error: { message: 'Ya existe una empresa con este RNC.' } },
        { status: 400 }
      );
    }

    // Execute the database setup in an atomic transaction
    const newCompany = await db.transaction(async (tx) => {
      // 1. Insert Company
      const [newComp] = await tx.insert(companies).values({
        name: result.data.name,
        rnc: result.data.rnc,
        email: result.data.email,
        businessActivity: result.data.businessActivity,
        address: result.data.address,
        status: result.data.status,
      }).returning();

      // 2. Generate Default Settings
      await tx.insert(companySettings).values({
        companyId: newComp.id,
        dgiiEnv: 'PRUEBA',
        printLayout: 'carta',
        printCopies: 2,
        msellerUrl: 'https://ecf.api.mseller.app/v1',
        autoDeliveryNotes: false,
      });

      // 3. Fetch global roles (seed if none exist)
      const checkRoles = await tx.select({ value: count() }).from(roles);
      let allRoles = [];
      if ((checkRoles[0]?.value || 0) === 0) {
        allRoles = await tx.insert(roles).values(
          DEFAULT_COMPANY_ROLES.map((role) => ({
            name: role.name,
            description: role.description,
            isFixed: role.isFixed,
          }))
        ).returning({ id: roles.id, name: roles.name });
      } else {
        allRoles = await tx.select({ id: roles.id, name: roles.name }).from(roles);
      }

      // 4. Generate Default Payroll Config for the new company
      await tx.insert(payrollConfigs).values({
        companyId: newComp.id,
        afpEmployee: '0.0287',
        sfsEmployee: '0.0304',
        afpEmployer: '0.0710',
        sfsEmployer: '0.0709',
        infotepEmployer: '0.0100',
        riskEmployer: '0.0110', // 1.10% standard risk rate
        overtimeDiurnaRate: '1.35',
        overtimeNocturnaRate: '1.85',
        overtimeFestivaRate: '2.00',
        overtimeDobleRate: '2.00',
      });

      // 5. Generate Default Chart of Accounts & Bridge Mappings for the new company
      await AccountingRepository.seedDefaultChartOfAccounts(newComp.id, tx);
      await AccountingRepository.seedDefaultExpenseTypes(newComp.id, tx);
      // Auditoria JRN-11: sin periodos contables la empresa no puede asentar
      // nada. Antes los creaba `isPeriodOpen` de uno en uno y solo la primera
      // vez, asi que al cambiar de mes la empresa se bloqueaba en silencio.
      await AccountingRepository.sembrarPeriodosContables(newComp.id, tx);

      // 6. Seed system permissions dynamically (11 modules * 5 actions = 55 permissions)
      const modules = [
        'caja',
        'facturacion',
        'contabilidad',
        'banco',
        'clientes',
        'proveedores',
        'catalogo',
        'reportes',
        'administracion',
        'auditoria',
        'cobros',
      ] as const;

      const actions = ['read', 'write', 'delete', 'execute', 'admin'] as const;

      const allPermissionsToUpsert = [];
      for (const mod of modules) {
        for (const action of actions) {
          allPermissionsToUpsert.push({
            module: mod,
            action,
            description: `Permiso de ${action} en módulo ${mod}`,
          });
        }
      }

      await tx.insert(permissions)
        .values(allPermissionsToUpsert)
        .onConflictDoNothing();

      // 7. Seed default role permissions dynamically
      await seedRolePermissionsForCompany(tx, newComp.id, allRoles);

      return newComp;
    });

    return NextResponse.json({ success: true, data: newCompany });
  } catch (error: any) {
    console.error('Error creating company:', error);
    return NextResponse.json({ success: false, error: { message: 'Error interno del servidor' } }, { status: 500 });
  }
}
