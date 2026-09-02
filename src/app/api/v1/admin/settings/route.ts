import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { db, companies, companySettings, subscriptions, plans, msellerApiKeys } from '@/db';
import { entornosConCredenciales } from '@/services/dgii/credenciales';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { encryptAsync } from '@/utils/encryption';
import { enforcePermission } from '@/middleware/permissions';
import { delCache } from '@/infrastructure/redis';

const settingsSchema = z.object({
  name: z.string().min(1, 'El Nombre Comercial es requerido'),
  rnc: z.string().min(9, 'El RNC es requerido').max(11, 'El RNC debe tener entre 9 y 11 caracteres'),
  businessActivity: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  logoUrl: z.string().optional(),
  // Guarda EL MODO del sistema (0047), no un ambiente aparte. El ambiente de
  // la DGII se deduce con entornoDgii(). CERTIFICACION se admite en la base
  // pero no se ofrece todavia en la interfaz.
  dgiiEnv: z.enum(['PRUEBA', 'PRODUCCION', 'CERTIFICACION']),
  printLayout: z.enum(['carta', '80mm', '58mm']),
  printCopies: z.number().int().min(1).max(5).default(2).optional(),
  autoDeliveryNotes: z.boolean(),
  maxCreditNoteApprovalAmount: z.number().min(0),
  maxCashOutApprovalAmount: z.number().min(0),
  msellerUrl: z.string().url().optional(),
  // Auditoria ISO-16: de las tres credenciales, solo la CLAVE DE API es por
  // ambiente. Este campo dice a cual pertenece la que viene en la peticion; sin
  // el, la clave no se guarda. El correo y la contrasena son de la empresa.
  msellerCredencialesEntorno: z.enum(['TesteCF', 'CerteCF', 'eCF']).optional(),
  msellerEmail: z.string().email().optional().or(z.literal('')),
  msellerApiKey: z.string().optional(),
  msellerPassword: z.string().optional(),
  barcodeDefaultType: z.string().default('code128').optional(),
  barcodePrefix: z.string().default('COD').optional(),
  barcodeLength: z.number().int().min(1).default(9).optional()
});

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }
    await enforcePermission(session.userId, session.role, session.roleId, session.companyId, 'administracion', 'read');

    const [company] = await db.select({
      name: companies.name,
      rnc: companies.rnc,
      businessActivity: companies.businessActivity,
      address: companies.address,
      phone: companies.phone,
      email: companies.email
    }).from(companies).where(eq(companies.id, session.companyId));

    const [settings] = await db.select({
      logoUrl: companySettings.logoUrl,
      dgiiEnv: companySettings.dgiiEnv,
      printLayout: companySettings.printLayout,
      printCopies: companySettings.printCopies,
      autoDeliveryNotes: companySettings.autoDeliveryNotes,
      maxCreditNoteApprovalAmount: companySettings.maxCreditNoteApprovalAmount,
      maxCashOutApprovalAmount: companySettings.maxCashOutApprovalAmount,
      msellerUrl: companySettings.msellerUrl,
      msellerEmail: companySettings.msellerEmail,
      hasMsellerPassword: companySettings.msellerPasswordEncrypted,
      barcodeDefaultType: companySettings.barcodeDefaultType,
      barcodePrefix: companySettings.barcodePrefix,
      barcodeLength: companySettings.barcodeLength
    }).from(companySettings).where(eq(companySettings.companyId, session.companyId));

    // Auditoria ISO-16: que ambientes tienen credenciales, para que la pantalla
    // lo pueda decir. Solo los nombres: aqui no sale ningun secreto.
    const entornosMseller = await entornosConCredenciales(session.companyId);

    // Fetch active subscription for the company
    const [sub] = await db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        planName: plans.name,
        maxEcfLimit: plans.maxEcfLimit,
        maxUsers: plans.maxUsers,
        maxWarehouses: plans.maxWarehouses,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(and(eq(subscriptions.companyId, session.companyId), eq(subscriptions.status, 'active')))
      .limit(1);

    // Fetch all active plans from database
    const activePlans = await db
      .select({
        id: plans.id,
        name: plans.name,
        description: plans.description,
        price: plans.price,
        maxEcfLimit: plans.maxEcfLimit,
        maxUsers: plans.maxUsers,
        maxWarehouses: plans.maxWarehouses,
      })
      .from(plans)
      .where(eq(plans.active, true));

    return NextResponse.json({ 
      success: true, 
      data: { 
        company, 
        settings: {
          ...settings,
          // La contrasena no sale de aqui: solo si la hay o no.
          hasMsellerPassword: !!settings.hasMsellerPassword,
          // Que ambientes tienen clave de API. Sin secretos: solo los nombres.
          entornosMseller,
        },
        subscription: sub || null,
        availablePlans: activePlans
      } 
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 401 });
    }
    await enforcePermission(session.userId, session.role, session.roleId, session.companyId, 'administracion', 'write');

    const body = await req.json();
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const { 
      name, 
      rnc, 
      address, 
      phone,
      email,
      businessActivity, 
      logoUrl, 
      dgiiEnv, 
      printLayout, 
      printCopies,
      autoDeliveryNotes, 
      maxCreditNoteApprovalAmount, 
      maxCashOutApprovalAmount, 
      msellerUrl, 
      msellerCredencialesEntorno,
      msellerEmail, 
      msellerApiKey, 
      msellerPassword,
      barcodeDefaultType,
      barcodePrefix,
      barcodeLength
    } = parsed.data;

    // Obtener estado actual
    const [currentCompany] = await db
      .select({ name: companies.name, rnc: companies.rnc })
      .from(companies)
      .where(eq(companies.id, session.companyId));

    const [currentSettings] = await db
      .select({
        msellerUrl: companySettings.msellerUrl,
        dgiiEnv: companySettings.dgiiEnv,
        msellerEmail: companySettings.msellerEmail
      })
      .from(companySettings)
      .where(eq(companySettings.companyId, session.companyId));

    const isSystemUser = session.role === 'sistemas';

    // 1. Validar sección mSeller
    if (!isSystemUser) {
      const isUrlChanged = msellerUrl !== undefined && msellerUrl !== currentSettings?.msellerUrl;
      // Auditoria ISO-15: `dgiiEnv` decide si los comprobantes salen a la DGII
      // de pruebas o a la REAL, y no estaba en esta comprobacion. La pantalla
      // deshabilita el selector para quien no es sistemas, pero la API lo
      // aceptaba igual: bastaba una peticion a mano para pasar la empresa a
      // produccion y que la siguiente factura se emitiera de verdad. Lo que
      // protege es el servidor, no el formulario.
      const isEntornoChanged = dgiiEnv !== undefined && dgiiEnv !== currentSettings?.dgiiEnv;
      // Auditoria ISO-16: cualquier campo de credenciales presente es un intento
      // de cambio. Antes se comparaba el correo contra el guardado, y ahora las
      // credenciales viven en otra tabla y por entorno: comparar deja de tener
      // sentido, y la presencia del campo ya basta.
      const isCredencialChanged = !!msellerEmail || !!msellerApiKey || !!msellerPassword;

      if (isUrlChanged || isEntornoChanged || isCredencialChanged) {
        return NextResponse.json(
          { success: false, error: { message: 'Solo el usuario con rol de sistema puede agregar o modificar la sección de mSeller.' } },
          { status: 403 }
        );
      }
    }

    // 2. Validar cambios en Nombre Comercial y RNC
    if (name !== undefined && name !== currentCompany?.name) {
      // Si ya está definido y no es sistemas, error
      if (currentCompany?.name && !isSystemUser) {
        return NextResponse.json(
          { success: false, error: { message: 'Solo el usuario de sistemas puede modificar el nombre comercial de la empresa.' } },
          { status: 403 }
        );
      }
      // Si no está definido y no es administrador ni sistemas, error
      if (!isSystemUser && session.role !== 'administracion') {
        return NextResponse.json(
          { success: false, error: { message: 'No tiene permisos para agregar el nombre comercial de la empresa.' } },
          { status: 403 }
        );
      }
    }

    if (rnc !== undefined && rnc !== currentCompany?.rnc) {
      // Si ya está definido y no es sistemas, error
      if (currentCompany?.rnc && !isSystemUser) {
        return NextResponse.json(
          { success: false, error: { message: 'Solo el usuario de sistemas puede modificar el RNC de la empresa.' } },
          { status: 403 }
        );
      }
      // Si no está definido y no es administrador ni sistemas, error
      if (!isSystemUser && session.role !== 'administracion') {
        return NextResponse.json(
          { success: false, error: { message: 'No tiene permisos para agregar el RNC de la empresa.' } },
          { status: 403 }
        );
      }
    }

    await db.transaction(async (tx) => {
      // Update Company
      const companyUpdate: any = {};
      if (name !== undefined) companyUpdate.name = name;
      if (rnc !== undefined) companyUpdate.rnc = rnc;
      if (businessActivity !== undefined) companyUpdate.businessActivity = businessActivity;
      if (address !== undefined) companyUpdate.address = address;
      if (phone !== undefined) companyUpdate.phone = phone;
      if (email !== undefined) companyUpdate.email = email;

      if (Object.keys(companyUpdate).length > 0) {
        await tx.update(companies)
          .set(companyUpdate)
          .where(eq(companies.id, session.companyId));
      }

      const settingsUpdate: any = {
        logoUrl,
        dgiiEnv,
        printLayout,
        printCopies,
        autoDeliveryNotes,
        maxCreditNoteApprovalAmount: maxCreditNoteApprovalAmount.toString(),
        maxCashOutApprovalAmount: maxCashOutApprovalAmount.toString(),
        barcodeDefaultType,
        barcodePrefix,
        barcodeLength,
        updatedAt: new Date()
      };

      if (msellerUrl !== undefined) settingsUpdate.msellerUrl = msellerUrl;

      // Auditoria ISO-16: el correo y la contrasena son de la EMPRESA -- los
      // mismos para los tres ambientes -- y se quedan donde estaban. Duplicarlos
      // por ambiente los expondria a desincronizarse: un cambio aplicado en dos
      // ambientes de tres deja el tercero roto sin que nadie se entere.
      if (msellerEmail !== undefined) settingsUpdate.msellerEmail = msellerEmail;
      if (msellerPassword) settingsUpdate.msellerPasswordEncrypted = await encryptAsync(msellerPassword);

      // La clave de API si es del AMBIENTE, y va a su propia tabla. Sin saber a
      // cual pertenece no se guarda: escribirla "en el que sea" es justamente lo
      // que habia que arreglar.
      if (msellerCredencialesEntorno && msellerApiKey) {
        const cifrada = await encryptAsync(msellerApiKey);
        await tx.insert(msellerApiKeys)
          .values({
            companyId: session.companyId,
            entorno: msellerCredencialesEntorno,
            apiKeyEncrypted: cifrada,
          })
          .onConflictDoUpdate({
            target: [msellerApiKeys.companyId, msellerApiKeys.entorno],
            set: { apiKeyEncrypted: cifrada, updatedAt: new Date() },
          });
      }

      await tx.update(companySettings)
        .set(settingsUpdate)
        .where(eq(companySettings.companyId, session.companyId));
    });

    try {
      await delCache(`company_settings:${session.companyId}`);
    } catch (e) {
      console.error('Failed to invalidate settings cache:', e);
    }

    return NextResponse.json({ success: true, message: 'Configuración actualizada' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 });
  }
}
