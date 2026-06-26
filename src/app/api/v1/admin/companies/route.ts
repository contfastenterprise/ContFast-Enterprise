import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { db, companies, companySettings, roles, chartOfAccounts, payrollConfigs, permissions, rolePermissions } from '@/db';
import { DEFAULT_ROLE_PERMISSIONS } from '@/middleware/permissions';
import { DEFAULT_COMPANY_ROLES } from '@/utils/defaultRoles';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

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
    if (!session || session.role !== 'sistemas') {
      return NextResponse.json({ success: false, error: { message: 'No autorizado. Se requiere rol de sistemas.' } }, { status: 403 });
    }

    const list = await db.select().from(companies).orderBy(desc(companies.createdAt));

    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    console.error('Error fetching companies:', error);
    return NextResponse.json({ success: false, error: { message: 'Error interno del servidor' } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session || session.role !== 'sistemas') {
      return NextResponse.json({ success: false, error: { message: 'No autorizado. Se requiere rol de sistemas.' } }, { status: 403 });
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
        dgiiEnv: 'test',
        printLayout: 'carta',
        msellerUrl: 'https://ecf.api.mseller.app/v1',
        msellerEntorno: 'test',
        autoDeliveryNotes: false,
      });

      // 3. Generate all 6 standard roles for the new company
      const insertedRoles = await tx.insert(roles).values(
        DEFAULT_COMPANY_ROLES.map((role) => ({
          companyId: newComp.id,
          name: role.name,
          description: role.description,
          isFixed: role.isFixed,
        }))
      ).returning({ id: roles.id, name: roles.name });

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

      // 5. Generate Default Chart of Accounts for the new company
      const defaultAccounts = [
        // 1. Activos
        { code: '1', name: 'Activos', type: 'asset' },
        { code: '1.1', name: 'Activos Corrientes', type: 'asset' },
        { code: '1.1.01', name: 'Efectivo en Caja y Bancos', type: 'asset' },
        { code: '1.1.01.01', name: 'Caja General', type: 'asset' },
        { code: '1.1.01.02', name: 'Caja Chica', type: 'asset' },
        { code: '1.1.01.03', name: 'Banco de Reservas', type: 'asset' },
        { code: '1.1.01.04', name: 'Banco Popular', type: 'asset' },
        { code: '1.1.01.05', name: 'Banco BHD', type: 'asset' },
        { code: '1.1.02', name: 'Cuentas por Cobrar Clientes', type: 'asset' },
        { code: '1.1.03', name: 'Anticipo de Impuestos - Retención ISR', type: 'asset' },
        { code: '1.1.04', name: 'Anticipo de Impuestos - Retención ITBIS', type: 'asset' },
        { code: '1.1.05', name: 'Anticipo de Impuestos - Otras Retenciones', type: 'asset' },
        { code: '1.1.06', name: 'Inventario de Mercancía', type: 'asset' },
        { code: '1.1.07', name: 'ITBIS Pagado en Compras (Adelantado)', type: 'asset' },
        { code: '1.1.08', name: 'Gastos Pagados por Anticipado', type: 'asset' },
        { code: '1.2', name: 'Activos No Corrientes (Propiedades, Planta y Equipo)', type: 'asset' },
        { code: '1.2.01', name: 'Terrenos', type: 'asset' },
        { code: '1.2.02', name: 'Edificios', type: 'asset' },
        { code: '1.2.03', name: 'Equipos de Transporte', type: 'asset' },
        { code: '1.2.04', name: 'Mobiliario y Equipos de Oficina', type: 'asset' },
        { code: '1.2.05', name: 'Equipos de Computación', type: 'asset' },
        { code: '1.2.06', name: 'Depreciación Acumulada', type: 'asset' },

        // 2. Pasivos
        { code: '2', name: 'Pasivos', type: 'liability' },
        { code: '2.1', name: 'Pasivos Corrientes (A Corto Plazo)', type: 'liability' },
        { code: '2.1.01', name: 'Cuentas por Pagar Proveedores', type: 'liability' },
        { code: '2.1.02', name: 'Acumulaciones y Gastos por Pagar', type: 'liability' },
        { code: '2.1.03', name: 'ITBIS por Pagar (Retenido en Ventas)', type: 'liability' },
        { code: '2.1.04', name: 'Retenciones de Impuestos por Pagar (ISR, ITBIS)', type: 'liability' },
        { code: '2.1.05', name: 'Retenciones TSS por Pagar', type: 'liability' },
        { code: '2.1.06', name: 'Porción Corriente de Préstamos a Largo Plazo', type: 'liability' },
        { code: '2.2', name: 'Pasivos No Corrientes (A Largo Plazo)', type: 'liability' },
        { code: '2.2.01', name: 'Préstamos Bancarios a Largo Plazo', type: 'liability' },
        { code: '2.2.02', name: 'Documentos por Pagar a Largo Plazo', type: 'liability' },

        // 3. Capital / Patrimonio
        { code: '3', name: 'Capital / Patrimonio', type: 'equity' },
        { code: '3.1', name: 'Capital Social', type: 'equity' },
        { code: '3.2', name: 'Resultados Acumulados (Años Anteriores)', type: 'equity' },
        { code: '3.3', name: 'Resultado del Ejercicio (Año en Curso)', type: 'equity' },
        { code: '3.4', name: 'Reservas Legales', type: 'equity' },

        // 4. Ingresos
        { code: '4', name: 'Ingresos', type: 'revenue' },
        { code: '4.1', name: 'Ingresos Operacionales', type: 'revenue' },
        { code: '4.1.01', name: 'Ingresos por Ventas', type: 'revenue' },
        { code: '4.1.02', name: 'Ingresos por Servicios', type: 'revenue' },
        { code: '4.1.03', name: 'Devoluciones y Descuentos en Ventas', type: 'revenue' },
        { code: '4.2', name: 'Ingresos No Operacionales', type: 'revenue' },
        { code: '4.2.01', name: 'Ingresos por Intereses', type: 'revenue' },
        { code: '4.2.02', name: 'Otros Ingresos', type: 'revenue' },

        // 5. Costos
        { code: '5', name: 'Costos de Ventas', type: 'cost' },
        { code: '5.1.01', name: 'Costo de Ventas (Mercancías)', type: 'cost' },

        // 6. Gastos
        { code: '6', name: 'Gastos Operacionales', type: 'expense' },
        { code: '6.1.01', name: 'Sueldos y Salarios (Nómina)', type: 'expense' },
        { code: '6.1.02', name: 'TSS (Aportes Patronales)', type: 'expense' },
        { code: '6.1.03', name: 'Servicios Públicos (Agua, Luz, Teléfono)', type: 'expense' },
        { code: '6.1.04', name: 'Alquileres / Arrendamientos', type: 'expense' },
        { code: '6.1.05', name: 'Publicidad y Propaganda', type: 'expense' },
        { code: '6.1.06', name: 'Gastos de Combustible y Transporte', type: 'expense' },
        { code: '6.1.07', name: 'Reparación y Mantenimiento', type: 'expense' },
        { code: '6.1.08', name: 'Depreciación de Activos Fijos', type: 'expense' },
        { code: '6.1.09', name: 'Gastos Diversos', type: 'expense' }
      ];

      await tx.insert(chartOfAccounts).values(
        defaultAccounts.map(account => ({
          id: uuidv4(),
          companyId: newComp.id,
          code: account.code,
          name: account.name,
          type: account.type,
          status: 'active',
        }))
      );

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
      for (const module of modules) {
        for (const action of actions) {
          allPermissionsToUpsert.push({
            module,
            action,
            description: `Permiso de ${action} en módulo ${module}`,
          });
        }
      }

      await tx.insert(permissions)
        .values(allPermissionsToUpsert)
        .onConflictDoNothing();

      // Retrieve all permissions to obtain their database IDs
      const dbPermissions = await tx.select({
        id: permissions.id,
        module: permissions.module,
        action: permissions.action,
      }).from(permissions);

      // Prepare role_permissions mappings
      const rolePermissionsToInsert: {
        companyId: string;
        roleId: string;
        permissionId: string;
        granted: boolean;
      }[] = [];

      // Helper function to evaluate default permission matrix
      const isPermissionGranted = (roleName: string, module: string, action: string): boolean => {
        const normalizedRole = roleName.toLowerCase();
        
        // Sistemas has full access
        if (normalizedRole === 'sistemas') {
          return true;
        }
        
        // Administracion has full access except audit and administration modules where it only gets read
        if (normalizedRole === 'administracion') {
          if (module === 'auditoria' || module === 'administracion') {
            return action === 'read';
          }
          return true;
        }

        // Other roles are mapped using DEFAULT_ROLE_PERMISSIONS
        const defaultPerms = DEFAULT_ROLE_PERMISSIONS[normalizedRole];
        if (defaultPerms) {
          return !!defaultPerms[`${module}:${action}`];
        }

        return false;
      };

      for (const role of insertedRoles) {
        for (const p of dbPermissions) {
          const granted = isPermissionGranted(role.name, p.module, p.action);
          rolePermissionsToInsert.push({
            companyId: newComp.id,
            roleId: role.id,
            permissionId: p.id,
            granted,
          });
        }
      }

      // Bulk insert role permissions
      if (rolePermissionsToInsert.length > 0) {
        await tx.insert(rolePermissions).values(rolePermissionsToInsert);
      }

      return newComp;
    });

    return NextResponse.json({ success: true, data: newCompany });
  } catch (error: any) {
    console.error('Error creating company:', error);
    return NextResponse.json({ success: false, error: { message: 'Error interno del servidor' } }, { status: 500 });
  }
}
