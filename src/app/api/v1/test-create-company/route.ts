import { NextRequest, NextResponse } from 'next/server';
import { db, companies, companySettings, roles, payrollConfigs, permissions } from '@/db';
import { seedRolePermissionsForCompany } from '@/middleware/permissions';
import { DEFAULT_COMPANY_ROLES } from '@/utils/defaultRoles';
import { count, eq } from 'drizzle-orm';
import { AccountingRepository } from '@/repositories/accountingRepository';

export async function POST(req: NextRequest) {
  try {
    const newCompany = await db.transaction(async (tx) => {
      // 1. Insert Company
      const [newComp] = await tx.insert(companies).values({
        name: 'Test Company ' + Date.now(),
        rnc: '999999999',
        email: 'test' + Date.now() + '@example.com',
        status: 'active',
      }).returning();

      // 2. Generate Default Settings
      await tx.insert(companySettings).values({
        companyId: newComp.id,
        dgiiEnv: 'test',
        printLayout: 'carta',
        msellerUrl: 'https://ecf.api.mseller.app/v1',
        msellerEntorno: 'test',
        autoDeliveryNotes: false,
      });

      // 3. Fetch global roles
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

      // 4. Generate Default Payroll Config
      await tx.insert(payrollConfigs).values({
        companyId: newComp.id,
      });

      // 5. Generate Default Chart of Accounts
      await AccountingRepository.seedDefaultChartOfAccounts(newComp.id, tx);

      // 6. Seed system permissions dynamically
      const modules = ['caja', 'facturacion', 'contabilidad', 'banco', 'clientes', 'proveedores', 'catalogo', 'reportes', 'administracion', 'auditoria', 'cobros'] as const;
      const actions = ['read', 'write', 'delete', 'execute', 'admin'] as const;

      const allPermissionsToUpsert = [];
      for (const module of modules) {
        for (const action of actions) {
          allPermissionsToUpsert.push({
            module,
            action,
            description: `Permiso de ${action} en módulo ${module}`,
          });
        }
      }

      await tx.insert(permissions).values(allPermissionsToUpsert).onConflictDoNothing();

      // 7. Seed default role permissions
      await seedRolePermissionsForCompany(tx, newComp.id, allRoles);

      return newComp;
    });

    return NextResponse.json({ success: true, data: newCompany });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message, stack: error.stack }, { status: 500 });
  }
}
