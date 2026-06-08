import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, companies, companySettings, roles, users, permissions, auditLogs } from '@/db';
import { encrypt, encryptBuffer } from '@/utils/encryption';
import { createSession } from '@/middleware/auth';
import { count, and, eq } from 'drizzle-orm';

const confirmSchema = z.object({
  company: z.object({
    name: z.string().min(3),
    rnc: z.string().regex(/^(?:\d{9}|\d{11})$/),
    businessActivity: z.string().min(5).optional(),
  }),
  fiscal: z.object({
    dgiiEnv: z.enum(['test', 'production']),
    msellerUrl: z.string().url().optional().or(z.literal('')),
    msellerApiKey: z.string().min(1, 'El Token de mSeller es requerido'),
  }),
  printing: z.object({
    printLayout: z.enum(['carta', '80mm', '58mm']),
  }),
  delivery: z.object({
    autoDeliveryNotes: z.boolean(),
  }),
  user: z.object({
    name: z.string().min(3),
    email: z.string().email(),
    password: z.string().min(8, 'La contraseña del administrador debe tener al menos 8 caracteres'),
  }),
});

// Standard system permission definitions
const STANDARD_PERMISSIONS = [
  { module: 'caja', action: 'read', description: 'Ver transacciones y sesiones de caja' },
  { module: 'caja', action: 'write', description: 'Abrir, cerrar y registrar movimientos de caja' },
  { module: 'facturacion', action: 'read', description: 'Ver facturas emitidas' },
  { module: 'facturacion', action: 'write', description: 'Emitir, firmar y anular facturas' },
  { module: 'contabilidad', action: 'read', description: 'Ver asientos contables y balances' },
  { module: 'contabilidad', action: 'write', description: 'Registrar asientos y cierres de periodo' },
  { module: 'banco', action: 'read', description: 'Ver cuentas y transacciones bancarias' },
  { module: 'banco', action: 'write', description: 'Registrar transferencias, depósitos y cheques' },
  { module: 'clientes', action: 'read', description: 'Ver catálogo de clientes' },
  { module: 'clientes', action: 'write', description: 'Registrar y editar clientes' },
  { module: 'proveedores', action: 'read', description: 'Ver catálogo de proveedores' },
  { module: 'proveedores', action: 'write', description: 'Registrar y editar proveedores' },
  { module: 'catalogo', action: 'read', description: 'Ver productos y categorías' },
  { module: 'catalogo', action: 'write', description: 'Registrar y editar productos y precios' },
  { module: 'reportes', action: 'read', description: 'Generar reportes fiscales y de ventas' },
  { module: 'administracion', action: 'read', description: 'Ver configuración del sistema y usuarios' },
  { module: 'administracion', action: 'write', description: 'Modificar usuarios, roles y parámetros generales' },
  { module: 'auditoria', action: 'read', description: 'Ver logs de auditoría' },
];

