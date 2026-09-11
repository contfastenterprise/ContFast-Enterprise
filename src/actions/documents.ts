'use server';

import { db } from '@/db';
import { invoices } from '@/db/schema/invoices';
import { eq, and } from 'drizzle-orm';
import { DocumentService } from '@/services/documents/documentService';
import { InvoiceTemplate } from '@/components/documents/templates/InvoiceTemplate';
import { exigirSesion } from './_sesion';
import { enforcePermission } from '@/middleware/permissions';

// Auditoria F0-03: estas rutas no verificaban sesion ni empresa, y quedaban fuera
// del matcher del proxy. Cualquiera con el UUID de una factura podia descargar su
// PDF, reenviarla por correo a un destinatario arbitrario o generar un enlace
// publico de 30 dias, sin autenticarse y sin importar de que empresa fuera.
//
// AQUEL ARREGLO NO CERRO LA PUERTA, LE PUSO UN CARTEL.
// Lo que se anadio fue un PARAMETRO `companyId`, es decir: se le pregunta a
// quien llama de que empresa es. Una accion de servidor es un punto HTTP
// publico, asi que eso no acota nada -- quien la invoca elige la respuesta. Y
// seguia sin haber NINGUNA comprobacion de sesion: los `// session.user.id`
// comentados mas abajo son de la misma epoca y dicen lo mismo.
//
// Ahora la empresa y el entorno salen de la SESION, y ademas se exige permiso.
// Los parametros que traian esos datos se conservan en su posicion para no
// romper a quien llame, pero se IGNORAN: llevan `_` delante y no se usan. Se
// pueden quitar en cuanto se confirme que no queda ningun llamador.
export async function sendDocumentEmailAction(
  documentType: string,
  documentId: string,
  toEmail: string,
  /** @deprecated Ya no se usa: la empresa sale de la sesion. */
  _companyIdDelCliente?: string
) {
  try {
    // Enviar por correo es leer el documento y sacarlo de la empresa. Pide
    // `facturacion:read`, que es el modulo al que pertenece la factura.
    const sesion = await exigirSesion();
    await enforcePermission(
      sesion.userId, sesion.role, sesion.roleId, sesion.companyId, 'facturacion', 'read'
    );
    const companyId = sesion.companyId;

    if (documentType !== 'invoice') {
      throw new Error('Tipo de documento no soportado');
    }

    const invoiceData = await db.query.invoices.findFirst({
      where: and(eq(invoices.id, documentId), eq(invoices.companyId, companyId)),
      with: {
        company: true,
        customer: true,
        lines: true,
        taxes: true,
      }
    }) as any;

    if (!invoiceData) {
      throw new Error('Documento no encontrado');
    }

    const templateData = {
      company: {
        id: invoiceData.company.id,
        name: invoiceData.company.name,
        rnc: invoiceData.company.rnc || undefined,
        logoUrl: invoiceData.company.logoUrl || undefined,
        phone: invoiceData.company.phone || undefined,
        email: invoiceData.company.email || undefined,
        address: invoiceData.company.address || undefined,
      },
      customer: {
        name: invoiceData.customer?.name || 'Cliente Genérico',
        rnc: invoiceData.customer?.rnc || undefined,
      },
      invoice: {
        number: invoiceData.codigoFactura || invoiceData.ncf || 'DRAFT',
        ncf: invoiceData.ncf,
        date: new Date(invoiceData.createdAt).toLocaleDateString('es-DO'),
        status: invoiceData.status,
        paymentType: invoiceData.paymentType,
        subtotal: Number(invoiceData.subtotal),
        discount: Number(invoiceData.discount),
        totalTaxes: Number(invoiceData.totalTaxes),
        total: Number(invoiceData.total),
        notes: invoiceData.notes || undefined,
      },
      lines: invoiceData.lines?.map((l: any) => ({
        id: l.id,
        description: 'Producto/Servicio',
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        discount: Number(l.discount),
        subtotal: Number(l.subtotal),
        total: Number(l.total),
      })) || [],
      taxes: invoiceData.taxes?.map((t: any) => ({
        name: t.taxType,
        amount: Number(t.amount),
        rate: Number(t.rate),
      })) || [],
      modo: invoiceData.modo,
    };

    const subject = `Factura ${templateData.invoice.number} de ${templateData.company.name}`;

    await DocumentService.sendDocumentByEmail(
      documentType,
      documentId,
      InvoiceTemplate,
      templateData,
      toEmail,
      subject
      // session.user.id
    );

    return { success: true };
  } catch (error: any) {
    console.error('[Action/SendEmail]', error);
    return { success: false, error: error.message };
  }
}

export async function createShareTokenAction(
  documentType: string,
  documentId: string,
  /** @deprecated Ya no se usa: la empresa sale de la sesion. */
  _companyIdDelCliente?: string,
  /** @deprecated Ya no se usa: el entorno sale de la cookie de sesion. */
  _modoDelCliente?: 'PRODUCCION' | 'PRUEBA'
) {
  try {
    // Aqui se pide `write` y no `read`, a sabiendas de que es mas estricto que
    // enviar por correo: esto no ensena un documento a alguien, ACUÑA UN
    // ENLACE PUBLICO de 30 dias a un comprobante fiscal, que despues vive solo
    // y no se puede desinvitar. Quien pueda crear facturas puede exponerlas;
    // quien solo pueda mirarlas, no. Si prefieres que baste con `read`, se
    // cambia aqui y en el banco de comprobaciones, que lo tiene fijado.
    const sesion = await exigirSesion();
    await enforcePermission(
      sesion.userId, sesion.role, sesion.roleId, sesion.companyId, 'facturacion', 'write'
    );
    const companyId = sesion.companyId;
    // El entorno tambien sale de la sesion: si lo eligiera quien llama, el
    // acotamiento de PRUEBA/PRODUCCION que hay debajo seria decorativo.
    const modo = sesion.modo;

    if (documentType !== 'invoice') {
      throw new Error('Tipo de documento no soportado');
    }

    // El entorno tambien acota: desde PRUEBA no se genera un enlace publico
    // de 30 dias a una factura real.
    const doc = await db.query.invoices.findFirst({
      where: and(
        eq(invoices.id, documentId),
        eq(invoices.companyId, companyId),
        eq(invoices.modo, modo)
      ),
      columns: { companyId: true }
    });

    if (!doc) throw new Error('Documento no encontrado');

    const token = await DocumentService.createShareToken(
      doc.companyId,
      modo,
      documentId,
      documentType,
      undefined, // session.user.id
      30 // 30 days expiration
    );

    // Provide the absolute URL where the user can access this.
    // Replace with your actual domain logic
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return { success: true, url: `${baseUrl}/documentos/${token}` };
  } catch (error: any) {
    console.error('[Action/CreateShareToken]', error);
    return { success: false, error: error.message };
  }
}
