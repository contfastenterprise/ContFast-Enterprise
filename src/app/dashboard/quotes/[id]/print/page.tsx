'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Printer, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function PrintQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [quote, setQuote] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [quoteRes, sessionRes] = await Promise.all([
          fetch(`/api/v1/quotes/${id}`),
          fetch('/api/v1/auth/session')
        ]);
        
        const quoteData = await quoteRes.json();
        const sessionData = await sessionRes.json();

        if (quoteData.success) {
          setQuote(quoteData.data);
          
          if (sessionData.success) {
            // fetch company info for header
            const companyRes = await fetch(`/api/v1/companies/profile`);
            const companyData = await companyRes.json();
            if (companyData.success) {
              setCompany(companyData.data);
            }
          }
        } else {
          toast.error('Error cargando cotización');
        }
      } catch (err) {
        toast.error('Error de red');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  useEffect(() => {
    if (quote) {
      const customerName = quote.customerName || 'Cliente';
      const reason = 'Cotizacion';
      const sequenceNumber = quote.sequenceNumber || id.slice(0, 8).toUpperCase();
      
      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = today.getFullYear();
      const printDate = `${day}-${month}-${year}`;

      const cleanCustomerName = customerName.replace(/[/\\?%*:|"<>]/g, '_').trim();
      const cleanNum = String(sequenceNumber).replace(/[/\\?%*:|"<>]/g, '_').trim();
      
      document.title = `${cleanCustomerName} - ${reason} - ${cleanNum} - ${printDate}`;
    }
  }, [quote, id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div className="p-10 text-center">Cargando plantilla...</div>;
  }

  if (!quote) {
    return <div className="p-10 text-center text-red-500">Cotización no encontrada.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white text-black font-sans">
      {/* Print Controls (hidden when printing) */}
      <div className="print:hidden p-4 bg-white border-b shadow-sm flex items-center justify-between max-w-4xl mx-auto my-4 rounded-lg">
        <button 
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
        <button 
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          <Printer className="w-4 h-4" /> Imprimir
        </button>
      </div>

      {/* A4 Paper Container */}
      <div className="max-w-4xl mx-auto bg-white p-12 shadow-lg print:shadow-none print:p-0">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-12">
          <div className="flex items-center gap-4">
            {company?.logoUrl ? (
              <img src={company.logoUrl} alt="Logo" className="w-24 h-auto" />
            ) : (
              <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                <Building2 className="w-8 h-8 text-gray-400" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{company?.name || 'Mi Empresa'}</h1>
              <p className="text-sm text-gray-600">RNC: {company?.rnc || 'N/A'}</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{company?.address || 'Dirección no configurada'}</p>
            </div>
          </div>
          
          <div className="text-right">
            <h2 className="text-4xl font-bold tracking-tight text-indigo-600 mb-2">COTIZACIÓN</h2>
            <div className="text-lg text-gray-700 font-medium">#{quote.sequenceNumber}</div>
            <div className="text-sm text-gray-500 mt-2">
              Fecha: {new Date(quote.createdAt).toLocaleDateString()}
            </div>
            <div className="text-sm text-gray-500">
              Válida hasta: {new Date(quote.validUntil).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-8 mb-12">
          <div>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Preparado Para</h3>
            {quote.customerId ? (
              <div>
                {/* Need customer name injected or fetched, assuming generic text if missing */}
                <p className="text-gray-900 font-medium text-lg">Cliente Registrado</p>
              </div>
            ) : (
              <p className="text-gray-900 font-medium text-lg">Consumidor Final</p>
            )}
          </div>
          <div className="text-right">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Estado</h3>
            <p className="text-gray-900 font-medium text-lg capitalize">
              {quote.status === 'pending' ? 'Pendiente' : quote.status === 'invoiced' ? 'Facturada' : 'Cancelada'}
            </p>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full mb-12">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="py-3 text-left text-sm font-semibold text-gray-600 uppercase">Descripción</th>
              <th className="py-3 text-right text-sm font-semibold text-gray-600 uppercase">Cant.</th>
              <th className="py-3 text-right text-sm font-semibold text-gray-600 uppercase">Precio Unit.</th>
              <th className="py-3 text-right text-sm font-semibold text-gray-600 uppercase">Descuento</th>
              <th className="py-3 text-right text-sm font-semibold text-gray-600 uppercase">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {quote.lines.map((line: any) => (
              <tr key={line.id}>
                <td className="py-4 text-gray-900">
                  {/* Ideally, we have product name here. For now show ID or require fetching */}
                  {line.productName || line.productId.slice(0, 8) + '...'}
                </td>
                <td className="py-4 text-right text-gray-600">{Number(line.quantity)}</td>
                <td className="py-4 text-right text-gray-600">${Number(line.unitPrice).toFixed(2)}</td>
                <td className="py-4 text-right text-gray-600">${Number(line.discount).toFixed(2)}</td>
                <td className="py-4 text-right text-gray-900 font-medium">${Number(line.subtotal).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals & Notes */}
        <div className="flex justify-between items-start">
          <div className="w-1/2 pr-8">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Notas / Condiciones</h3>
            <p className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
              {quote.notes || 'Ninguna condición adicional especificada.'}
            </p>
          </div>
          
          <div className="w-1/2 max-w-sm">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>${Number(quote.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Descuento Total</span>
                <span>-${Number(quote.discount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>ITBIS (18%)</span>
                <span>${Number(quote.totalTaxes).toFixed(2)}</span>
              </div>
              <div className="pt-3 border-t border-gray-200 flex justify-between items-center">
                <span className="text-base font-bold text-gray-900">Total General</span>
                <span className="text-xl font-bold text-indigo-600">${Number(quote.total).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-20 pt-8 border-t border-gray-200 text-center text-sm text-gray-500">
          <p>Esta es una cotización y no representa un comprobante de pago válido para fines fiscales.</p>
        </div>

      </div>
    </div>
  );
}
