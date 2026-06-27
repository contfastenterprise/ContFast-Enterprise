'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Edit2, Trash2, Building2, MapPin, CheckCircle, XCircle, Printer } from 'lucide-react';
import { toast } from 'sonner';

interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string | null;
  status: 'active' | 'inactive';
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentWarehouse, setCurrentWarehouse] = useState<Warehouse | null>(null);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const filteredWarehouses = warehouses.filter((w) =>
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) || w.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePrintList = async () => {
    const toastId = toast.loading('Preparando plantilla de impresión...');
    try {
      const res = await fetch('/api/v1/company/settings');
      const settingsData = await res.json();
      const company = settingsData.data || {};
      
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const logoHtml = company.logoUrl 
        ? `<img src="${company.logoUrl}" style="max-height: 55px; width: auto; object-fit: contain; margin-left: -3ch;" alt="Logo">` 
        : '';
      const companyTitleHtml = logoHtml ? '' : `<div style="font-size: 20px; font-weight: bold; color: #003366;">${company.companyName || 'Latin Doors e-CF'}</div>`;

      const htmlContent = `
        <html>
          <head>
            <title>Reporte de Almacenes - ${company.companyName || 'Latin Doors e-CF'}</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #333; margin: 30px; line-height: 1.4; font-size: 13px; }
              .header { display: flex; justify-content: space-between; border-bottom: 2px solid #003366; padding-bottom: 15px; margin-bottom: 20px; }
              .company-info { font-size: 12px; color: #555; line-height: 1.4; }
              .doc-info { text-align: right; }
              .subtitle { font-size: 16pt; color: #003366; font-weight: bold; margin-bottom: 5px; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { padding: 9px 10px; font-size: 12px; text-align: left; border-bottom: 1px solid #ddd; }
              th { background-color: #003366; color: white; font-weight: bold; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
              tr:nth-child(even) { background-color: #f8f9fa; }
              .text-center { text-align: center; }
              .font-mono { font-family: monospace; font-size: 12px; }
              .footer { margin-top: 50px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 15px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="company-info">
                ${logoHtml}
                ${companyTitleHtml}
                ${company.rnc ? `<div>RNC: ${company.rnc}</div>` : ''}
                ${company.address ? `<div>${company.address}</div>` : ''}
              </div>
              <div class="doc-info">
                <div class="subtitle">DIRECTORIO DE ALMACENES</div>
                <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
                <div><strong>Almacenes Filtrados:</strong> ${filteredWarehouses.length}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Dirección</th>
                  <th class="text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${filteredWarehouses.map(w => `
                  <tr>
                    <td class="font-mono"><strong>${w.code}</strong></td>
                    <td>${w.name}</td>
                    <td>${w.address || '-'}</td>
                    <td class="text-center">
                      <span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; background-color: ${w.status === 'active' ? '#e6f4ea' : '#f1f3f4'}; color: ${w.status === 'active' ? '#137333' : '#5f6368'};">
                        ${w.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="footer">
              Directorio de Almacenes - Generado por ContFast Enterprise
            </div>
            <script>
              window.onload = function() {
                window.print();
              };
            </script>
          </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      toast.success('Impresión preparada con éxito', { id: toastId });
    } catch (err) {
      toast.error('Error al preparar impresión', { id: toastId });
    }
  };

  const fetchWarehouses = async () => {
    try {
      const res = await fetch('/api/v1/warehouses');
      const data = await res.json();
      if (data.data) {
        setWarehouses(data.data);
      }
    } catch (error) {
      toast.error('Error al cargar los almacenes');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get('name'),
      code: form.get('code'),
      address: form.get('address'),
      status: form.get('status'),
    };

    try {
      const url = currentWarehouse ? `/api/v1/warehouses/${currentWarehouse.id}` : '/api/v1/warehouses';
      const method = currentWarehouse ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      toast.success(currentWarehouse ? 'Almacén actualizado' : 'Almacén creado');
      setIsModalOpen(false);
      fetchWarehouses();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro que desea desactivar este almacén?')) return;
    try {
      const res = await fetch(`/api/v1/warehouses/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al desactivar');
      toast.success('Almacén desactivado');
      fetchWarehouses();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-bright p-6 rounded-3xl border border-outline-variant/30 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <h1 className="font-display-sm text-2xl font-bold text-on-surface">Gestión de Almacenes</h1>
            <p className="font-body-md text-on-surface-variant">
              Administra las ubicaciones físicas y sucursales de tu empresa.
            </p>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={handlePrintList}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-[#003366] px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 font-bold text-sm shadow-sm"
          >
            <Printer className="h-4 w-4 text-amber-500" /> Imprimir
          </button>
          <button
            onClick={() => {
              setCurrentWarehouse(null);
              setIsModalOpen(true);
            }}
            className="bg-[#003366] hover:bg-[#002244] text-white font-bold py-2.5 px-6 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm justify-center"
          >
            <Plus className="h-4 w-4" />
            Nuevo Almacén
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant/50" />
        <input
          type="text"
          placeholder="Buscar por nombre o código..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-surface-bright border border-outline-variant/30 rounded-2xl py-4 pl-12 pr-4 font-body-lg text-on-surface focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-sm"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredWarehouses.map((warehouse) => (
              <motion.div
                key={warehouse.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-surface-bright border border-outline-variant/30 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-primary font-bold bg-primary/10 px-2 py-1 rounded-lg w-max mb-2">
                      {warehouse.code}
                    </span>
                    <h3 className="font-headline-sm text-lg font-bold text-on-surface truncate">
                      {warehouse.name}
                    </h3>
                  </div>
                  <div className={`p-2 rounded-xl ${warehouse.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {warehouse.status === 'active' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-on-surface-variant font-body-sm mb-6 flex-1">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{warehouse.address || 'Sin dirección registrada'}</span>
                </div>

                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={() => {
                      setCurrentWarehouse(warehouse);
                      setIsModalOpen(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 bg-surface-variant text-on-surface-variant hover:bg-primary/10 hover:text-primary py-2.5 rounded-xl font-label-md transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Editar
                  </button>
                  {warehouse.status === 'active' && (
                    <button
                      onClick={() => handleDelete(warehouse.id)}
                      className="p-2.5 bg-surface-variant text-error hover:bg-error/10 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="relative w-full max-w-lg bg-surface-bright rounded-3xl shadow-2xl border border-outline-variant/30 overflow-hidden"
            >
              <div className="p-6 border-b border-outline-variant/20 bg-surface-variant/30">
                <h2 className="font-headline-sm text-xl font-bold text-on-surface">
                  {currentWarehouse ? 'Editar Almacén' : 'Nuevo Almacén'}
                </h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  Ingresa los detalles de la ubicación física.
                </p>
              </div>

              <form onSubmit={handleSave} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-bold text-on-surface mb-1.5">Código</label>
                    <input
                      name="code"
                      defaultValue={currentWarehouse?.code}
                      placeholder="Ej. ALM-01"
                      required
                      className="w-full bg-surface-variant/50 border border-outline-variant/50 rounded-xl px-3 py-2 text-xs focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-bold text-on-surface mb-1.5">Estado</label>
                    <select
                      name="status"
                      defaultValue={currentWarehouse?.status || 'active'}
                      className="w-full bg-surface-variant/50 border border-outline-variant/50 rounded-xl px-3 py-2 text-xs focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    >
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-bold text-on-surface mb-1.5">Nombre del Almacén</label>
                    <input
                      name="name"
                      defaultValue={currentWarehouse?.name}
                      placeholder="Ej. Almacén Principal"
                      required
                      className="w-full bg-surface-variant/50 border border-outline-variant/50 rounded-xl px-3 py-2 text-xs focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-bold text-on-surface mb-1.5">Dirección Física</label>
                    <textarea
                      name="address"
                      defaultValue={currentWarehouse?.address || ''}
                      placeholder="Dirección completa..."
                      rows={3}
                      className="w-full bg-surface-variant/50 border border-outline-variant/50 rounded-xl px-4 py-2.5 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all resize-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-outline-variant/20 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl font-bold text-on-surface-variant hover:bg-surface-variant transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl font-bold bg-primary text-on-primary shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all"
                  >
                    Guardar Cambios
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
