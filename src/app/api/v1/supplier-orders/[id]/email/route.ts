import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { enforcePermission } from '@/middleware/permissions';
import { SupplierOrderService } from '@/services/supplierOrderService';
import { PdfGenerator } from '@/services/print/pdfGenerator';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';
import { db, companies, companySettings, purchaseOrderLogs } from '@/db';
import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resHeaders = new Headers();
  const auth = await verifyAuth(req, resHeaders);

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } },
      { status: 401 }
    );
  }

  try {
    await enforcePermission(auth.userId, auth.role, auth.roleId, 'proveedores', 'write');
    const { id } = await params;

    const order = await SupplierOrderService.getOrderById(id, auth.companyId, auth.modo);
    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Pedido no encontrado.' } },
        { status: 404, headers: resHeaders }
      );
    }

    if (!order.supplierEmail) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_EMAIL', message: 'El suplidor no tiene un correo electrónico registrado.' } },
        { status: 400, headers: resHeaders }
      );
    }

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, auth.companyId))
      .limit(1);

    const [settings] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, auth.companyId))
      .limit(1);

    if (!company) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Compañía no encontrada.' } },
        { status: 404, headers: resHeaders }
      );
    }

    const companyData = {
      name: company.name,
      rnc: company.rnc,
      address: company.address || '',
      phone: '',
      email: settings?.msellerEmail || company.email || '',
      logoUrl: settings?.logoUrl || undefined,
    };

    const docData = {
      order,
      company: companyData,
      lines: order.lines,
    };

    const html = DocumentTemplates.renderSupplierOrder(docData);
    const pdfBuffer = await PdfGenerator.generatePdfFromHtml(html, 'carta');

    // Mail dispatch
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || 'no-reply@contfast.com';

    if (!host || !user || !pass) {
      throw new Error('Configuración SMTP faltante en las variables de entorno.');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"${company.name}" <${from}>`,
      to: order.supplierEmail,
      subject: `Orden de Pedido - ${order.orderNumber}`,
      text: `Estimado suplidor,\n\nAdjuntamos la orden de pedido ${order.orderNumber} correspondiente a las mercancías solicitadas.\n\nAtentamente,\n${company.name}`,
      attachments: [
        {
          filename: `Pedido_${order.orderNumber}.pdf`,
          content: Buffer.from(pdfBuffer),
          contentType: 'application/pdf',
        }
      ]
    });

    // Save action log
    await db.insert(purchaseOrderLogs).values({
      id: uuidv4(),
      purchaseOrderId: id,
      userId: auth.userId,
      action: 'Pedido enviado',
      changeDetails: `Pedido enviado al correo electrónico: ${order.supplierEmail}`,
    });

    return NextResponse.json(
      { success: true, message: 'Pedido enviado correctamente al suplidor.' },
      { headers: resHeaders }
    );
  } catch (error: any) {
    console.error('Error in POST /api/v1/supplier-orders/[id]/email:', error);
    const status = error.status || 500;
    const code = error.code || 'SERVER_ERROR';
    return NextResponse.json(
      { success: false, error: { code, message: error.message } },
      { status, headers: resHeaders }
    );
  }
}
