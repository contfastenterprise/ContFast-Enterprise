'use client';

import { useEffect, useState } from 'react';

interface ThermalTicketPrintProps {
  sessionId: string;
  autoPrint?: boolean;
}

export function ThermalTicketPrint({ sessionId, autoPrint = false }: ThermalTicketPrintProps) {
  const [ticketData, setTicketData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchTicket() {
      try {
        const res = await fetch(`/api/v1/cash/sessions/${sessionId}/ticket`);
        if (!res.ok) throw new Error('Error fetching ticket data');
        const data = await res.json();
        setTicketData(data);
        setLoading(false);
        if (autoPrint) {
          // Allow DOM to update before printing
          setTimeout(() => {
            window.print();
          }, 500);
        }
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }
    fetchTicket();
  }, [sessionId, autoPrint]);

  if (loading) return <div>Cargando ticket...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!ticketData) return null;

  const layout = ticketData.company.settings?.printLayout || '80mm';

  return (
    <div className="ticket-container print-only">
      <style dangerouslySetInnerHTML={{__html: `
        @page {
          size: ${layout === '80mm' ? '80mm' : '58mm'} auto;
          margin: 2mm;
        }
        @media print {
          body * {
            visibility: hidden;
          }
          .print-only, .print-only * {
            visibility: visible;
          }
          .print-only {
            position: absolute;
            left: 0;
            top: 0;
            width: ${layout === '80mm' ? '76mm' : '54mm'};
            font-family: monospace;
            font-size: ${layout === '80mm' ? '9pt' : '8pt'};
            color: #000;
          }
        }
        @media screen {
          .print-only {
            display: none;
          }
        }
        .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
        .title { font-weight: bold; text-transform: uppercase; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .totals { border-top: 1px dashed #000; padding-top: 5px; margin-top: 5px; font-weight: bold; }
        .center { text-align: center; }
      `}} />

      <div className="header">
        <div className="title">{ticketData.company.name}</div>
        <div>RNC: {ticketData.company.rnc}</div>
        <div>Cierre de Caja</div>
      </div>
      
      <div><strong>Cajero:</strong> {ticketData.cashier}</div>
      <div><strong>Apertura:</strong> {new Date(ticketData.openedAt).toLocaleString()}</div>
      <div><strong>Cierre:</strong> {new Date(ticketData.closedAt).toLocaleString()}</div>
      
      <div className="totals">
        <div className="row"><span>Fondo Inicial:</span><span>\$\${ticketData.initialBalance.toFixed(2)}</span></div>
        <div className="row"><span>Ingresos:</span><span>\$\${ticketData.totalCashIn.toFixed(2)}</span></div>
        <div className="row"><span>Salidas:</span><span>\$\${ticketData.totalCashOut.toFixed(2)}</span></div>
        <div className="row"><span>Saldo Esperado:</span><span>\$\${ticketData.expectedBalance.toFixed(2)}</span></div>
      </div>
      
      <div className="center" style={{ marginTop: '20px' }}>
        <div>_______________________</div>
        <div>Firma del Cajero</div>
      </div>
    </div>
  );
}
