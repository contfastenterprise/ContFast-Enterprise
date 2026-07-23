import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, users, roles, companies, auditLogs } from '@/db';
import { DEFAULT_COMPANY_ROLES } from '@/utils/defaultRoles';
import { eq, and, count } from 'drizzle-orm';
import { checkRateLimit } from '@/middleware/rateLimiter';
import { seedRolePermissionsForCompany } from '@/middleware/permissions';
import { AccountingRepository } from '@/repositories/accountingRepository';

const registerSchema = z.object({
  fullName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  email: z.string().email('El correo electrónico no es válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  rnc: z.string().optional(), // opcional si se une a una ya existente
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const isAllowed = await checkRateLimit(ip, 'strict');
    if (!isAllowed) {
      return NextResponse.json({ success: false, error: { message: 'Demasiadas solicitudes. Intente más tarde.' } }, { status: 429 });
    }

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const { fullName, email, password, rnc } = parsed.data;

    // Check if email already exists
    const [existingUser] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (existingUser) {
      return NextResponse.json({ success: false, error: { message: 'El correo electrónico ya está registrado.' } }, { status: 400 });
    }

    let companyId: string;
    let isNewCompany = false;

    // If RNC is provided, check if company exists, otherwise create Demo company
    if (rnc) {
      const [existingComp] = await db.select().from(companies).where(eq(companies.rnc, rnc)).limit(1);
      if (!existingComp) {
        return NextResponse.json({ success: false, error: { message: 'La empresa con el RNC especificado no existe. Por favor use el asistente de configuración para crearla.' } }, { status: 400 });
      }
      companyId = existingComp.id;
    } else {
      const [newCompany] = await db
        .insert(companies)
        .values({
          name: 'Empresa Demo S.R.L.',
          rnc: '101001001',
          businessActivity: 'Servicios Generales',
          status: 'active',
        })
        .returning();
      companyId = newCompany.id;
      isNewCompany = true;
    }

    // Ensure global roles are seeded if empty
    const checkRoles = await db.select({ value: count() }).from(roles);
    let allRoles = [];
    if ((checkRoles[0]?.value || 0) === 0) {
      allRoles = await db.insert(roles).values(
        DEFAULT_COMPANY_ROLES.map((role) => ({
          name: role.name,
          description: role.description,
          isFixed: role.isFixed,
        }))
      ).returning({ id: roles.id, name: roles.name });
    } else {
      allRoles = await db.select({ id: roles.id, name: roles.name }).from(roles);
    }

    if (isNewCompany) {
      await seedRolePermissionsForCompany(db, companyId, allRoles);
      await AccountingRepository.seedDefaultChartOfAccounts(companyId);
      await AccountingRepository.seedDefaultExpenseTypes(companyId);
    }

    // Get the 'administracion' role for the new user
    const adminRole = allRoles.find(r => r.name === 'administracion')!;

    const roleId = adminRole.id;

    // Hash Password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create User
    const [newUser] = await db
      .insert(users)
      .values({
        companyId,
        roleId,
        name: fullName,
        email: email.toLowerCase(),
        passwordHash,
        status: 'active',
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
      });

    // Create Audit Log
    await db.insert(auditLogs).values({
      companyId,
      userId: newUser.id,
      action: 'user_registered',
      entityType: 'users',
      entityId: newUser.id,
      newValues: { email: newUser.email, name: newUser.name },
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      message: 'Usuario registrado exitosamente.',
      data: {
        user: newUser,
      },
    });
  } catch (error: any) {
    console.error('Registration API error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: 'Ha ocurrido un error interno en el servidor.' } },
      { status: 500 }
    );
  }
}
