'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { DocumentTemplates } from '@/utils/templates/documentTemplates';

export default function PrintQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [quote, setQuote] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [quoteRes, companyRes] = await Promise.all([
          fetch(`/api/v1/quotes/${id}`),
          fetch(`/api/v1/companies/profile`)
        ]);
        
        const quoteData = await quoteRes.json();
        const companyData = await companyRes.json();

        if (quoteData.success) {
          setQuote(quoteData.data);
        } else {
          toast.error('Error cargando cotización');
        }

        if (companyData.success) {
          setCompany(companyData.data);
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
      const customerName = quote.customerName || quote.customer?.name || 'Cliente';
      const sequenceNumber = quote.sequenceNumber || `COT-${id.slice(0, 8).toUpperCase()}`;
      
      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const year = today.getFullYear();
      const printDate = `${day}-${month}-${year}`;

      const cleanCustomerName = customerName.replace(/[/\\?%*:|"<>]/g, '_').trim();
      const cleanNum = String(sequenceNumber).replace(/[/\\?%*:|"<>]/g, '_').trim();
      
      document.title = `${cleanCustomerName} - Cotizacion - ${cleanNum} - ${printDate}`;
    }
  }, [quote, id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div className="p-10 text-center text-slate-600 font-semibold">Cargando plantilla de cotización...</div>;
  }

  if (!quote) {
    return <div className="p-10 text-center text-rose-500 font-bold">Cotización no encontrada.</div>;
  }

  const htmlContent = DocumentTemplates.renderQuote({
    company,
    customer: quote.customer,
    quote,
    lines: quote.lines,
    taxes: quote.taxes,
  });

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white text-slate-900 font-sans pb-12 print:pb-0">
      {/* Print Controls (hidden when printing) */}
      <div className="print:hidden p-4 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between max-w-4xl mx-auto my-4 rounded-xl">
        <button 
          onClick={() => router.back()}
          className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
        <button 
          onClick={handlePrint}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#C5A059] text-slate-950 text-xs font-bold rounded-xl hover:bg-[#b08c4a] transition-all shadow-md"
        >
          <Printer className="w-4 h-4" /> Imprimir Cotización
        </button>
      </div>

      {/* A4 Document Rendering Container */}
      <div className="max-w-4xl mx-auto bg-white shadow-xl print:shadow-none rounded-2xl print:rounded-none overflow-hidden print:overflow-visible">
        <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>
    </div>
  );
}
