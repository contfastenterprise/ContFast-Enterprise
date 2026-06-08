import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { db, companies, companySettings } from '@/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const settingsSchema = z.object({
  businessActivity: z.string().optional(),
  logoUrl: z.string().optional(),
  dgiiEnv: z.enum(['test', 'production']),
  printLayout: z.enum(['carta', '80mm', '58mm']),
  autoDeliveryNotes: z.boolean(),
  maxCreditNoteApprovalAmount: z.number().min(0),
  maxCashOutApprovalAmount: z.number().min(0)
});

export async function GET(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session || (session.role !== 'sistemas' && session.role !== 'administracion')) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 403 });
    }

    const [company] = await db.select({
      name: companies.name,
      rnc: companies.rnc,
      businessActivity: companies.businessActivity
    }).from(companies).where(eq(companies.id, session.companyId));

    const [settings] = await db.select({
      logoUrl: companySettings.logoUrl,
      dgiiEnv: companySettings.dgiiEnv,
      printLayout: companySettings.printLayout,
      autoDeliveryNotes: companySettings.autoDeliveryNotes,
      maxCreditNoteApprovalAmount: companySettings.maxCreditNoteApprovalAmount,
      maxCashOutApprovalAmount: companySettings.maxCashOutApprovalAmount
    }).from(companySettings).where(eq(companySettings.companyId, session.companyId));

    return NextResponse.json({ success: true, data: { company, settings } });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await verifyAuth(req);
    if (!session || (session.role !== 'sistemas' && session.role !== 'administracion')) {
      return NextResponse.json({ success: false, error: { message: 'No autorizado' } }, { status: 403 });
    }

    const body = await req.json();
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: parsed.error.issues[0].message } }, { status: 400 });
    }

    const { businessActivity, logoUrl, dgiiEnv, printLayout, autoDeliveryNotes, maxCreditNoteApprovalAmount, maxCashOutApprovalAmount } = parsed.data;

    await db.transaction(async (tx) => {
      // Update Company
      if (businessActivity !== undefined) {
        await tx.update(companies)
          .set({ businessActivity })
          .where(eq(companies.id, session.companyId));
      }

      // Update Settings
      await tx.update(companySettings)
        .set({
          logoUrl,
          dgiiEnv,
          printLayout,
          autoDeliveryNotes,
          maxCreditNoteApprovalAmount: maxCreditNoteApprovalAmount.toString(),
          maxCashOutApprovalAmount: maxCashOutApprovalAmount.toString(),
          updatedAt: new Date()
        })
        .where(eq(companySettings.companyId, session.companyId));
    });

    return NextResponse.json({ success: true, message: 'Configuración actualizada' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { message: err.message } }, { status: 400 });
  }
}
