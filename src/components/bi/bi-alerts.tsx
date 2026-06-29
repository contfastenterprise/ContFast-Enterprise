'use client';

import React from 'react';
import { 
  AlertTriangle, ShieldAlert, CheckCircle2, 
  Info, ArrowRight 
} from 'lucide-react';

interface BIAlertsProps {
  generalData: any;
  productsData: any;
  inventoryData: any;
  customersData: any;
}

const fmtDop = (val: number) => {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(val);
};

export default function BIAlerts({ generalData, productsData, inventoryData, customersData }: BIAlertsProps) {
  if (!generalData || !productsData || !inventoryData || !customersData) return null;

  const alerts: any[] = [];

  // 1. Stock Crítico / Agotado
  const exhaustedItems = (inventoryData.stockLevels || []).filter((l: any) => l.status === 'exhausted');
  const criticalItems = (inventoryData.stockLevels || []).filter((l: any) => l.status === 'critical');

  if (exhaustedItems.length > 0) {
    alerts.push({
      type: 'danger',
      category: 'Inventario',
      title: `${exhaustedItems.length} Productos Agotados (Stock en Cero)`,
      description: `Hay ${exhaustedItems.length} artículos sin existencias físicas en los almacenes. Esto puede causar pérdidas inmediatas de facturación.`,
      items: exhaustedItems.slice(0, 5).map((i: any) => `${i.name} (Almacén: ${i.warehouse})`),
      actionText: 'Ver Almacenes',
      actionLink: '/dashboard/warehouses'
    });
  }

  if (criticalItems.length > 0) {
    alerts.push({
      type: 'warning',
      category: 'Inventario',
      title: `${criticalItems.length} Productos Próximos a Agotarse (Bajo Mínimo)`,
      description: `Hay ${criticalItems.length} artículos cuyas existencias están por debajo del stock mínimo establecido. Se requiere reposición.`,
      items: criticalItems.slice(0, 5).map((i: any) => `${i.name} (Stock: ${i.stock} / Mín: ${i.minStock})`),
      actionText: 'Ver Productos',
      actionLink: '/dashboard/products'
    });
  }

  // 2. Facturas Vencidas / CxC
  if (generalData.overdueInvoices > 0) {
    alerts.push({
      type: 'danger',
      category: 'Finanzas',
      title: `${generalData.overdueInvoices} Facturas Pendientes con Plazo Vencido`,
      description: `Se detectaron ${generalData.overdueInvoices} facturas vencidas con balance pendiente de cobro, totalizando ${fmtDop(generalData.receivablesAmount)}.`,
      items: [],
      actionText: 'Ver Pagos y Abonos',
      actionLink: '/dashboard/receivables'
    });
  }

  // 3. Clientes Importantes Inactivos
  const inactiveKeys = (customersData.inactiveCustomers || []);
  if (inactiveKeys.length > 0) {
    alerts.push({
      type: 'warning',
      category: 'Clientes',
      title: `${inactiveKeys.length} Clientes Clave Inactivos (> 60 días)`,
      description: `Hay ${inactiveKeys.length} clientes recurrentes de alto valor que no han registrado facturas en los últimos 60 días.`,
      items: inactiveKeys.slice(0, 5).map((c: any) => `${c.name} (Última compra: ${c.lastPurchase})`),
      actionText: 'Ver Clientes',
      actionLink: '/dashboard/customers'
    });
  }

  // 4. Inventario Excesivo
  const excessItems = (inventoryData.stockLevels || []).filter((l: any) => l.status === 'excessive');
  if (excessItems.length > 0) {
    alerts.push({
      type: 'info',
      category: 'Inventario',
      title: `${excessItems.length} Productos con Exceso de Stock`,
      description: `Hay ${excessItems.length} artículos cuyas existencias exceden el stock máximo sugerido, inmovilizando capital de trabajo.`,
      items: excessItems.slice(0, 5).map((i: any) => `${i.name} (Stock: ${i.stock} / Máx: ${i.maxStock})`),
      actionText: 'Ver Ajustes',
      actionLink: '/dashboard/inventory/adjustments'
    });
  }

  // 5. Productos Inmovilizados (Sin Movimiento)
  const noMvt = (productsData.noMovement || []);
  if (noMvt.length > 10) {
    alerts.push({
      type: 'info',
      category: 'Ventas',
      title: `Catálogo Inmovilizado (${noMvt.length} Productos sin Ventas)`,
      description: `Hay ${noMvt.length} productos en catálogo activo que no han registrado ventas en el rango de fechas seleccionado.`,
      items: noMvt.slice(0, 5).map((p: any) => `${p.name} (SKU: ${p.sku})`),
      actionText: 'Ver Productos',
      actionLink: '/dashboard/products'
    });
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300 text-on-surface">
      <div className="bg-surface-variant/30 p-6 rounded-3xl border border-outline-variant/10 flex items-start gap-4">
        <Info className="w-6 h-6 text-primary shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-on-surface text-base font-display-md">Alertas y Sugerencias de Negocio</h4>
          <p className="text-sm text-on-surface-variant mt-1">
            Esta sección agrupa automáticamente eventos críticos en base a umbrales, plazos fiscales, CxC y rotaciones físicas de inventario.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {alerts.map((alert: any, idx: number) => {
          let cardBg = 'bg-blue-50/50 border-blue-200 text-blue-800';
          let badgeColor = 'bg-blue-100 text-blue-850';
          let icon = <Info className="w-5 h-5 text-blue-600" />;

          if (alert.type === 'danger') {
            cardBg = 'bg-red-50/50 border-red-200 text-red-800';
            badgeColor = 'bg-red-100 text-red-850';
            icon = <ShieldAlert className="w-5 h-5 text-red-600" />;
          } else if (alert.type === 'warning') {
            cardBg = 'bg-amber-50/50 border-amber-200 text-amber-800';
            badgeColor = 'bg-amber-100 text-amber-850';
            icon = <AlertTriangle className="w-5 h-5 text-amber-600" />;
          }

          return (
            <div 
              key={idx} 
              className={`p-6 rounded-3xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 shadow-sm ${cardBg}`}
            >
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  {icon}
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${badgeColor}`}>
                    {alert.category}
                  </span>
                  <span className="font-extrabold text-sm sm:text-base text-on-surface">{alert.title}</span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed max-w-2xl">{alert.description}</p>
                {alert.items && alert.items.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-outline-variant/10 space-y-1">
                    <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Detalles de Alerta:</p>
                    <ul className="text-xs space-y-1 list-disc list-inside text-on-surface-variant/80 font-medium">
                      {alert.items.map((item: string, iIndex: number) => (
                        <li key={iIndex}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <a 
                href={alert.actionLink}
                className="flex items-center gap-1.5 px-4 py-2 bg-surface-bright border border-outline-variant/30 hover:bg-slate-50 rounded-xl text-xs font-bold text-on-surface-variant shadow-xs shrink-0 self-end sm:self-center transition-all"
              >
                {alert.actionText}
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          );
        })}

        {alerts.length === 0 && (
          <div className="py-16 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <h4 className="font-bold text-on-surface text-base">Operaciones al Día</h4>
            <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
              No se detectaron alertas operativas ni deudas vencidas. Las finanzas e inventarios están saludables.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
