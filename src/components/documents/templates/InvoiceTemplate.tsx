import React from 'react';

export interface InvoiceTemplateData {
  company: {
    id: string;
    name: string;
    rnc?: string;
    logoUrl?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  customer: {
    name: string;
    rnc?: string;
    phone?: string;
    address?: string;
    email?: string;
  };
  invoice: {
    number: string;
    ncf: string;
    date: string;
    dueDate?: string;
    status: string;
    paymentType?: string;
    notes?: string;
    subtotal: number;
    discount: number;
    totalTaxes: number;
    total: number;
  };
  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    subtotal: number;
    total: number;
  }>;
  taxes?: Array<{
    name: string;
    amount: number;
    rate?: number;
  }>;
  modo: 'PRODUCCION' | 'PRUEBA';
}

interface Props {
  data: InvoiceTemplateData;
  mode?: 'web' | 'email' | 'pdf';
}

export const InvoiceTemplate: React.FC<Props> = ({ data, mode = 'web' }) => {
  const isEmail = mode === 'email';
  const { company, customer, invoice, lines, taxes } = data;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val);

  return (
    <div style={{ fontFamily: 'Helvetica, Arial, sans-serif', color: '#333', padding: isEmail ? '0' : '40px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <table style={{ width: '100%', marginBottom: '30px' }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'top', width: '50%' }}>
              {company.logoUrl ? (
                <img src={company.logoUrl} alt={company.name} style={{ maxHeight: '60px', marginBottom: '10px' }} />
              ) : (
                <h1 style={{ fontSize: '24px', margin: '0 0 10px 0', color: '#0f172a' }}>{company.name}</h1>
              )}
              <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>
                {company.rnc && <div><strong>RNC:</strong> {company.rnc}</div>}
                {company.address && <div>{company.address}</div>}
                {company.phone && <div>Tel: {company.phone}</div>}
                {company.email && <div>{company.email}</div>}
              </div>
            </td>
            <td style={{ verticalAlign: 'top', width: '50%', textAlign: 'right' }}>
              <h2 style={{ fontSize: '28px', margin: '0 0 5px 0', color: '#0ea5e9' }}>FACTURA</h2>
              <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{invoice.number}</div>
              {invoice.ncf && <div style={{ fontSize: '14px', marginTop: '4px' }}><strong>NCF:</strong> {invoice.ncf}</div>}
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '10px' }}>
                <div><strong>Fecha:</strong> {invoice.date}</div>
                {invoice.dueDate && <div><strong>Vence:</strong> {invoice.dueDate}</div>}
                {invoice.paymentType && <div><strong>Tipo Pago:</strong> {invoice.paymentType.toUpperCase()}</div>}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {data.modo === 'PRUEBA' && (
        <div style={{ backgroundColor: '#fef08a', color: '#854d0e', padding: '10px', textAlign: 'center', marginBottom: '20px', fontWeight: 'bold', borderRadius: '4px' }}>
          DOCUMENTO DE PRUEBA - NO VÁLIDO PARA CRÉDITO FISCAL
        </div>
      )}

      {/* Customer Info */}
      <div style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
        <h3 style={{ fontSize: '14px', margin: '0 0 10px 0', color: '#0f172a', textTransform: 'uppercase' }}>Facturado a:</h3>
        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{customer.name}</div>
        <div style={{ fontSize: '12px', color: '#475569', lineHeight: '1.5', marginTop: '4px' }}>
          {customer.rnc && <div><strong>RNC/Cédula:</strong> {customer.rnc}</div>}
          {customer.address && <div>{customer.address}</div>}
          {customer.phone && <div>Tel: {customer.phone}</div>}
          {customer.email && <div>{customer.email}</div>}
        </div>
      </div>

      {/* Line Items */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
        <thead>
          <tr>
            <th style={{ padding: '10px', backgroundColor: '#0f172a', color: 'white', textAlign: 'left', fontSize: '12px' }}>Descripción</th>
            <th style={{ padding: '10px', backgroundColor: '#0f172a', color: 'white', textAlign: 'center', fontSize: '12px', width: '10%' }}>Cant</th>
            <th style={{ padding: '10px', backgroundColor: '#0f172a', color: 'white', textAlign: 'right', fontSize: '12px', width: '20%' }}>Precio</th>
            <th style={{ padding: '10px', backgroundColor: '#0f172a', color: 'white', textAlign: 'right', fontSize: '12px', width: '20%' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '12px 10px', fontSize: '13px' }}>{line.description}</td>
              <td style={{ padding: '12px 10px', fontSize: '13px', textAlign: 'center' }}>{line.quantity}</td>
              <td style={{ padding: '12px 10px', fontSize: '13px', textAlign: 'right' }}>{formatCurrency(line.unitPrice)}</td>
              <td style={{ padding: '12px 10px', fontSize: '13px', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(line.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <table style={{ width: '100%', marginTop: '20px' }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', verticalAlign: 'top' }}>
              {invoice.notes && (
                <div style={{ fontSize: '12px', color: '#64748b', paddingRight: '20px' }}>
                  <strong>Notas:</strong>
                  <p style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap' }}>{invoice.notes}</p>
                </div>
              )}
            </td>
            <td style={{ width: '50%', verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 0', color: '#64748b' }}>Subtotal:</td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}>{formatCurrency(invoice.subtotal)}</td>
                  </tr>
                  {invoice.discount > 0 && (
                    <tr>
                      <td style={{ padding: '6px 0', color: '#64748b' }}>Descuento:</td>
                      <td style={{ padding: '6px 0', textAlign: 'right', color: '#ef4444' }}>-{formatCurrency(invoice.discount)}</td>
                    </tr>
                  )}
                  {taxes && taxes.map((tax, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '6px 0', color: '#64748b' }}>{tax.name}:</td>
                      <td style={{ padding: '6px 0', textAlign: 'right' }}>{formatCurrency(tax.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding: '12px 0', fontWeight: 'bold', fontSize: '16px', borderTop: '2px solid #e2e8f0' }}>Total a Pagar:</td>
                    <td style={{ padding: '12px 0', fontWeight: 'bold', fontSize: '16px', borderTop: '2px solid #e2e8f0', textAlign: 'right', color: '#0ea5e9' }}>
                      {formatCurrency(invoice.total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ marginTop: '50px', borderTop: '1px solid #e2e8f0', paddingTop: '20px', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
        Gracias por su preferencia. Documento emitido por ContFast Enterprise.
      </div>
    </div>
  );
};
