'use client';

import React, { useState } from 'react';
import { Download, Mail, Printer, Share2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface DocumentViewerProps {
  documentId: string;
  documentType: string;
  htmlContent: string;
  pdfUrl?: string; // If we already have the URL for direct download
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  documentId,
  documentType,
  htmlContent,
  pdfUrl,
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);

  const handleDownloadPdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      if (pdfUrl) {
        window.open(pdfUrl, '_blank');
      } else {
        const response = await fetch(`/api/documents/pdf/${documentType}/${documentId}`);
        if (!response.ok) throw new Error('Error al descargar el PDF');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${documentType}-${documentId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
      toast.success('PDF descargado exitosamente');
    } catch (error) {
      console.error(error);
      toast.error('Ocurrió un error al generar el PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    // For printing we can open a new window with the html content
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      // small timeout to allow resources to load
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };

  const handleSendEmail = async () => {
    if (isSendingEmail) return;
    const email = window.prompt('Ingrese el correo destino:');
    if (!email) return;

    setIsSendingEmail(true);
    try {
      const response = await fetch(`/api/documents/email/${documentType}/${documentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: email })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Error al enviar correo');
      }

      toast.success(`Documento enviado exitosamente a ${email}`);
    } catch (error: any) {
      console.error(error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleShare = async () => {
    if (isGeneratingShare) return;
    setIsGeneratingShare(true);
    try {
      const response = await fetch(`/api/documents/share/${documentType}/${documentId}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Error al generar enlace público');
      
      const { url } = await response.json();
      await navigator.clipboard.writeText(url);
      toast.success('Enlace copiado al portapapeles');
    } catch (error) {
      console.error(error);
      toast.error('Error al generar enlace seguro');
    } finally {
      setIsGeneratingShare(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Toolbar */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-2">
          <h2 className="text-lg font-semibold text-slate-800 capitalize">
            {documentType === 'invoice' ? 'Factura' : documentType}
          </h2>
          <span className="text-sm text-slate-500">#{documentId.substring(0, 8)}</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handlePrint}
            className="flex items-center space-x-2 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
          
          <button
            onClick={handleShare}
            disabled={isGeneratingShare}
            className="flex items-center space-x-2 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50 transition-colors"
          >
            {isGeneratingShare ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            <span className="hidden sm:inline">Compartir</span>
          </button>

          <button
            onClick={handleSendEmail}
            disabled={isSendingEmail}
            className="flex items-center space-x-2 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50 transition-colors"
          >
            {isSendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            <span className="hidden sm:inline">Enviar</span>
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="flex items-center space-x-2 px-4 py-2 bg-sky-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Document Canvas */}
      <div className="flex-1 overflow-auto p-6 flex justify-center bg-slate-200">
        <div className="bg-white shadow-lg rounded-sm w-full max-w-4xl min-h-[1056px] relative overflow-hidden">
          {/* Injecting HTML directly. Since this is an internal ERP and the HTML is generated by our own React components, it is safe from XSS. */}
          <div dangerouslySetInnerHTML={{ __html: htmlContent }} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
};
