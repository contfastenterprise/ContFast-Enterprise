'use client';

import { useState, useEffect } from 'react';
import { FileText, Search, Plus, Edit2, Trash2, X, RefreshCw, Printer, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/ui/search-bar';

interface OrderLine {
  id?: string;
  productId?: string | null;
  modelo: string;
  medida: string;
  colorAcabado: string;
  linea: string;
  numHuecosCerradura: string;
  cantidad: number;
  observaciones: string;
}

interface Supplier {
  id: string;
  name: string;
  rnc?: string;
}

interface SupplierOrder {
  id: string;
  orderNumber: string;
  status: string;
  orderDate: string;
  observations?: string;
  supplierName: string;
  supplierRnc?: string;
  userName: string;
}

export default function SupplierOrdersPage() {
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form State
  const [supplierId, setSupplierId] = useState('');
  const [observations, setObservations] = useState('');
  const [generalConditions, setGeneralConditions] = useState(
    'Este pedido está sujeto a disponibilidad y tiempos de producción.\nConfirmar cantidades y fecha de entrega.\nCualquier cambio debe ser notificado por escrito.'
  );
  const [lines, setLines] = useState<OrderLine[]>([
    { modelo: 'Deluxe', medida: '105 x 210', colorAcabado: 'Blanco', linea: 'Deluxe', numHuecosCerradura: '2H', cantidad: 1, observaciones: '' }
  ]);

  useEffect(() => {
    fetchOrders();
    fetchSuppliers();
  }, [search, statusFilter]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const url = `/api/v1/supplier-orders?limit=50${statusFilter ? `&status=${statusFilter}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setOrders(data.data || []);
      }
    } catch (error) {
      toast.error('Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/v1/suppliers?limit=1000');
      const data = await res.json();
      if (data.success) {
        setSuppliers(data.data || []);
      }
    } catch (error) {
      console.error('Error al cargar suplidores:', error);
    }
  };

  const openNewModal = () => {
    setEditId(null);
    setSupplierId('');
    setObservations('');
    setGeneralConditions(
      'Este pedido está sujeto a disponibilidad y tiempos de producción.\nConfirmar cantidades y fecha de entrega.\nCualquier cambio debe ser notificado por escrito.'
    );
    setLines([
      { modelo: 'Deluxe', medida: '105 x 210', colorAcabado: 'Blanco', linea: 'Deluxe', numHuecosCerradura: '2H', cantidad: 10, observaciones: 'Mandar a ser' }
    ]);
    setShowModal(true);
  };

  const openEditModal = async (id: string) => {
    try {
      const toastId = toast.loading('Cargando detalles del pedido...');
      const res = await fetch(`/api/v1/supplier-orders/${id}`);
      const data = await res.json();
      toast.dismiss(toastId);

      if (data.success) {
        const order = data.data;
        setEditId(order.id);
        setSupplierId(order.supplierId);
        setObservations(order.observations || '');
        setGeneralConditions(order.generalConditions || '');
        setLines(order.lines || []);
        setShowModal(true);
      } else {
        toast.error('No se pudo cargar el pedido');
      }
    } catch (error) {
      toast.error('Error de red al cargar detalles');
    }
  };

  const handlePrint = (id: string) => {
    window.open(`/api/v1/supplier-orders/${id}/pdf`, '_blank');
  };

  const handleAddLine = () => {
    setLines(prev => [
      ...prev,
      { modelo: '', medida: '', colorAcabado: '', linea: '', numHuecosCerradura: '1H', cantidad: 1, observaciones: '' }
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) {
      toast.warning('Debe tener al menos una línea en el pedido');
      return;
    }
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof OrderLine, value: any) => {
    setLines(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleDelete = async (id: string, num: string) => {
    if (!confirm(`¿Estás seguro que deseas eliminar/cancelar el pedido ${num}?`)) return;

    try {
      const res = await fetch(`/api/v1/supplier-orders/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Pedido eliminado/cancelado');
        fetchOrders();
      } else {
        toast.error(data.error?.message || 'Error al eliminar');
      }
    } catch (error) {
      toast.error('Error de red al eliminar');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      toast.error('Seleccione un suplidor');
      return;
    }

    setSubmitting(true);
    try {
      const url = editId ? `/api/v1/supplier-orders/${editId}` : '/api/v1/supplier-orders';
      const method = editId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          observations,
          generalConditions,
          lines: lines.map(l => ({ ...l, cantidad: Number(l.cantidad) }))
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(editId ? 'Pedido actualizado exitosamente' : 'Pedido registrado exitosamente');
        setShowModal(false);
        fetchOrders();
      } else {
        toast.error(data.error?.message || 'Error al procesar pedido');
      }
    } catch (error) {
      toast.error('Error de red al enviar formulario');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredOrders = orders.filter(
    o =>
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.supplierName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            Pedidos a Suplidores
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestión y control de pedidos de producción y puertas.
          </p>
        </div>
        <Button onClick={openNewModal} size="lg" className="shadow-lg hover:shadow-xl transition-all gap-2">
          <Plus className="h-5 w-5" /> Nuevo Pedido
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por número de pedido o suplidor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border-0 rounded-xl focus:ring-2 focus:ring-primary text-sm outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>
        <div className="w-full md:w-48">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border-0 rounded-xl focus:ring-2 focus:ring-primary text-sm outline-none text-slate-900 dark:text-white"
          >
            <option value="">Todos los Estados</option>
            <option value="pending">Pendiente</option>
            <option value="sent">Enviado</option>
            <option value="completed">Completado</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>
        <Button variant="ghost" size="icon" onClick={() => { setSearch(''); setStatusFilter(''); }} className="shrink-0">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Orders Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-500">Cargando pedidos...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-16 text-center text-slate-500">No se encontraron pedidos.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 text-xs font-semibold uppercase tracking-wider bg-slate-50/50 dark:bg-slate-950/50">
                  <th className="py-4 px-6">No. Pedido</th>
                  <th className="py-4 px-6">Fecha</th>
                  <th className="py-4 px-6">Suplidor / Proveedor</th>
                  <th className="py-4 px-6">Realizado Por</th>
                  <th className="py-4 px-6 text-center">Estado</th>
                  <th className="py-4 px-6 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                    <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">{order.orderNumber}</td>
                    <td className="py-4 px-6 text-slate-500">{new Date(order.orderDate).toLocaleDateString('es-DO')}</td>
                    <td className="py-4 px-6 font-medium text-slate-800 dark:text-slate-200">
                      <div>{order.supplierName}</div>
                      {order.supplierRnc && <div className="text-xs font-mono text-slate-400 mt-0.5">RNC: {order.supplierRnc}</div>}
                    </td>
                    <td className="py-4 px-6 text-slate-600 dark:text-slate-400">{order.userName}</td>
                    <td className="py-4 px-6 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold ${
                        order.status === 'completed' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' :
                        order.status === 'sent' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400' :
                        order.status === 'cancelled' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400' :
                        'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                      }`}>
                        {order.status === 'completed' ? 'Completado' :
                         order.status === 'sent' ? 'Enviado' :
                         order.status === 'cancelled' ? 'Cancelado' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <Button variant="outline" size="icon" onClick={() => handlePrint(order.id)} className="h-8 w-8 text-primary border-primary/20 bg-primary/5 hover:bg-primary/10">
                        <Printer className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => openEditModal(order.id)} className="h-8 w-8">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => handleDelete(order.id, order.orderNumber)} className="h-8 w-8 text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Creation / Edition Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="h-6 w-6 text-primary" />
                  {editId ? `Editar Pedido: ${editId.substring(0, 8)}` : 'Nuevo Pedido a Suplidor'}
                </h2>
                <Button variant="ghost" size="icon" onClick={() => setShowModal(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Suplidor / Proveedor</label>
                    <select
                      value={supplierId}
                      onChange={e => setSupplierId(e.target.value)}
                      required
                      className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-900 dark:text-white"
                    >
                      <option value="">Seleccione un suplidor...</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name} {s.rnc ? `(${s.rnc})` : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Door specs lines */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Detalle del Pedido (Puertas)</h3>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddLine} className="gap-1.5">
                      <Plus className="h-4 w-4" /> Agregar Línea
                    </Button>
                  </div>

                  <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-950/20">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-950/80 text-left text-xs font-bold text-slate-500 uppercase">
                          <th className="p-3 w-[15%]">Modelo</th>
                          <th className="p-3 w-[12%]">Medida (cm)</th>
                          <th className="p-3 w-[15%]">Color/Acabado</th>
                          <th className="p-3 w-[12%]">Línea</th>
                          <th className="p-3 w-[12%]">Huecos Cerradura</th>
                          <th className="p-3 w-[10%] text-center">Cant.</th>
                          <th className="p-3 w-[20%]">Observaciones</th>
                          <th className="p-3 w-[4%] text-center"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, index) => (
                          <tr key={index} className="border-t border-slate-100 dark:border-slate-800 text-sm">
                            <td className="p-2">
                              <input
                                type="text"
                                value={line.modelo}
                                onChange={e => handleLineChange(index, 'modelo', e.target.value)}
                                placeholder="Deluxe"
                                required
                                className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none text-slate-900 dark:text-white"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={line.medida}
                                onChange={e => handleLineChange(index, 'medida', e.target.value)}
                                placeholder="105 x 210"
                                required
                                className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none text-slate-900 dark:text-white"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={line.colorAcabado}
                                onChange={e => handleLineChange(index, 'colorAcabado', e.target.value)}
                                placeholder="Blanco"
                                required
                                className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none text-slate-900 dark:text-white"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={line.linea}
                                onChange={e => handleLineChange(index, 'linea', e.target.value)}
                                placeholder="Deluxe"
                                className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none text-slate-900 dark:text-white"
                              />
                            </td>
                            <td className="p-2">
                              <select
                                value={line.numHuecosCerradura}
                                onChange={e => handleLineChange(index, 'numHuecosCerradura', e.target.value)}
                                className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none text-slate-900 dark:text-white"
                              >
                                <option value="2H">2H (2 huecos)</option>
                                <option value="1H">1H (1 hueco)</option>
                                <option value="Ninguno">Ninguno</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                value={line.cantidad}
                                min="1"
                                onChange={e => handleLineChange(index, 'cantidad', parseInt(e.target.value) || 1)}
                                required
                                className="w-full text-center px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none text-slate-900 dark:text-white font-bold"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={line.observaciones}
                                onChange={e => handleLineChange(index, 'observaciones', e.target.value)}
                                placeholder="Notas específicas"
                                className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none text-slate-900 dark:text-white"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveLine(index)} className="h-8 w-8 text-rose-500 hover:bg-rose-50">
                                <X className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Bottom details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Observaciones Generales</label>
                    <textarea
                      value={observations}
                      onChange={e => setObservations(e.target.value)}
                      rows={4}
                      placeholder="Indique especificaciones adicionales o detalles..."
                      className="px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-900 dark:text-white resize-none"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Condiciones Generales</label>
                    <textarea
                      value={generalConditions}
                      onChange={e => setGeneralConditions(e.target.value)}
                      rows={4}
                      placeholder="Términos y condiciones del pedido..."
                      className="px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-900 dark:text-white resize-none"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Guardando...' : 'Guardar Pedido'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
