'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { Printer, Filter, Download } from 'lucide-react';
import { toast } from 'sonner';

interface ReceivablesData {
  id: string;
  invoiceId: string;
  ncf: string;
  codigoFactura: string;
  amount: string;
  balance: string;
  dueDate: string;
  status: string;
  customerName: string;
  customerRnc: string;
}

export default function ReceivablesReportPage() {
  const router = useRouter();
  const [data, setData] = useState<ReceivablesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedCustomer]);

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/v1/contacts?type=customer&limit=1000');
      if (res.ok) {
        const json = await res.json();
        setCustomers(json.data || json);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/reports/receivables?customerId=${selectedCustomer}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        toast.error('Error al cargar datos');
      }
    } catch (e) {
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      // Abre en nueva pestaña para imprimir
      window.open(`/api/v1/reports/receivables/print?customerId=${selectedCustomer}`, '_blank');
    } catch (e) {
      toast.error('Error al generar reporte');
    } finally {
      setPrinting(false);
    }
  };

  const totalBalance = data.reduce((acc, curr) => acc + Number(curr.balance), 0);
  const overdueBalance = data.filter(d => new Date(d.dueDate) < new Date()).reduce((acc, curr) => acc + Number(curr.balance), 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Reporte de Cuentas por Cobrar</h1>
          <p className="text-white/60">Consolidado de facturas pendientes de cobro</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handlePrint} disabled={printing} variant="secondary">
            <Printer className="w-4 h-4 mr-2" />
            Imprimir Plantilla
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1c1c1c] p-6 rounded-xl border border-white/10 flex flex-col gap-2">
          <span className="text-white/60 text-sm">Balance Total Pendiente</span>
          <span className="text-3xl font-bold text-white">RD$ {totalBalance.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="bg-[#1c1c1c] p-6 rounded-xl border border-red-500/20 flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute inset-0 bg-red-500/5 pointer-events-none" />
          <span className="text-red-400/80 text-sm">Balance Vencido</span>
          <span className="text-3xl font-bold text-red-500">RD$ {overdueBalance.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="bg-[#1c1c1c] p-6 rounded-xl border border-white/10 flex flex-col justify-center">
          <label className="text-white/60 text-sm mb-2">Filtrar por Cliente</label>
          <Select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)} className="w-full bg-black/50 border-white/10 text-white">
            <option value="all" className="bg-[#1c1c1c] text-white">Todos los clientes</option>
            {customers.map(c => (
              <option key={c.id} value={c.id} className="bg-[#1c1c1c] text-white">{c.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="bg-[#1c1c1c] rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/60">Cliente</TableHead>
                <TableHead className="text-white/60">NCF / Código</TableHead>
                <TableHead className="text-white/60">F. Vencimiento</TableHead>
                <TableHead className="text-right text-white/60">Monto Original</TableHead>
                <TableHead className="text-right text-white/60">Balance Pendiente</TableHead>
                <TableHead className="text-center text-white/60">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-white/60">Cargando datos...</TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-white/60">No hay cuentas por cobrar pendientes</TableCell>
                </TableRow>
              ) : (
                data.map((item) => {
                  const isOverdue = new Date(item.dueDate) < new Date();
                  return (
                    <TableRow key={item.id} className="border-white/10 hover:bg-white/5">
                      <TableCell>
                        <div className="font-medium text-white">{item.customerName}</div>
                        <div className="text-xs text-white/50">{item.customerRnc}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-white">{item.ncf}</div>
                        <div className="text-xs text-white/50">{item.codigoFactura}</div>
                      </TableCell>
                      <TableCell className={isOverdue ? 'text-red-400' : 'text-white'}>
                        {new Date(item.dueDate).toLocaleDateString('es-DO')}
                      </TableCell>
                      <TableCell className="text-right text-white/80">
                        RD$ {Number(item.amount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-medium text-white">
                        RD$ {Number(item.balance).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`px-2 py-1 rounded-full text-xs ${isOverdue ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                          {isOverdue ? 'Vencida' : 'Pendiente'}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
