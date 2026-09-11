'use client';

import React, { useState } from 'react';
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from 'next/link';
import { List, Kanban, PieChart, ArrowRight } from 'lucide-react';
import ListTab from './ListTab';
import KanbanTab from './KanbanTab';

export default function AccountsReceivableDashboard({ initialData }: { initialData: any }) {
  // Arranca en 'list': la pestaña 'dashboard' ya no existe (ver la nota de
  // abajo), y dejar el valor por defecto apuntando a una pestaña retirada
  // pintaba la pantalla vacia sin ningun aviso.
  const [activeTab, setActiveTab] = useState('list');

  return (
    <div className="flex flex-col gap-6">
      <div className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <TabsList className="bg-surface-container-low border border-outline-variant/20 p-1 h-auto">
            <TabsTrigger 
              active={activeTab === 'list'} 
              onClick={() => setActiveTab('list')} 
              className="flex items-center gap-2 py-2 px-4"
            >
              <List className="w-4 h-4" />
              <span>Listado Completo</span>
            </TabsTrigger>
            <TabsTrigger 
              active={activeTab === 'kanban'} 
              onClick={() => setActiveTab('kanban')} 
              className="flex items-center gap-2 py-2 px-4"
            >
              <Kanban className="w-4 h-4" />
              <span>Tablero Kanban</span>
            </TabsTrigger>
          </TabsList>

        {/* EL ANALISIS DE CARTERA VIVE EN UN SOLO SITIO.
            Esta pantalla tenia una pestaña "Resumen Ejecutivo" que mostraba
            antiguedad de saldos, estado de cartera y top deudores -- lo mismo
            que /dashboard/antiguedad-saldos, y detras de un menu que solo veian
            sistemas y administracion. Dos sitios que calculan lo mismo son dos
            sitios que pueden discrepar, y el que nadie veia era este.
            Lo que se queda aqui es lo que la otra NO hace: la lista factura por
            factura y el tablero. */}
        <Link
          href="/dashboard/antiguedad-saldos"
          className="inline-flex items-center gap-2 h-8 px-3 py-1.5 rounded-lg text-xs font-bold text-[#c5a059] bg-[#c5a059]/10 hover:bg-[#c5a059]/20 transition-colors"
        >
          <PieChart className="w-4 h-4" />
          <span>Ver análisis de cartera</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        </div>

        <div className="m-0 focus:outline-none">
          {activeTab === 'list' && <ListTab data={initialData.raw} companyInfo={initialData.companyInfo} />}
          {activeTab === 'kanban' && <KanbanTab data={initialData.raw} />}
        </div>
      </div>
    </div>
  );
}
