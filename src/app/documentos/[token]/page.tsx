import React from 'react';
import { db } from '@/db';
import { documentShares } from '@/db/schema/documents';
import { invoices } from '@/db/schema/invoices';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { DocumentViewer } from '@/components/documents/DocumentViewer';
import { DocumentService } from '@/services/documents/documentService';
import { InvoiceTemplate } from '@/components/documents/templates/InvoiceTemplate';

export default async function PublicDocumentPage({
  params
}: {
  params: { token: string }
}) {
  const { token } = params;

  let share;
  try {
    share = await DocumentService.verifyShareToken(token);
  } catch (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center border border-slate-200">
          <h2 className="text-xl font-bold text-slate-800 mb-2">Enlace no válido</h2>
          <p className="text-slate-600">{error instanceof Error ? error.message : 'El enlace de acceso ya no es válido o ha expirado.'}</p>
        </div>
      </div>
    );
  }

  if (share.documentType !== 'invoice') {
    return <div className="p-8 text-center text-slate-500">Tipo de documento no soportado</div>;
  }

  const invoiceData = await db.query.invoices.findFirst({
    where: eq(invoices.id, share.documentId),
    with: {
      company: true,
      customer: true,
      lines: true,
      taxes: true,
    }
  }) as any;

  if (!invoiceData) {
    notFound();
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

  const htmlContent = await DocumentService.generateDocumentHtml(InvoiceTemplate, templateData, 'web');

  return (
    <div className="h-screen flex flex-col">
      <div className="bg-sky-600 px-6 py-4 flex justify-between items-center text-white">
        <h1 className="text-xl font-bold">{templateData.company.name}</h1>
        <div className="text-sm">Visor Seguro de Documentos</div>
      </div>
      <div className="flex-1">
        <DocumentViewer
          documentId={share.documentId}
          documentType={share.documentType}
          htmlContent={htmlContent}
        />
      </div>
    </div>
  );
}