export async function POST(req: NextRequest) {
  try {
    // 1. Verify if system is already initialized
    const checkCompany = await db.select({ value: count() }).from(companies);
    if ((checkCompany[0]?.value || 0) > 0) {
      return NextResponse.json(
        { success: false, error: { code: 'SETUP_ALREADY_COMPLETED', message: 'El sistema ya ha sido inicializado.' } },
        { status: 400 }
      );
    }

    const body = await req.json();
    const result = confirmSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: result.error.issues[0].message } },
        { status: 400 }
      );
    }

    const { company, fiscal, printing, delivery, user } = result.data;

    // 2. Perform transactional database setup
    const setupResult = await db.transaction(async (tx) => {
      // 2.1. Create company
      const [newCompany] = await tx
        .insert(companies)
        .values({
          name: company.name,
          rnc: company.rnc,
          businessActivity: company.businessActivity,
        })
        .returning({ id: companies.id, name: companies.name });

      // 2.3. Create company settings
      await tx.insert(companySettings).values({
        companyId: newCompany.id,
        dgiiEnv: fiscal.dgiiEnv,
        msellerUrl: fiscal.msellerUrl || undefined,
        msellerApiKeyEncrypted: encrypt(fiscal.msellerApiKey),
        printLayout: printing.printLayout,
        autoDeliveryNotes: delivery.autoDeliveryNotes,
      });

      // 2.4. Create standard permissions
      const permIdsMap: Record<string, string> = {};
      for (const perm of STANDARD_PERMISSIONS) {
        const [insertedPerm] = await tx
          .insert(permissions)
          .values({
            module: perm.module,
            action: perm.action,
            description: perm.description,
          })
          .onConflictDoNothing()
          .returning({ id: permissions.id, module: permissions.module, action: permissions.action });

        const key = `${perm.module}:${perm.action}`;
        if (insertedPerm) {
          permIdsMap[key] = insertedPerm.id;
        } else {
          // If already exists, fetch it
          const [existingPerm] = await tx
            .select({ id: permissions.id })
            .from(permissions)
            .where(and(eq(permissions.module, perm.module), eq(permissions.action, perm.action)));
          if (existingPerm) {
            permIdsMap[key] = existingPerm.id;
          }
        }
      }

      // 2.5. Create standard roles
      const [roleSistemas] = await tx
        .insert(roles)
        .values({ companyId: newCompany.id, name: 'sistemas', description: 'Ingeniero de sistemas - Acceso Total técnico', isFixed: true })
        .returning({ id: roles.id, name: roles.name });

      const [roleAdmin] = await tx
        .insert(roles)
        .values({ companyId: newCompany.id, name: 'administracion', description: 'Administración - Acceso completo operativo', isFixed: true })
        .returning({ id: roles.id, name: roles.name });

      const [roleContabilidad] = await tx
        .insert(roles)
        .values({ companyId: newCompany.id, name: 'contabilidad', description: 'Contabilidad y Finanzas', isFixed: false })
        .returning({ id: roles.id });

      const [roleFacturacion] = await tx
        .insert(roles)
        .values({ companyId: newCompany.id, name: 'facturacion', description: 'Facturación y Ventas', isFixed: false })
        .returning({ id: roles.id });

      const [roleBanco] = await tx
        .insert(roles)
        .values({ companyId: newCompany.id, name: 'banco', description: 'Gestión Bancaria', isFixed: false })
        .returning({ id: roles.id });

      const [roleCajero] = await tx
        .insert(roles)
        .values({ companyId: newCompany.id, name: 'cajero', description: 'Cajero Operador de Terminal', isFixed: false })
        .returning({ id: roles.id });

      // 2.6. Create initial user (System Engineer)
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(user.password, salt);

      const [newUser] = await tx
        .insert(users)
        .values({
          companyId: newCompany.id,
          roleId: roleSistemas.id,
          name: user.name,
          email: user.email.toLowerCase(),
          passwordHash,
          status: 'active',
        })
        .returning({ id: users.id, name: users.name, email: users.email });

      // 2.7. Record audit log entry
      await tx.insert(auditLogs).values({
        companyId: newCompany.id,
        userId: newUser.id,
        action: 'system_initialization',
        entityType: 'companies',
        entityId: newCompany.id,
        newValues: {
          companyName: newCompany.name,
          rnc: company.rnc,
          initialUser: newUser.email,
        },
        ipAddress: req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown',
      });

      return {
        companyId: newCompany.id,
        userId: newUser.id,
        roleName: roleSistemas.name,
        roleId: roleSistemas.id,
      };
    });

    // 3. Issue HttpOnly JWT session cookies for the new user
    const resHeaders = new Headers();
    const userAgent = req.headers.get('user-agent') || '';
    const ipAddress = req.headers.get('x-forwarded-for') || (req as any).ip || 'unknown';

    await createSession(
      setupResult.userId,
      setupResult.companyId,
      setupResult.roleName,
      setupResult.roleId,
      ipAddress,
      userAgent,
      resHeaders
    );

    const response = NextResponse.json({
      success: true,
      message: 'Sistema inicializado exitosamente.',
      data: {
        companyId: setupResult.companyId,
        userId: setupResult.userId,
      }
    }, { headers: resHeaders });

    return response;
  } catch (error: any) {
    console.error('Setup wizard confirmation error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SETUP_FAILED', message: `No se pudo completar la configuración: ${error.message}` } },
      { status: 500 }
    );
  }
}
