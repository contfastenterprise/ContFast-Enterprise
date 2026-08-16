import React from 'react';
import { db } from '@/db';
import { invoices } from '@/db/schema/invoices';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { DocumentViewer } from '@/components/documents/DocumentViewer';
import { DocumentService } from '@/services/documents/documentService';
import { InvoiceTemplate } from '@/components/documents/templates/InvoiceTemplate';
// import { requireAuth } from '@/utils/auth';

export default async function DocumentPage({
  params
}: {
  params: { type: string; id: string }
}) {
  const { type, id } = params;

  // const session = await requireAuth();

  if (type !== 'invoice') {
    return <div className="p-8 text-center text-slate-500">Tipo de documento no soportado</div>;
  }

  const invoiceData = await db.query.invoices.findFirst({
    where: eq(invoices.id, id),
    with: {
      company: true,
      customer: true,
      lines: true,
      taxes: true,
    }
  });

  if (!invoiceData) {
    notFound();
  }

  // TODO: Verify companyId matches user
  // if (invoiceData.companyId !== session.user.companyId) {
  //   return <div>Unauthorized</div>;
  // }

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
    lines: invoiceData.lines.map(l => ({
      id: l.id,
      description: 'Producto/Servicio',
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      discount: Number(l.discount),
      subtotal: Number(l.subtotal),
      total: Number(l.total),
    })),
    taxes: invoiceData.taxes.map(t => ({
      name: t.taxType,
      amount: Number(t.amount),
      rate: Number(t.rate),
    })),
    modo: invoiceData.modo,
  };

  const htmlContent = DocumentService.generateDocumentHtml(InvoiceTemplate, templateData, 'web');

  return (
    <div className="h-[calc(100vh-4rem)]">
      <DocumentViewer
        documentId={id}
        documentType={type}
        htmlContent={htmlContent}
      />
    </div>
  );
}
