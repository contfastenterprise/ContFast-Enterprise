'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import {
  HelpCircle, MessageSquare, Send, Check, LifeBuoy,
  ChevronRight, RefreshCw, FileText, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';

export default function SupportPage() {
  const [submitting, setSubmitting] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('billing');
  const [message, setMessage] = useState('');
  
  // Mock knowledge base articles
  const articles = [
    { title: '¿Cómo emitir una factura de crédito fiscal (e-31)?', link: '#' },
    { title: 'Error de firma digital: Causas y soluciones', link: '#' },
    { title: 'Pasos para el cierre de turno y arqueo de caja', link: '#' },
    { title: 'Requisitos de la DGII para proveedores autorizados', link: '#' }
  ];

  const handleSendTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Simulate ticket creation endpoint interaction or local logic
      await new Promise(resolve => setTimeout(resolve, 1200));
      toast.success('Ticket de soporte creado', {
        description: 'Nos comunicaremos con usted a la brevedad.',
      });
      setSubject('');
      setMessage('');
    } catch (error) {
      toast.error('Error al enviar ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Toaster position="top-right" richColors />

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-900 pb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-primary flex items-center gap-2">
              <LifeBuoy className="h-7 w-7 text-amber-500" />
              Soporte y Centro de Ayuda
            </h1>
            <p className="text-on-surface-variant text-sm mt-1">
              Consulte la base de conocimientos o envíe una solicitud de ayuda técnica a nuestro equipo.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Support Form */}
          <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-6 md:col-span-2 space-y-4">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
              <MessageSquare className="h-4.5 w-4.5 text-amber-500" />
              Enviar Ticket de Soporte
            </h3>
            
            <form onSubmit={handleSendTicket} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase">Categoría del Problema</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="block w-full rounded-md border-0 bg-background py-2.5 px-3 text-primary ring-1 ring-inset ring-outline-variant/30 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                  >
                    <option value="billing">Facturación e-CF</option>
                    <option value="cash">Módulo de Caja</option>
                    <option value="bank">Bancos y Cuentas</option>
                    <option value="account">Configuración / Empresa</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase">Asunto</label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Resumen del problema..."
                    className="block w-full rounded-md border-0 bg-background py-2.5 px-3 text-primary ring-1 ring-inset ring-outline-variant/30 focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-on-surface-variant uppercase">Descripción del Problema</label>
                <textarea
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Detalle los pasos que causaron el inconveniente..."
                  className="block w-full rounded-md border-0 bg-background py-2.5 px-3 text-primary ring-1 ring-inset ring-outline-variant/30 focus:ring-2 focus:ring-amber-500 outline-none text-sm resize-none"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 rounded bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar Mensaje
                </button>
              </div>
            </form>
          </div>

          {/* Help Center Articles */}
          <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-6 space-y-4">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
              <HelpCircle className="h-4.5 w-4.5 text-amber-500" />
              Preguntas Frecuentes
            </h3>

            <div className="divide-y divide-outline-variant/20 pt-2">
              {articles.map((art, idx) => (
                <a
                  key={idx}
                  href={art.link}
                  className="py-3 flex items-center justify-between group text-xs text-on-surface-variant hover:text-primary transition-colors"
                >
                  <span className="font-medium pr-2">{art.title}</span>
                  <ChevronRight className="h-4 w-4 text-on-surface-variant/70 group-hover:text-amber-500 transition-colors shrink-0" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
