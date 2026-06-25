import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { db, companies, companySettings, roles, chartOfAccounts, payrollConfigs } from '@/db';
import { z } from 'zod';
import { desc, eq, and } from 'drizzle-orm';
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

    // Insert Company
    const [newCompany] = await db.insert(companies).values({
      name: result.data.name,
      rnc: result.data.rnc,
      email: result.data.email,
      businessActivity: result.data.businessActivity,
      address: result.data.address,
      status: result.data.status,
    }).returning();

    // Generate Default Settings
    await db.insert(companySettings).values({
      companyId: newCompany.id,
      dgiiEnv: 'test',
      printLayout: 'carta',
      msellerUrl: 'https://ecf.api.mseller.app/v1',
      msellerEntorno: 'test',
      autoDeliveryNotes: false,
    });

    // Generate Default Administration Role for the new company
    await db.insert(roles).values({
      companyId: newCompany.id,
      name: 'administracion',
      description: 'Rol de administrador del sistema para ' + newCompany.name,
      isFixed: true,
    });

    // Generate Default HR/Payroll Role for the new company
    await db.insert(roles).values({
      companyId: newCompany.id,
      name: 'recursos_humanos',
      description: 'Rol de Gestión de Recursos Humanos y Nómina para ' + newCompany.name,
      isFixed: true,
    });

    // Generate Default Payroll Config for the new company
    await db.insert(payrollConfigs).values({
      companyId: newCompany.id,
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

    // Generate Default Chart of Accounts for the new company
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

    await db.insert(chartOfAccounts).values(
      defaultAccounts.map(account => ({
        id: uuidv4(),
        companyId: newCompany.id,
        code: account.code,
        name: account.name,
        type: account.type,
        status: 'active',
      }))
    );

    return NextResponse.json({ success: true, data: newCompany });
  } catch (error: any) {
    console.error('Error creating company:', error);
    return NextResponse.json({ success: false, error: { message: 'Error interno del servidor' } }, { status: 500 });
  }
}
