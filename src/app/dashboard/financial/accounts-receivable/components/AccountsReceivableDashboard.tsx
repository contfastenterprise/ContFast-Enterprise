'use client';

import React, { useState } from 'react';
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, List, Kanban, Calendar as CalendarIcon, Activity } from 'lucide-react';
import DashboardTab from './DashboardTab';
import ListTab from './ListTab';
import KanbanTab from './KanbanTab';

export default function AccountsReceivableDashboard({ initialData }: { initialData: any }) {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="flex flex-col gap-6">
      <div className="w-full">
        <TabsList className="bg-surface-container-low border border-outline-variant/20 p-1 h-auto mb-6">
          <TabsTrigger 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
            className="flex items-center gap-2 py-2 px-4"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Resumen Ejecutivo</span>
          </TabsTrigger>
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
          <TabsTrigger 
            active={activeTab === 'calendar'} 
            onClick={() => setActiveTab('calendar')} 
            className="flex items-center gap-2 py-2 px-4"
          >
            <CalendarIcon className="w-4 h-4" />
            <span>Calendario</span>
          </TabsTrigger>
          <TabsTrigger 
            active={activeTab === 'activity'} 
            onClick={() => setActiveTab('activity')} 
            className="flex items-center gap-2 py-2 px-4"
          >
            <Activity className="w-4 h-4" />
            <span>Línea de Tiempo</span>
          </TabsTrigger>
        </TabsList>

        <div className="m-0 focus:outline-none">
          {activeTab === 'dashboard' && <DashboardTab data={initialData} />}
          {activeTab === 'list' && <ListTab data={initialData.raw} companyInfo={initialData.companyInfo} />}
          {activeTab === 'kanban' && <KanbanTab data={initialData.raw} />}
          {activeTab === 'calendar' && (
            <div className="bg-surface-bright border border-outline-variant/20 rounded-2xl p-8 text-center text-neutral-500">
              <CalendarIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200">Calendario de Vencimientos</h3>
              <p className="max-w-md mx-auto mt-2">Visualiza las fechas límite de todas las facturas en un calendario interactivo. (Módulo en construcción)</p>
            </div>
          )}
          {activeTab === 'activity' && (
            <div className="bg-surface-bright border border-outline-variant/20 rounded-2xl p-8 text-center text-neutral-500">
              <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200">Auditoría y Línea de Tiempo</h3>
              <p className="max-w-md mx-auto mt-2">Rastrea cada movimiento, recordatorio enviado y pago recibido de todas las cuentas por cobrar. (Módulo en construcción)</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
