'use client';

import { useState, useEffect } from 'react';
import { FileText, Search, Plus, Edit2, Trash2, X, RefreshCw, Printer, AlertTriangle, Filter, Mail, Copy, CheckCircle2, History } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface OrderLine {
  id?: string;
  productId: string;
  productName: string;
  productSku: string;
  barcode: string;
  unitOfMeasure: string;
  quantityRequested: number;
  quantityReceived: number;
  observations: string;
}

interface Supplier {
  id: string;
  name: string;
  rnc?: string;
  email?: string;
}

interface Warehouse {
  id: string;
  name: string;
}

interface OrderLog {
  id: string;
  action: string;
  changeDetails: string;
  createdAt: string;
  userName: string;
}

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  status: 'Draft' | 'Sent' | 'Partial' | 'Received' | 'Cancelled';
  orderDate: string;
  expectedDate?: string | null;
  observations?: string;
  supplierName: string;
  supplierRnc?: string;
  supplierEmail?: string;
  warehouseName: string;
  userName: string;
  totalItemsCount: number;
  lines: OrderLine[];
  logs: OrderLog[];
}

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchNumber, setSearchNumber] = useState('');
  const [searchSupplier, setSearchSupplier] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals State
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  
  const [submitting, setSubmitting] = useState(false);
  
  // Selected / Active Order
  const [activeOrder, setActiveOrder] = useState<PurchaseOrder | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  // Form State
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [observations, setObservations] = useState('');
  const [lines, setLines] = useState<OrderLine[]>([]);

  // Product Autocomplete State
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [searchedProducts, setSearchedProducts] = useState<any[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);

  // Reception State
  const [receptions, setReceptions] = useState<{ itemId: string; productName: string; pending: number; toReceive: number }[]>([]);

  useEffect(() => {
    fetchOrders();
    fetchSuppliers();
    fetchWarehouses();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const url = `/api/v1/supplier-orders?limit=1000`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setOrders(data.data || []);
      }
    } catch (error) {
      toast.error('Error al cargar los pedidos');
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

  const fetchWarehouses = async () => {
    try {
      const res = await fetch('/api/v1/warehouses');
      const data = await res.json();
      if (data.success) {
        setWarehouses(data.data || []);
      }
    } catch (error) {
      console.error('Error al cargar almacenes:', error);
    }
  };

  const searchProducts = async (term: string) => {
    if (!term || term.length < 2) {
      setSearchedProducts([]);
      return;
    }
    try {
      setSearchingProducts(true);
      const res = await fetch(`/api/v1/products?per_page=10&search=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (data.success) {
        setSearchedProducts(data.data || []);
      }
    } catch (error) {
      console.error('Error searching products:', error);
    } finally {
      setSearchingProducts(false);
    }
  };

  const openNewModal = () => {
    setEditId(null);
    setSupplierId('');
    setWarehouseId(warehouses[0]?.id || '');
    setExpectedDate('');
    setObservations('');
    setLines([]);
    setProductSearchTerm('');
    setSearchedProducts([]);
    setShowFormModal(true);
  };

  const openEditModal = async (id: string) => {
    try {
      const toastId = toast.loading('Cargando detalles del pedido...');
      const res = await fetch(`/api/v1/supplier-orders/${id}`);
      const data = await res.json();
      toast.dismiss(toastId);

      if (data.success) {
        const order = data.data;
        if (order.status !== 'Draft') {
          toast.error('Solo se pueden modificar pedidos en estado borrador (Draft).');
          return;
        }
        setEditId(order.id);
        setSupplierId(order.supplierId);
        setWarehouseId(order.warehouseId);
        setExpectedDate(order.expectedDate ? order.expectedDate.split('T')[0] : '');
        setObservations(order.observations || '');
        setLines(order.lines || []);
        setShowFormModal(true);
      } else {
        toast.error('No se pudo cargar el pedido');
      }
    } catch (error) {
      toast.error('Error de red al cargar detalles');
    }
  };

  const viewOrderDetails = async (id: string) => {
    try {
      const toastId = toast.loading('Cargando detalles del pedido...');
      const res = await fetch(`/api/v1/supplier-orders/${id}`);
      const data = await res.json();
      toast.dismiss(toastId);

      if (data.success) {
        setActiveOrder(data.data);
        setShowDetailModal(true);
      } else {
        toast.error('No se pudo cargar el pedido');
      }
    } catch (error) {
      toast.error('Error de red al cargar detalles');
    }
  };

  const handleSendOrder = async (id: string) => {
    if (!confirm('¿Desea marcar esta orden de pedido como Enviada al suplidor?')) return;
    try {
      const toastId = toast.loading('Actualizando estado...');
      const res = await fetch(`/api/v1/supplier-orders/${id}/send`, { method: 'POST' });
      const data = await res.json();
      toast.dismiss(toastId);

      if (data.success) {
        toast.success('Pedido marcado como Enviado');
        setShowDetailModal(false);
        fetchOrders();
      } else {
        toast.error(data.error?.message || 'Error al enviar pedido');
      }
    } catch (error) {
      toast.error('Error de red');
    }
  };

  const handleDuplicate = async (id: string) => {
    if (!confirm('¿Desea duplicar este pedido a un nuevo estado borrador?')) return;
    try {
      const toastId = toast.loading('Duplicando pedido...');
      const res = await fetch(`/api/v1/supplier-orders/${id}/duplicate`, { method: 'POST' });
      const data = await res.json();
      toast.dismiss(toastId);

      if (data.success) {
        toast.success(`Pedido duplicado: ${data.data.orderNumber}`);
        setShowDetailModal(false);
        fetchOrders();
      } else {
        toast.error(data.error?.message || 'Error al duplicar');
      }
    } catch (error) {
      toast.error('Error de red');
    }
  };

  const handleCancelOrder = async (id: string, num: string) => {
    if (!confirm(`¿Está seguro que desea cancelar el pedido ${num}? Esta acción no se puede deshacer.`)) return;
    try {
      const toastId = toast.loading('Cancelando pedido...');
      const res = await fetch(`/api/v1/supplier-orders/${id}/send`, { // Wait, canceling is via DELETE on resource or cancel route. Let's do DELETE
        method: 'DELETE'
      });
      const data = await res.json();
      toast.dismiss(toastId);

      if (data.success) {
        toast.success('Pedido cancelado');
        setShowDetailModal(false);
        fetchOrders();
      } else {
        toast.error(data.error?.message || 'Error al cancelar');
      }
    } catch (error) {
      toast.error('Error de red');
    }
  };

  const handleSendEmail = async (id: string) => {
    try {
      const toastId = toast.loading('Enviando pedido por correo al suplidor...');
      const res = await fetch(`/api/v1/supplier-orders/${id}/email`, { method: 'POST' });
      const data = await res.json();
      toast.dismiss(toastId);

      if (data.success) {
        toast.success('Pedido enviado por correo electrónico exitosamente');
      } else {
        toast.error(data.error?.message || 'Error al enviar correo electrónico');
      }
    } catch (error) {
      toast.error('Error de red');
    }
  };

  const openReceiveModal = (order: PurchaseOrder) => {
    const linesToReceive = order.lines.map(line => ({
      itemId: line.id!,
      productName: line.productName,
      pending: line.quantityRequested - line.quantityReceived,
      toReceive: 0
    })).filter(l => l.pending > 0);

    if (linesToReceive.length === 0) {
      toast.warning('Todos los artículos de este pedido ya han sido recibidos.');
      return;
    }

    setReceptions(linesToReceive);
    setShowReceiveModal(true);
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeReceptions = receptions.filter(r => r.toReceive > 0);
    if (activeReceptions.length === 0) {
      toast.error('Debe especificar al menos una cantidad a recibir mayor que cero.');
      return;
    }

    // Validation
    for (const r of activeReceptions) {
      if (r.toReceive > r.pending) {
        toast.error(`La cantidad a recibir de "${r.productName}" no puede ser mayor que la cantidad pendiente (${r.pending}).`);
        return;
      }
    }

    try {
      setSubmitting(true);
      const toastId = toast.loading('Registrando recepción y actualizando inventario...');
      const res = await fetch(`/api/v1/supplier-orders/${activeOrder?.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receptions: activeReceptions.map(r => ({
            itemId: r.itemId,
            quantityToReceive: r.toReceive
          }))
        })
      });
      const data = await res.json();
      toast.dismiss(toastId);

      if (data.success) {
        toast.success('Recepción registrada exitosamente. Inventario actualizado.');
        setShowReceiveModal(false);
        setShowDetailModal(false);
        fetchOrders();
      } else {
        toast.error(data.error?.message || 'Error al registrar recepción');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = (id: string) => {
    window.open(`/api/v1/supplier-orders/${id}/pdf`, '_blank');
  };

  const handlePrintAll = () => {
    const queryParams = new URLSearchParams();
    if (statusFilter) queryParams.append('status', statusFilter);
    window.open(`/api/v1/supplier-orders/report?${queryParams.toString()}`, '_blank');
  };

  const handleAddLinePlaceholder = () => {
    setActiveLineIndex(lines.length);
    setProductSearchTerm('');
    setSearchedProducts([]);
  };

  const handleSelectProduct = (product: any) => {
    // Check if product already exists
    const duplicate = lines.some(l => l.productId === product.id);
    if (duplicate) {
      toast.error('Este producto ya ha sido agregado al pedido.');
      return;
    }

    const newLine: OrderLine = {
      productId: product.id,
      productName: product.name,
      productSku: product.sku || '',
      barcode: product.barcode || '',
      unitOfMeasure: product.unitOfMeasure || 'unidad',
      quantityRequested: 1,
      quantityReceived: 0,
      observations: ''
    };

    setLines(prev => [...prev, newLine]);
    setActiveLineIndex(null);
    setProductSearchTerm('');
    setSearchedProducts([]);
  };

  const handleRemoveLine = (index: number) => {
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  const handleLineQuantityChange = (index: number, val: number) => {
    if (val <= 0) return;
    setLines(prev => {
      const copy = [...prev];
      copy[index].quantityRequested = val;
      return copy;
    });
  };

  const handleLineObservationsChange = (index: number, val: string) => {
    setLines(prev => {
      const copy = [...prev];
      copy[index].observations = val;
      return copy;
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      toast.error('Debe seleccionar un suplidor');
      return;
    }
    if (!warehouseId) {
      toast.error('Debe seleccionar un almacén');
      return;
    }
    if (lines.length === 0) {
      toast.error('Debe agregar al menos un producto al pedido');
      return;
    }

    try {
      setSubmitting(true);
      const url = editId ? `/api/v1/supplier-orders/${editId}` : '/api/v1/supplier-orders';
      const method = editId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          warehouseId,
          expectedDate: expectedDate || null,
          observations,
          lines: lines.map(l => ({
            productId: l.productId,
            quantityRequested: l.quantityRequested,
            observations: l.observations
          }))
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success(editId ? 'Pedido actualizado exitosamente' : 'Pedido creado exitosamente');
        setShowFormModal(false);
        fetchOrders();
      } else {
        toast.error(data.error?.message || 'Error al procesar el pedido');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadges = {
    Draft: 'bg-slate-100 text-slate-700 border-slate-200',
    Sent: 'bg-blue-50 text-blue-700 border-blue-200',
    Partial: 'bg-amber-50 text-amber-700 border-amber-200',
    Received: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  const statusLabels = {
    Draft: 'Borrador',
    Sent: 'Enviado',
    Partial: 'Parcial',
    Received: 'Recibido',
    Cancelled: 'Cancelado',
  };

  // Filter logic on client side
  const filteredOrders = orders.filter(order => {
    const numMatch = order.orderNumber.toLowerCase().includes(searchNumber.toLowerCase());
    const supplierMatch = order.supplierName.toLowerCase().includes(searchSupplier.toLowerCase());
    const statusMatch = !statusFilter || order.status === statusFilter;
    
    let dateMatch = true;
    if (startDate && endDate) {
      const orderDateStr = order.orderDate.split('T')[0];
      dateMatch = orderDateStr >= startDate && orderDateStr <= endDate;
    }

    return numMatch && supplierMatch && statusMatch && dateMatch;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <FileText className="h-8 w-8 text-[#005E63]" />
            Pedidos a Suplidores
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestión logística de pedidos de mercancías a proveedores sin facturación.
          </p>
        </div>
        <button
          onClick={openNewModal}
          className="w-full md:w-auto bg-[#005E63] text-white px-6 py-2.5 rounded-lg text-xs font-bold hover:bg-[#004d51] transition-colors h-[38px] flex items-center justify-center gap-2 border border-[#005E63] shadow-md cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          NUEVO PEDIDO
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap gap-4 items-end bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex-1 min-w-[180px] w-full">
          <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5">No. Pedido</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar número"
              value={searchNumber}
              onChange={e => setSearchNumber(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 placeholder:text-slate-400 h-[38px]"
            />
          </div>
        </div>

        <div className="flex-1 min-w-[180px] w-full">
          <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5">Suplidor</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar suplidor"
              value={searchSupplier}
              onChange={e => setSearchSupplier(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 placeholder:text-slate-400 h-[38px]"
            />
          </div>
        </div>

        <div className="w-full md:w-36">
          <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5">Estado</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 h-[38px]"
          >
            <option value="">Todos</option>
            <option value="Draft">Borrador</option>
            <option value="Sent">Enviado</option>
            <option value="Partial">Parcial</option>
            <option value="Received">Recibido</option>
            <option value="Cancelled">Cancelado</option>
          </select>
        </div>

        <div className="w-full md:w-36">
          <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5">Desde</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 h-[38px]"
          />
        </div>

        <div className="w-full md:w-36">
          <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5">Hasta</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 h-[38px]"
          />
        </div>

        <button
          onClick={fetchOrders}
          className="w-full md:w-auto bg-slate-100 text-[#003366] px-6 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors h-[38px] flex items-center justify-center gap-2 border border-slate-300 cursor-pointer"
        >
          <Filter className="h-4 w-4" />
          FILTRAR
        </button>

        {filteredOrders.length > 0 && (
          <button
            type="button"
            onClick={handlePrintAll}
            className="w-full md:w-auto bg-[#005E63] text-white px-6 py-2 rounded-lg text-xs font-bold hover:bg-[#004d51] transition-colors h-[38px] flex items-center justify-center gap-2 cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            REPORTE PDF
          </button>
        )}
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-16 text-center">
            <div className="flex flex-col items-center justify-center gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" />
              <span className="text-on-surface-variant/80 text-sm font-medium">Cargando pedidos logísticos...</span>
            </div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-16 text-center text-slate-500 text-sm">No se encontraron pedidos de mercancía.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">Fecha</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">No. Pedido</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Suplidor / Proveedor</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest text-center">Total Artículos</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Usuario</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest text-center">Estado</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20/80">
                {filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-[#C5A059]/5 transition-colors group">
                    <td className="px-4 py-2 align-middle">
                      <span className="font-mono text-slate-700 whitespace-nowrap">
                        {new Date(order.orderDate).toLocaleDateString('es-DO')}
                      </span>
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <span className="font-mono font-bold text-[#b08c4a] group-hover:text-[#9a7a3e] transition-colors">
                        {order.orderNumber}
                      </span>
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-[#003366] block truncate max-w-[200px]">
                          {order.supplierName}
                        </span>
                        {order.supplierRnc && (
                          <span className="text-[10px] text-on-surface-variant/70 font-mono">
                            RNC: {order.supplierRnc}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 align-middle text-center font-bold text-slate-800">
                      {order.totalItemsCount}
                    </td>
                    <td className="px-4 py-2 align-middle text-slate-600">
                      {order.userName}
                    </td>
                    <td className="px-4 py-2 align-middle text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border whitespace-nowrap ${statusBadges[order.status]}`}>
                        {statusLabels[order.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 align-middle text-right space-x-2 whitespace-nowrap">
                      <button onClick={() => viewOrderDetails(order.id)} className="p-1 text-xs text-slate-500 hover:text-[#005E63] cursor-pointer font-bold" title="Ver Detalles">
                        Ver
                      </button>
                      <button onClick={() => handlePrint(order.id)} className="p-1 text-xs text-slate-500 hover:text-[#005E63] cursor-pointer" title="Imprimir PDF">
                        <Printer className="h-4 w-4 inline" />
                      </button>
                      {order.status === 'Draft' && (
                        <button onClick={() => openEditModal(order.id)} className="p-1 text-xs text-slate-500 hover:text-[#C5A059] cursor-pointer" title="Editar">
                          <Edit2 className="h-4 w-4 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail / Action Modal */}
      <AnimatePresence>
        {showDetailModal && activeOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-black text-[#003366]">
                    Pedido: {activeOrder.orderNumber}
                  </h2>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${statusBadges[activeOrder.status]}`}>
                    {statusLabels[activeOrder.status]}
                  </span>
                </div>
                <button onClick={() => setShowDetailModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
                {/* Details grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div>
                    <span className="block text-[10px] font-bold text-slate-500 uppercase">Fecha de Creación</span>
                    <span className="font-semibold">{new Date(activeOrder.orderDate).toLocaleString('es-DO')}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-500 uppercase">Estimada de Entrega</span>
                    <span className="font-semibold">{activeOrder.expectedDate ? new Date(activeOrder.expectedDate).toLocaleDateString('es-DO') : 'No especificada'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-500 uppercase">Almacén de Recepción</span>
                    <span className="font-semibold text-[#003366]">{activeOrder.warehouseName}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-500 uppercase">Suplidor / RNC</span>
                    <span className="font-semibold block">{activeOrder.supplierName}</span>
                    {activeOrder.supplierRnc && <span className="font-mono text-[10px] text-slate-500">RNC: {activeOrder.supplierRnc}</span>}
                  </div>
                </div>

                {/* Items Table */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-[#003366] uppercase tracking-wider">Productos Solicitados</h3>
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                          <th className="p-3">SKU</th>
                          <th className="p-3">Nombre</th>
                          <th className="p-3">Marca</th>
                          <th className="p-3">Modelo</th>
                          <th className="p-3 text-center">UM</th>
                          <th className="p-3 text-center">Cant. Solicitada</th>
                          <th className="p-3 text-center">Cant. Recibida</th>
                          <th className="p-3 text-center text-amber-700">Pendiente</th>
                          <th className="p-3">Observaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeOrder.lines.map((line, idx) => {
                          const pending = line.quantityRequested - line.quantityReceived;
                          return (
                            <tr key={idx} className="border-t border-slate-200">
                              <td className="p-3 font-mono text-slate-600">{line.productSku || '-'}</td>
                              <td className="p-3 font-semibold text-[#003366]">{line.productName}</td>
                              <td className="p-3 text-slate-500">N/A</td>
                              <td className="p-3 text-slate-500">N/A</td>
                              <td className="p-3 text-center">{line.unitOfMeasure}</td>
                              <td className="p-3 text-center font-bold">{line.quantityRequested}</td>
                              <td className="p-3 text-center text-emerald-600 font-bold">{line.quantityReceived}</td>
                              <td className="p-3 text-center text-amber-700 font-bold bg-amber-50/50">{pending}</td>
                              <td className="p-3 text-slate-500">{line.observations || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* History Logs */}
                {activeOrder.logs && activeOrder.logs.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-[#003366] uppercase tracking-wider flex items-center gap-1.5">
                      <History className="h-4 w-4 text-[#C5A059]" /> Historial de Acciones
                    </h3>
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3 max-h-[160px] overflow-y-auto">
                      {activeOrder.logs.map(log => (
                        <div key={log.id} className="flex flex-col gap-0.5 border-l-2 border-slate-350 pl-3">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="font-bold text-slate-700">{log.action}</span>
                            <span className="text-slate-400">{new Date(log.createdAt).toLocaleString('es-DO')}</span>
                          </div>
                          <p className="text-[11px] text-slate-600 font-mono whitespace-pre-wrap">{log.changeDetails}</p>
                          <span className="text-[9px] text-slate-400 font-semibold">Realizado por: {log.userName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* General Observations */}
                {activeOrder.observations && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Observaciones Generales</span>
                    <p className="whitespace-pre-wrap font-mono text-slate-700">{activeOrder.observations}</p>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="flex flex-wrap justify-between items-center p-6 border-t border-slate-100 bg-slate-50/50 gap-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePrint(activeOrder.id)}
                    className="bg-slate-100 text-[#003366] border border-slate-300 px-4 py-2 rounded-lg font-bold hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="h-4 w-4" /> Imprimir PDF
                  </button>
                  {activeOrder.supplierEmail && (
                    <button
                      onClick={() => handleSendEmail(activeOrder.id)}
                      className="bg-slate-100 text-[#003366] border border-slate-300 px-4 py-2 rounded-lg font-bold hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Mail className="h-4 w-4" /> Enviar por Correo
                    </button>
                  )}
                  <button
                    onClick={() => handleDuplicate(activeOrder.id)}
                    className="bg-slate-100 text-[#003366] border border-slate-300 px-4 py-2 rounded-lg font-bold hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="h-4 w-4" /> Duplicar
                  </button>
                </div>

                <div className="flex gap-2">
                  {activeOrder.status === 'Draft' && (
                    <button
                      onClick={() => handleSendOrder(activeOrder.id)}
                      className="bg-[#005E63] text-white px-5 py-2 rounded-lg font-bold hover:bg-[#004d51] flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Enviar al Suplidor
                    </button>
                  )}
                  {(activeOrder.status === 'Sent' || activeOrder.status === 'Partial') && (
                    <button
                      onClick={() => openReceiveModal(activeOrder)}
                      className="bg-emerald-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" /> Registrar Recepción
                    </button>
                  )}
                  {activeOrder.status !== 'Received' && activeOrder.status !== 'Cancelled' && (
                    <button
                      onClick={() => handleCancelOrder(activeOrder.id, activeOrder.orderNumber)}
                      className="bg-rose-50 text-rose-700 border border-rose-200 px-4 py-2 rounded-lg font-bold hover:bg-rose-100 cursor-pointer"
                    >
                      Cancelar Pedido
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Receive Goods Modal */}
      <AnimatePresence>
        {showReceiveModal && activeOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Header */}
              <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-lg font-black text-[#003366] flex items-center gap-2">
                  <Plus className="h-5 w-5 text-emerald-600" />
                  Registrar Recepción - {activeOrder.orderNumber}
                </h2>
                <button onClick={() => setShowReceiveModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleReceiveSubmit} className="p-6 space-y-6 text-xs">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-700" />
                  <div>
                    <span className="font-bold block">Aviso Importante</span>
                    El inventario físico del almacén se actualizará en este momento únicamente con las cantidades recibidas.
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-650 uppercase">
                        <th className="p-3 w-[50%]">Producto</th>
                        <th className="p-3 text-center w-[15%]">Pendiente</th>
                        <th className="p-3 text-center w-[35%]">Cantidad a Recibir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receptions.map((rec, index) => (
                        <tr key={rec.itemId} className="border-t border-slate-200">
                          <td className="p-3 font-semibold text-slate-800">{rec.productName}</td>
                          <td className="p-3 text-center font-bold text-amber-700">{rec.pending}</td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max={rec.pending}
                              value={rec.toReceive}
                              onChange={e => {
                                const val = Math.min(rec.pending, Math.max(0, parseInt(e.target.value) || 0));
                                setReceptions(prev => {
                                  const copy = [...prev];
                                  copy[index].toReceive = val;
                                  return copy;
                                });
                              }}
                              className="w-24 px-3 py-1.5 bg-white border border-slate-250 rounded-lg text-center outline-none text-slate-900 font-bold"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowReceiveModal(false)}
                    className="px-6 py-2 rounded-lg border border-slate-350 bg-white hover:bg-slate-50 text-slate-700 font-bold transition-colors cursor-pointer h-[38px] flex items-center justify-center"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors h-[38px] flex items-center justify-center cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? 'Registrando...' : 'Confirmar Recepción'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Creation / Edition Modal */}
      <AnimatePresence>
        {showFormModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-lg font-black text-[#003366] flex items-center gap-2">
                  <Plus className="h-5 w-5 text-[#005E63]" />
                  {editId ? 'Editar Pedido a Suplidor' : 'Nuevo Pedido a Suplidor'}
                </h2>
                <button onClick={() => setShowFormModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Supplier Select */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Suplidor / Proveedor</label>
                    <select
                      value={supplierId}
                      onChange={e => setSupplierId(e.target.value)}
                      required
                      className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none text-slate-900"
                    >
                      <option value="">Seleccione un suplidor...</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name} {s.rnc ? `(${s.rnc})` : ''}</option>
                      ))}
                    </select>
                  </div>

                  {/* Warehouse Select */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Almacén de Destino</label>
                    <select
                      value={warehouseId}
                      onChange={e => setWarehouseId(e.target.value)}
                      required
                      className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none text-slate-900"
                    >
                      <option value="">Seleccione un almacén...</option>
                      {warehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Expected Date */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Estimada de Entrega</label>
                    <input
                      type="date"
                      value={expectedDate}
                      onChange={e => setExpectedDate(e.target.value)}
                      className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-slate-900 h-[38px]"
                    />
                  </div>
                </div>

                {/* Items Form Table */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold text-[#003366] uppercase tracking-wider">Productos Solicitados</h3>
                    <button
                      type="button"
                      onClick={handleAddLinePlaceholder}
                      className="bg-slate-100 text-[#003366] border border-slate-350 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" /> Buscar y Agregar Producto
                    </button>
                  </div>

                  {/* Autocomplete Input */}
                  {activeLineIndex !== null && (
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3 relative">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Escriba Nombre, SKU o Código de Barra del Producto</label>
                        <button type="button" onClick={() => setActiveLineIndex(null)} className="text-slate-400 hover:text-slate-650">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Buscar producto..."
                          value={productSearchTerm}
                          onChange={e => {
                            setProductSearchTerm(e.target.value);
                            searchProducts(e.target.value);
                          }}
                          className="w-full pl-10 pr-4 py-2 bg-white border border-slate-250 rounded-lg text-xs outline-none text-slate-900 placeholder:text-slate-400 h-[38px]"
                          autoFocus
                        />
                      </div>

                      {/* Dropdown Results */}
                      {searchingProducts ? (
                        <div className="p-4 text-center text-slate-400 text-xs">Buscando productos...</div>
                      ) : searchedProducts.length > 0 ? (
                        <div className="bg-white border border-slate-200 rounded-lg max-h-[180px] overflow-y-auto divide-y divide-slate-100 shadow-lg">
                          {searchedProducts.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleSelectProduct(p)}
                              className="w-full text-left px-4 py-2.5 hover:bg-[#C5A059]/10 flex flex-col gap-0.5 text-xs"
                            >
                              <span className="font-semibold text-[#003366]">{p.name}</span>
                              <div className="flex justify-between text-[10px] text-slate-450 font-mono">
                                <span>SKU: {p.sku || 'N/A'}</span>
                                <span>CB: {p.barcode || 'N/A'}</span>
                                <span>UM: {p.unitOfMeasure || 'unidad'}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : productSearchTerm.length >= 2 && (
                        <div className="p-4 text-center text-slate-400 text-xs">No se encontraron productos.</div>
                      )}
                    </div>
                  )}

                  {/* Lines table view */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-650 uppercase">
                          <th className="p-3 w-[15%]">SKU</th>
                          <th className="p-3 w-[30%]">Producto</th>
                          <th className="p-3 w-[10%]">Marca</th>
                          <th className="p-3 w-[10%]">Modelo</th>
                          <th className="p-3 text-center w-[12%]">Cantidad</th>
                          <th className="p-3 w-[18%]">Observaciones específicas</th>
                          <th className="p-3 text-center w-[5%]"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-slate-400">
                              No hay productos agregados en el pedido. Busque y agregue uno arriba.
                            </td>
                          </tr>
                        ) : (
                          lines.map((line, idx) => (
                            <tr key={idx} className="border-t border-slate-200 text-xs">
                              <td className="p-3 font-mono text-slate-650">{line.productSku || '-'}</td>
                              <td className="p-3 font-semibold text-[#003366]">{line.productName}</td>
                              <td className="p-3 text-slate-500">N/A</td>
                              <td className="p-3 text-slate-500">N/A</td>
                              <td className="p-3 text-center">
                                <input
                                  type="number"
                                  min="1"
                                  value={line.quantityRequested}
                                  onChange={e => handleLineQuantityChange(idx, parseInt(e.target.value) || 1)}
                                  className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-center outline-none text-slate-900 font-bold"
                                />
                              </td>
                              <td className="p-3">
                                <input
                                  type="text"
                                  value={line.observations}
                                  placeholder="Notas del item"
                                  onChange={e => handleLineObservationsChange(idx, e.target.value)}
                                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg outline-none text-slate-900"
                                />
                              </td>
                              <td className="p-3 text-center">
                                <button type="button" onClick={() => handleRemoveLine(idx)} className="p-1 text-rose-500 hover:text-rose-600 cursor-pointer">
                                  <X className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Observations */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Observaciones Generales</label>
                  <textarea
                    value={observations}
                    onChange={e => setObservations(e.target.value)}
                    rows={4}
                    placeholder="Indique comentarios generales sobre la orden..."
                    className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg outline-none text-slate-900 resize-none font-mono"
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 bg-slate-50/50 p-6 -mx-6 -mb-6">
                  <button
                    type="button"
                    onClick={() => setShowFormModal(false)}
                    className="px-6 py-2 rounded-lg border border-slate-350 bg-white hover:bg-slate-50 text-slate-700 font-bold transition-colors cursor-pointer h-[38px] flex items-center justify-center"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-[#005E63] text-white px-6 py-2 rounded-lg font-bold hover:bg-[#004d51] transition-colors h-[38px] flex items-center justify-center cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? 'Guardando...' : 'Guardar Pedido'}
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
