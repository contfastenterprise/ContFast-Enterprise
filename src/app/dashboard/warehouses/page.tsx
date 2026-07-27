'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Edit2, Trash2, Building2, MapPin, CheckCircle, XCircle, Printer, X, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/ui/search-bar';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';

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
  const [currentUserRole, setCurrentUserRole] = useState<string>('');

  useEffect(() => {
    fetchWarehouses();
    fetchUserRole();
  }, []);

  async function fetchUserRole() {
    try {
      const res = await fetch('/api/v1/auth/me');
      const data = await res.json();
      if (data.data?.user?.role) {
        setCurrentUserRole(data.data.user.role.toLowerCase());
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
    }
  }

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

  async function fetchWarehouses() {
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
  }

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

  const handleToggleStatus = async (warehouse: Warehouse) => {
    const nextStatus = warehouse.status === 'active' ? 'inactive' : 'active';
    const actionText = nextStatus === 'active' ? 'habilitar' : 'deshabilitar';
    if (!confirm(`¿Está seguro que desea ${actionText} este almacén?`)) return;

    try {
      const res = await fetch(`/api/v1/warehouses/${warehouse.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: warehouse.name,
          code: warehouse.code,
          address: warehouse.address,
          status: nextStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error al ${actionText}`);

      toast.success(nextStatus === 'active' ? 'Almacén habilitado' : 'Almacén deshabilitado');
      fetchWarehouses();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#001e40]/10 dark:bg-[#003366]/30 rounded-xl flex items-center justify-center text-[#003366] dark:text-[#C5A059]">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Gestión de Almacenes</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Administra las ubicaciones físicas y sucursales de tu empresa.
            </p>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button
            variant="outline"
            onClick={handlePrintList}
            className="gap-2"
          >
            <Printer className="h-4 w-4 text-amber-500" /> Imprimir
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setCurrentWarehouse(null);
              setIsModalOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Nuevo Almacén
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <SearchBar
        placeholder="Buscar por nombre o código..."
        value={searchTerm}
        onChange={setSearchTerm}
      />

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#003366]/30 border-t-[#003366] rounded-full animate-spin" />
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
              >
                <Card className="h-full flex flex-col justify-between p-6">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <Badge variant="secondary" className="font-mono">
                        {warehouse.code}
                      </Badge>
                      <Badge variant={warehouse.status === 'active' ? 'success' : 'destructive'}>
                        {warehouse.status === 'active' ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate mb-2">
                      {warehouse.name}
                    </h3>
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-4">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                      <span className="truncate">{warehouse.address || 'Sin dirección registrada'}</span>
                    </div>
                  </div>

                  <div className="flex gap-1.5 justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setCurrentWarehouse(warehouse);
                        setIsModalOpen(true);
                      }}
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleToggleStatus(warehouse)}
                      title={warehouse.status === 'active' ? 'Deshabilitar' : 'Habilitar'}
                      className={warehouse.status === 'active' ? 'text-amber-600' : 'text-emerald-600'}
                    >
                      {warehouse.status === 'active' ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                    </Button>
                    {(currentUserRole === 'sistemas' || currentUserRole === 'sistema') && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(warehouse.id)}
                        title="Eliminar permanentemente"
                        className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="lg"
        title={currentWarehouse ? 'Editar Almacén' : 'Nuevo Almacén'}
        description="Ingresa los detalles de la ubicación física o sucursal."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="warehouse-form"
              variant="primary"
            >
              <ShieldCheck className="w-4 h-4" />
              Guardar Cambios
            </Button>
          </>
        }
      >
        <form id="warehouse-form" onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Código" required>
              <Input
                name="code"
                defaultValue={currentWarehouse?.code}
                placeholder="Ej. ALM-01"
                required
              />
            </FormField>

            <FormField label="Estado">
              <Select
                name="status"
                defaultValue={currentWarehouse?.status || 'active'}
              >
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </Select>
            </FormField>

            <FormField label="Nombre del Almacén" required className="col-span-2">
              <Input
                name="name"
                defaultValue={currentWarehouse?.name}
                placeholder="Ej. Almacén Principal"
                required
              />
            </FormField>

            <FormField label="Dirección Física" className="col-span-2">
              <Textarea
                name="address"
                defaultValue={currentWarehouse?.address || ''}
                placeholder="Dirección completa..."
                rows={3}
              />
            </FormField>
          </div>
        </form>
      </Modal>
    </div>
  );
}
