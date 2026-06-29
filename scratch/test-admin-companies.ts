import { db, companies, companySettings, roles, payrollConfigs, permissions } from '../src/db';
import { DEFAULT_COMPANY_ROLES } from '../src/utils/defaultRoles';
import { seedRolePermissionsForCompany } from '../src/middleware/permissions';
import { AccountingRepository } from '../src/repositories/accountingRepository';
import { count } from 'drizzle-orm';

async function run() {
  try {
    const newCompany = await db.transaction(async (tx) => {
      // 1. Insert Company
      const [newComp] = await tx.insert(companies).values({
        name: 'Test Company',
        rnc: '123456789',
        email: 'test@example.com',
        businessActivity: 'Test',
        address: 'Test',
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
        afpEmployee: '0.0287',
        sfsEmployee: '0.0304',
        afpEmployer: '0.0710',
        sfsEmployer: '0.0709',
        infotepEmployer: '0.0100',
        riskEmployer: '0.0110',
        overtimeDiurnaRate: '1.35',
        overtimeNocturnaRate: '1.85',
        overtimeFestivaRate: '2.00',
        overtimeDobleRate: '2.00',
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

      // 7. Seed default role permissions dynamically
      await seedRolePermissionsForCompany(tx, newComp.id, allRoles);

      return newComp;
    });

    console.log('Success:', newCompany);
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
