'use client';

import { useState, useEffect, useCallback } from 'react';
import { Eye, FileText, Search, Plus, Pencil, Trash2, X, RefreshCw, Printer, AlertTriangle, Filter, Mail, Copy, CheckCircle2, History } from 'lucide-react';
import { PestanasDeRegistro, PanelDeRegistro } from '@/components/ui/pestanas-de-registro';
//  Lote 252: `m` dentro de `LazyMotion` y no `motion` (aviso de React Doctor).
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ErrorDeCarga, motivoDeCarga } from '@/components/ui/estado-carga';
import { useConfirm } from '@/providers/confirm-provider';
import { formatDateDisplay, formatDateTimeDisplay } from '@/utils/fechasLocales';
import { leerRespuesta } from '@/utils/leerRespuesta';
import { Button, IconButton } from '@/components/ui/button';
import { CabeceraDePagina } from '@/components/ui/cabecera-de-pagina';

interface OrderLine {
  id?: string;
  productId: string;
  productName: string;
  productSku: string;
  barcode: string;
  unitOfMeasure: string;
  brand?: string;
  model?: string;
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
  /** Los dos los trae el detalle (`GET [id]`); editar un borrador los necesita. */
  supplierId: string;
  warehouseId: string;
  supplierName: string;
  supplierRnc?: string;
  supplierEmail?: string;
  warehouseName: string;
  userName: string;
  totalItemsCount: number;
  lines: OrderLine[];
  logs: OrderLog[];
}

// Fuera del componente (lote 252): no dependen de nada suyo y no hace falta rehacerlos en cada pintada.
const statusBadges: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-700 border-slate-200',
  Sent: 'bg-blue-50 text-blue-700 border-blue-200',
  Partial: 'bg-amber-50 text-amber-700 border-amber-200',
  Received: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};

const statusLabels: Record<string, string> = {
  Draft: 'Borrador',
  Sent: 'Enviado',
  Partial: 'Parcial',
  Received: 'Recibido',
  Cancelled: 'Cancelado',
};

const handlePrint = (id: string) => {
  window.open(`/api/v1/supplier-orders/${id}/pdf`, '_blank');
};

const handleSendEmail = async (id: string) => {
  try {
    const toastId = toast.loading('Enviando pedido por correo al suplidor...');
    const res = await fetch(`/api/v1/supplier-orders/${id}/email`, { method: 'POST' });
    const leido = await leerRespuesta(res);
    toast.dismiss(toastId);

    if (leido.bien) {
      toast.success('Pedido enviado por correo electrónico exitosamente');
    } else {
      toast.error(leido.mensaje || 'Error al enviar correo electrónico');
    }
  } catch (error) {
    toast.error('Error de red');
  }
};

/** Cambia un campo de una linea del pedido SIN tocar el objeto de antes (lote 252: se mutaba dentro del actualizador). */
const conCampo = <T,>(lista: T[], index: number, cambio: Partial<T>): T[] =>
  lista.map((x, i) => (i === index ? { ...x, ...cambio } : x));

export default function PurchaseOrdersPage() {
  const h = usePedidos();
  const { showFormModal, setShowFormModal, editId, openNewModal } = h;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <CabeceraDePagina
        titulo="Pedidos a Suplidores"
        descripcion="Gestión logística de pedidos de mercancías a proveedores sin facturación."
        icono={<FileText />}
        acciones={
          /* Lote 250: en la cabecera, SOLO las pestanas (como en Compras). */
          <PestanasDeRegistro
            enFormulario={showFormModal}
            lista="Pedidos"
            editando={!!editId}
            alVerLista={() => setShowFormModal(false)}
            alRegistrar={openNewModal}
          />
        }
      />

      {!showFormModal && (<>
      <FiltrosDePedidos h={h} />
      <TablaDePedidos h={h} />
      </>)}

      <FormularioDePedido h={h} />
      <VentanasDePedido h={h} />
    </div>
  );
}

/** El estado y las acciones de la pagina, movidos TAL CUAL desde el componente. */
function usePedidos() {
  const confirm = useConfirm();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  // P2-37: el fallo de carga NO se limpia solo. Mientras este puesto, la lista
  // enseña el error en vez de su mensaje de vacio.
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

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

  // Form State -- un solo objeto (lote 252); los nombres de siempre se conservan.
  const [form, setForm] = useState<{ supplierId: string; warehouseId: string; expectedDate: string; observations: string; lines: OrderLine[] }>(
    { supplierId: '', warehouseId: '', expectedDate: '', observations: '', lines: [] });
  const { supplierId, warehouseId, expectedDate, observations, lines } = form;
  const setSupplierId = (v: string) => setForm((x) => ({ ...x, supplierId: v }));
  const setWarehouseId = (v: string) => setForm((x) => ({ ...x, warehouseId: v }));
  const setExpectedDate = (v: string) => setForm((x) => ({ ...x, expectedDate: v }));
  const setObservations = (v: string) => setForm((x) => ({ ...x, observations: v }));
  const setLines = (u: OrderLine[] | ((prev: OrderLine[]) => OrderLine[])) =>
    setForm((x) => ({ ...x, lines: typeof u === 'function' ? u(x.lines) : u }));

  // Product Autocomplete State
  const [busqueda, setBusqueda] = useState<{ termino: string; resultados: any[] }>({ termino: '', resultados: [] });
  const productSearchTerm = busqueda.termino;
  const searchedProducts = busqueda.resultados;
  const setProductSearchTerm = (v: string) => setBusqueda((b) => ({ ...b, termino: v }));
  const setSearchedProducts = (v: any[]) => setBusqueda((b) => ({ ...b, resultados: v }));
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);

  // Reception State
  const [receptions, setReceptions] = useState<{ itemId: string; productName: string; pending: number; toReceive: number }[]>([]);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setErrorCarga(null);
      const url = `/api/v1/supplier-orders?limit=1000`;
      const leido = await leerRespuesta<{ data: PurchaseOrder[] }>(await fetch(url));
      if (leido.bien) {
        setOrders(leido.cuerpo.data || []);
      } else {
        setOrders([]);
        setErrorCarga(motivoDeCarga(null, leido.mensaje));
      }
    } catch (error) {
      setOrders([]);
      setErrorCarga(motivoDeCarga(error));
      toast.error('Error al cargar los pedidos');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try {
      const leido = await leerRespuesta<{ data: Supplier[] }>(await fetch('/api/v1/suppliers?limit=1000'));
      if (leido.bien) setSuppliers(leido.cuerpo.data || []);
    } catch (error) {
      console.error('Error al cargar suplidores:', error);
    }
  }, []);

  const fetchWarehouses = useCallback(async () => {
    try {
      const leido = await leerRespuesta<{ data: Warehouse[] }>(await fetch('/api/v1/warehouses'));
      if (leido.bien) setWarehouses(leido.cuerpo.data || []);
    } catch (error) {
      console.error('Error al cargar almacenes:', error);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchSuppliers();
    fetchWarehouses();
  }, [fetchOrders, fetchSuppliers, fetchWarehouses]);

  const searchProducts = async (term: string) => {
    if (!term || term.length < 2) {
      setSearchedProducts([]);
      return;
    }
    try {
      setSearchingProducts(true);
      const res = await fetch(`/api/v1/products?per_page=10&search=${encodeURIComponent(term)}`);
      const leido = await leerRespuesta<{ data: any[] }>(res);
      if (leido.bien) setSearchedProducts(leido.cuerpo.data || []);
    } catch (error) {
      console.error('Error searching products:', error);
    } finally {
      setSearchingProducts(false);
    }
  };

  const openNewModal = () => {
    setEditId(null);
    setForm({ supplierId: '', warehouseId: warehouses[0]?.id || '', expectedDate: '', observations: '', lines: [] });
    setBusqueda({ termino: '', resultados: [] });
    setShowFormModal(true);
  };

  const openEditModal = async (id: string) => {
    try {
      const toastId = toast.loading('Cargando detalles del pedido...');
      const res = await fetch(`/api/v1/supplier-orders/${id}`);
      const leido = await leerRespuesta<{ data: PurchaseOrder }>(res);
      toast.dismiss(toastId);

      if (leido.bien) {
        const order = leido.cuerpo.data;
        if (order.status !== 'Draft') {
          toast.error('Solo se pueden modificar pedidos en estado borrador (Draft).');
          return;
        }
        setEditId(order.id);
        setForm({
          supplierId: order.supplierId,
          warehouseId: order.warehouseId,
          expectedDate: order.expectedDate ? order.expectedDate.split('T')[0] : '',
          observations: order.observations || '',
          lines: order.lines || [],
        });
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
      const leido = await leerRespuesta<{ data: PurchaseOrder }>(res);
      toast.dismiss(toastId);

      if (leido.bien) {
        setActiveOrder(leido.cuerpo.data);
        setShowDetailModal(true);
      } else {
        toast.error('No se pudo cargar el pedido');
      }
    } catch (error) {
      toast.error('Error de red al cargar detalles');
    }
  };

  const handleSendOrder = async (id: string) => {
    if (
      !(await confirm({
        title: 'Marcar como enviada',
        description: '¿Desea marcar esta orden de pedido como Enviada al suplidor?',
      }))
    ) return;
    try {
      const toastId = toast.loading('Actualizando estado...');
      const res = await fetch(`/api/v1/supplier-orders/${id}/send`, { method: 'POST' });
      const leido = await leerRespuesta(res);
      toast.dismiss(toastId);

      if (leido.bien) {
        toast.success('Pedido marcado como Enviado');
        setShowDetailModal(false);
        fetchOrders();
      } else {
        toast.error(leido.mensaje || 'Error al enviar pedido');
      }
    } catch (error) {
      toast.error('Error de red');
    }
  };

  const handleDuplicate = async (id: string) => {
    if (
      !(await confirm({
        title: 'Duplicar pedido',
        description: '¿Desea duplicar este pedido a un nuevo estado borrador?',
      }))
    ) return;
    try {
      const toastId = toast.loading('Duplicando pedido...');
      const res = await fetch(`/api/v1/supplier-orders/${id}/duplicate`, { method: 'POST' });
      const leido = await leerRespuesta<{ data: { orderNumber: string } }>(res);
      toast.dismiss(toastId);

      if (leido.bien) {
        toast.success(`Pedido duplicado: ${leido.cuerpo.data.orderNumber}`);
        setShowDetailModal(false);
        fetchOrders();
      } else {
        toast.error(leido.mensaje || 'Error al duplicar');
      }
    } catch (error) {
      toast.error('Error de red');
    }
  };

  const handleCancelOrder = async (id: string, num: string) => {
    if (
      !(await confirm({
        title: 'Cancelar pedido',
        description: `¿Está seguro que desea cancelar el pedido ${num}? Esta acción no se puede deshacer.`,
        variant: 'destructive',
      }))
    ) return;
    try {
      const toastId = toast.loading('Cancelando pedido...');
      //  Lote 252: esto mandaba DELETE a `/send`, que solo admite POST (405): cancelar nunca
      //  funciono. Ahora va a su ruta, que deja el pedido Cancelado con su apunte en el historial.
      const res = await fetch(`/api/v1/supplier-orders/${id}/cancel`, { method: 'POST' });
      const leido = await leerRespuesta(res);
      toast.dismiss(toastId);

      if (leido.bien) {
        toast.success('Pedido cancelado');
        setShowDetailModal(false);
        fetchOrders();
      } else {
        toast.error(leido.mensaje || 'Error al cancelar');
      }
    } catch (error) {
      toast.error('Error de red');
    }
  };

  const openReceiveModal = (order: PurchaseOrder) => {
    const linesToReceive = order.lines.flatMap(line => {
      const pending = line.quantityRequested - line.quantityReceived;
      return pending > 0 ? [{ itemId: line.id!, productName: line.productName, pending, toReceive: 0 }] : [];
    });

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
      const leido = await leerRespuesta(res);
      toast.dismiss(toastId);

      if (leido.bien) {
        toast.success('Recepción registrada exitosamente. Inventario actualizado.');
        setShowReceiveModal(false);
        setShowDetailModal(false);
        fetchOrders();
      } else {
        toast.error(leido.mensaje || 'Error al registrar recepción');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setSubmitting(false);
    }
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
      brand: '',
      model: '',
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
    setLines(prev => conCampo(prev, index, { quantityRequested: val }));
  };

  const handleLineObservationsChange = (index: number, val: string) => {
    setLines(prev => conCampo(prev, index, { observations: val }));
  };

  const handleLineBrandChange = (index: number, val: string) => {
    setLines(prev => conCampo(prev, index, { brand: val }));
  };

  const handleLineModelChange = (index: number, val: string) => {
    setLines(prev => conCampo(prev, index, { model: val }));
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
            brand: l.brand || '',
            model: l.model || '',
            quantityRequested: l.quantityRequested,
            observations: l.observations
          }))
        })
      });

      const leido = await leerRespuesta(res);
      if (leido.bien) {
        toast.success(editId ? 'Pedido actualizado exitosamente' : 'Pedido creado exitosamente');
        setShowFormModal(false);
        fetchOrders();
      } else {
        toast.error(leido.mensaje || 'Error al procesar el pedido');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setSubmitting(false);
    }
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

  return { confirm, orders, setOrders, suppliers, setSuppliers, warehouses, setWarehouses, loading, setLoading, errorCarga, setErrorCarga, searchNumber, setSearchNumber, searchSupplier, setSearchSupplier, statusFilter, setStatusFilter, startDate, setStartDate, endDate, setEndDate, showFormModal, setShowFormModal, showDetailModal, setShowDetailModal, showReceiveModal, setShowReceiveModal, submitting, setSubmitting, activeOrder, setActiveOrder, editId, setEditId, form, setForm, supplierId, warehouseId, expectedDate, observations, lines, setSupplierId, setWarehouseId, setExpectedDate, setObservations, setLines, busqueda, setBusqueda, productSearchTerm, searchedProducts, setProductSearchTerm, setSearchedProducts, searchingProducts, setSearchingProducts, activeLineIndex, setActiveLineIndex, receptions, setReceptions, fetchOrders, fetchSuppliers, fetchWarehouses, searchProducts, openNewModal, openEditModal, viewOrderDetails, handleSendOrder, handleDuplicate, handleCancelOrder, openReceiveModal, handleReceiveSubmit, handlePrintAll, handleAddLinePlaceholder, handleSelectProduct, handleRemoveLine, handleLineQuantityChange, handleLineObservationsChange, handleLineBrandChange, handleLineModelChange, handleFormSubmit, filteredOrders };
}

type EstadoPurchaseOrdersPage = ReturnType<typeof usePedidos>;

function FiltrosDePedidos({ h }: { h: EstadoPurchaseOrdersPage }) {
  const { searchNumber, setSearchNumber, searchSupplier, setSearchSupplier, statusFilter, setStatusFilter, startDate, setStartDate, endDate, setEndDate, fetchOrders, handlePrintAll, filteredOrders } = h;
  return (
    <>
      {/* Filters Bar */}
      <div className="flex flex-wrap gap-4 items-end bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex-1 min-w-[180px] w-full">
          <label htmlFor="pedido-1" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">No. Pedido</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input id="pedido-1"
              type="text"
              placeholder="Buscar número"
              value={searchNumber}
              onChange={e => setSearchNumber(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 placeholder:text-slate-400 h-8 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
            />
          </div>
        </div>

        <div className="flex-1 min-w-[180px] w-full">
          <label htmlFor="pedido-2" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Suplidor</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input id="pedido-2"
              type="text"
              placeholder="Buscar suplidor"
              value={searchSupplier}
              onChange={e => setSearchSupplier(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 placeholder:text-slate-400 h-8 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
            />
          </div>
        </div>

        <div className="w-full md:w-36">
          <label htmlFor="pedido-3" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Estado</label>
          <select id="pedido-3"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 h-8 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
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
          <label htmlFor="pedido-4" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Desde</label>
          <input id="pedido-4"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 h-8 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
          />
        </div>

        <div className="w-full md:w-36">
          <label htmlFor="pedido-5" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Hasta</label>
          <input id="pedido-5"
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 h-8 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
          />
        </div>

        <Button type="button" variant="secondary" size="sm" className="w-full md:w-auto"
          onClick={fetchOrders}>
          <Filter className="h-4 w-4" />
          FILTRAR
        </Button>

        {filteredOrders.length > 0 && (
          <Button
            type="button" variant="documento" size="sm" className="w-full md:w-auto"
            onClick={handlePrintAll}>
            <Printer className="h-4 w-4" />
            REPORTE PDF
          </Button>
        )}
      </div>
    </>
  );
}

function TablaDePedidos({ h }: { h: EstadoPurchaseOrdersPage }) {
  const { loading, errorCarga, fetchOrders, openEditModal, viewOrderDetails, filteredOrders } = h;
  return (
    <>
      {/* Orders Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-16 text-center">
            <div className="flex flex-col items-center justify-center gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" />
              <span className="text-slate-600 text-sm font-medium">Cargando pedidos logísticos...</span>
            </div>
          </div>
        ) : errorCarga ? (
          <ErrorDeCarga mensaje={errorCarga} onReintentar={fetchOrders} />
        ) : filteredOrders.length === 0 ? (
          <div className="p-16 text-center text-slate-500 text-sm">No se encontraron pedidos de mercancía.</div>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            {/* Mobile View */}
            <div className="md:hidden flex flex-col divide-y divide-slate-100">
              {filteredOrders.map(order => (
                <div key={order.id} className="flex flex-col p-4 bg-white hover:bg-slate-50 transition-colors gap-3">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-xs font-bold text-[#b08c4a]">
                        {order.orderNumber}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formatDateDisplay(order.orderDate)}
                      </span>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border whitespace-nowrap ${statusBadges[order.status]}`}>
                      {statusLabels[order.status]}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold text-[#003366] text-sm truncate">
                      {order.supplierName}
                    </span>
                    <span className="text-xs text-slate-500 mt-0.5">
                      RNC: {order.supplierRnc || '-'} | Creado por: {order.userName}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-3 border-t border-slate-100">
                    <span className="font-bold text-slate-800 text-xs">
                      {order.totalItemsCount} Artículos
                    </span>
                    <div className="flex gap-1.5">
                      <IconButton type="button" className="bg-slate-100 hover:text-[#005E63]" onClick={() => viewOrderDetails(order.id)} aria-label="Ver pedido" title="Ver pedido">
                        <Eye className="h-4 w-4" />
                      </IconButton>
                      <IconButton type="button" className="bg-slate-100 hover:text-[#005E63]" onClick={() => handlePrint(order.id)} aria-label="Imprimir pedido" title="Imprimir pedido">
                        <Printer className="h-4 w-4" />
                      </IconButton>
                      {order.status === 'Draft' && (
                        <IconButton type="button" className="bg-slate-100 hover:text-[#C5A059]" onClick={() => openEditModal(order.id)} aria-label="Editar pedido" title="Editar pedido">
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Fecha</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">No. Pedido</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Suplidor / Proveedor</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Total Artículos</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Usuario</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Estado</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredOrders.map(order => (
                    <tr key={order.id} className="hover:bg-[#C5A059]/5 transition-colors group">
                      <td className="px-4 py-2.5 align-middle">
                        <span className="font-mono text-slate-700 whitespace-nowrap">
                          {formatDateDisplay(order.orderDate)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <span className="font-mono font-bold text-[#b08c4a] group-hover:text-[#9a7a3e] transition-colors">
                          {order.orderNumber}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 align-middle">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-[#003366] block truncate max-w-[200px]">
                            {order.supplierName}
                          </span>
                          {order.supplierRnc && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              RNC: {order.supplierRnc}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 align-middle text-center font-bold text-slate-800">
                        {order.totalItemsCount}
                      </td>
                      <td className="px-4 py-2.5 align-middle text-slate-600">
                        {order.userName}
                      </td>
                      <td className="px-4 py-2.5 align-middle text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border whitespace-nowrap ${statusBadges[order.status]}`}>
                          {statusLabels[order.status]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 align-middle text-right space-x-2 whitespace-nowrap">
                        <Button type="button" variant="ghost" size="sm" className="hover:text-[#005E63]" onClick={() => viewOrderDetails(order.id)} aria-label="Ver pedido" title="Ver Detalles">
                          Ver
                        </Button>
                        <IconButton type="button" className="hover:text-[#005E63]" onClick={() => handlePrint(order.id)} aria-label="Imprimir pedido" title="Imprimir PDF">
                          <Printer className="h-4 w-4 inline" />
                        </IconButton>
                        {order.status === 'Draft' && (
                          <IconButton type="button" className="hover:text-[#C5A059]" onClick={() => openEditModal(order.id)} aria-label="Editar pedido" title="Editar">
                            <Pencil className="h-4 w-4 inline" />
                          </IconButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function FormularioDePedido({ h }: { h: EstadoPurchaseOrdersPage }) {
  const { suppliers, warehouses, showFormModal, setShowFormModal, submitting, editId, form, supplierId, warehouseId, expectedDate, observations, lines, setSupplierId, setWarehouseId, setExpectedDate, setObservations, productSearchTerm, searchedProducts, setProductSearchTerm, searchingProducts, activeLineIndex, setActiveLineIndex, searchProducts, handleAddLinePlaceholder, handleSelectProduct, handleRemoveLine, handleLineQuantityChange, handleLineObservationsChange, handleLineBrandChange, handleLineModelChange, handleFormSubmit } = h;
  return (
    <>
      {/* Alta / edicion: era un modal de 1.024 px con su propia barra; desde el lote 250 es la
          segunda pestana. Ver el detalle y recibir siguen en su ventana: son acciones sobre un pedido. */}
      {showFormModal && (
        <PanelDeRegistro titulo={editId ? 'Editar Pedido a Suplidor' : 'Nuevo Pedido a Suplidor'}>
          <form onSubmit={handleFormSubmit} className="space-y-6 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Supplier Select */}
              <div className="flex flex-col gap-2">
                <label htmlFor="pedido-6" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Suplidor / Proveedor</label>
                <select id="pedido-6"
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                  required
                  className="h-8 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
                >
                  <option value="">Seleccione un suplidor...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} {s.rnc ? `(${s.rnc})` : ''}</option>
                  ))}
                </select>
              </div>

              {/* Warehouse Select */}
              <div className="flex flex-col gap-2">
                <label htmlFor="pedido-7" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Almacén de Destino</label>
                <select id="pedido-7"
                  value={warehouseId}
                  onChange={e => setWarehouseId(e.target.value)}
                  required
                  className="h-8 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
                >
                  <option value="">Seleccione un almacén...</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              {/* Expected Date */}
              <div className="flex flex-col gap-2">
                <label htmlFor="pedido-8" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Estimada de Entrega</label>
                <input id="pedido-8"
                  type="date"
                  value={expectedDate}
                  onChange={e => setExpectedDate(e.target.value)}
                  className="h-8 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
                />
              </div>
            </div>

            {/* Items Form Table */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-[#003366] uppercase tracking-wider">Productos Solicitados</h3>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={handleAddLinePlaceholder}>
                  <Plus className="h-4 w-4" /> Buscar y Agregar Producto
                </Button>
              </div>

              {/* Autocomplete Input */}
              {activeLineIndex !== null && (
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3 relative">
                  <div className="flex justify-between items-center">
                    <label htmlFor="pedido-9" className="text-[10px] font-bold text-slate-500 uppercase">Escriba Nombre, SKU o Código de Barra del Producto</label>
                    <IconButton type="button" onClick={() => setActiveLineIndex(null)} aria-label="Cerrar la búsqueda">
                      <X className="h-4 w-4" />
                    </IconButton>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input id="pedido-9"
                      type="text"
                      placeholder="Buscar producto..."
                      value={productSearchTerm}
                      onChange={e => {
                        setProductSearchTerm(e.target.value);
                        searchProducts(e.target.value);
                      }}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 placeholder:text-slate-400 h-8 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
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
                          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
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
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-2.5 w-[15%]">SKU</th>
                      <th className="px-4 py-2.5 w-[30%]">Producto</th>
                      <th className="px-4 py-2.5 w-[10%]">Marca</th>
                      <th className="px-4 py-2.5 w-[10%]">Modelo</th>
                      <th className="px-4 py-2.5 text-center w-[12%]">Cantidad</th>
                      <th className="px-4 py-2.5 w-[18%]">Observaciones específicas</th>
                      <th className="px-4 py-2.5 text-center w-[5%]"></th>
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
                        //  Un producto va una sola vez por pedido (handleSelectProduct lo impide).
                        <tr key={line.productId} className="border-t border-slate-200 text-xs">
                          <td className="px-4 py-2.5 font-mono text-slate-600">{line.productSku || '-'}</td>
                          <td className="px-4 py-2.5 font-semibold text-[#003366]">{line.productName}</td>
                          <td className="px-4 py-2.5">
                            <input
                              type="text"
                              value={line.brand || ''}
                              aria-label={`Marca de ${line.productName}`}
                              placeholder="Marca"
                              onChange={e => handleLineBrandChange(idx, e.target.value)}
                              className="w-full h-8 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="text"
                              value={line.model || ''}
                              aria-label={`Modelo de ${line.productName}`}
                              placeholder="Modelo"
                              onChange={e => handleLineModelChange(idx, e.target.value)}
                              className="w-full h-8 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <input
                              type="number"
                              min="1"
                              value={line.quantityRequested}
                              aria-label={`Cantidad de ${line.productName}`}
                              onChange={e => handleLineQuantityChange(idx, parseInt(e.target.value) || 1)}
                              className="w-16 h-8 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-center text-xs outline-none text-slate-900 font-bold focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="text"
                              value={line.observations}
                              aria-label={`Observaciones de ${line.productName}`}
                              placeholder="Notas del item"
                              onChange={e => handleLineObservationsChange(idx, e.target.value)}
                              className="w-full h-8 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <IconButton type="button" className="text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleRemoveLine(idx)} aria-label={`Quitar ${line.productName}`}>
                              <X className="h-4 w-4" />
                            </IconButton>
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
              <label htmlFor="pedido-10" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Observaciones Generales</label>
              <textarea id="pedido-10"
                value={observations}
                onChange={e => setObservations(e.target.value)}
                rows={4}
                placeholder="Indique comentarios generales sobre la orden..."
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none text-slate-900 resize-none font-mono focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 bg-slate-50/50 p-4 -mx-4 -mb-4">
              <Button
                type="button" variant="secondary" size="sm"
                onClick={() => setShowFormModal(false)}>
                Cancelar
              </Button>
              <Button
                type="submit" size="sm"
                disabled={submitting}>
                {submitting ? 'Guardando...' : 'Guardar Pedido'}
              </Button>
            </div>
          </form>
        </PanelDeRegistro>
      )}
    </>
  );
}

function VentanasDePedido({ h }: { h: EstadoPurchaseOrdersPage }) {
  const { showDetailModal, setShowDetailModal, showReceiveModal, setShowReceiveModal, submitting, activeOrder, form, receptions, setReceptions, handleSendOrder, handleDuplicate, handleCancelOrder, openReceiveModal, handleReceiveSubmit } = h;
  return (
    <>
      {/* Detail / Action Modal */}
      <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {showDetailModal && activeOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
            <m.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-extrabold text-[#003366]">
                    Pedido: {activeOrder.orderNumber}
                  </h2>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${statusBadges[activeOrder.status]}`}>
                    {statusLabels[activeOrder.status]}
                  </span>
                </div>
                <IconButton type="button" onClick={() => setShowDetailModal(false)} aria-label="Cerrar el detalle del pedido">
                  <X className="h-5 w-5" />
                </IconButton>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6 text-xs">
                {/* Details grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div>
                    <span className="block text-[10px] font-bold text-slate-500 uppercase">Fecha de Creación</span>
                    <span className="font-semibold">{formatDateTimeDisplay(activeOrder.orderDate)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-500 uppercase">Estimada de Entrega</span>
                    <span className="font-semibold">{activeOrder.expectedDate ? formatDateDisplay(activeOrder.expectedDate) : 'No especificada'}</span>
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
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          <th className="px-4 py-2.5">SKU</th>
                          <th className="px-4 py-2.5">Nombre</th>
                          <th className="px-4 py-2.5">Marca</th>
                          <th className="px-4 py-2.5">Modelo</th>
                          <th className="px-4 py-2.5 text-center">UM</th>
                          <th className="px-4 py-2.5 text-center">Cant. Solicitada</th>
                          <th className="px-4 py-2.5 text-center">Cant. Recibida</th>
                          <th className="px-4 py-2.5 text-center text-amber-700">Pendiente</th>
                          <th className="px-4 py-2.5">Observaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeOrder.lines.map((line) => {
                          const pending = line.quantityRequested - line.quantityReceived;
                          return (
                            <tr key={line.id ?? line.productId} className="border-t border-slate-200">
                              <td className="px-4 py-2.5 font-mono text-slate-600">{line.productSku || '-'}</td>
                              <td className="px-4 py-2.5 font-semibold text-[#003366]">{line.productName}</td>
                              <td className="px-4 py-2.5 text-slate-700">{line.brand || '-'}</td>
                              <td className="px-4 py-2.5 text-slate-700">{line.model || '-'}</td>
                              <td className="px-4 py-2.5 text-center">{line.unitOfMeasure}</td>
                              <td className="px-4 py-2.5 text-center font-bold">{line.quantityRequested}</td>
                              <td className="px-4 py-2.5 text-center text-emerald-600 font-bold">{line.quantityReceived}</td>
                              <td className="px-4 py-2.5 text-center text-amber-700 font-bold bg-amber-50/50">{pending}</td>
                              <td className="px-4 py-2.5 text-slate-500">{line.observations || '-'}</td>
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
                        <div key={log.id} className="flex flex-col gap-0.5 border-l-2 border-slate-300 pl-3">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="font-bold text-slate-700">{log.action}</span>
                            <span className="text-slate-400">{formatDateTimeDisplay(log.createdAt)}</span>
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
              <div className="flex flex-wrap justify-between items-center p-4 border-t border-slate-100 bg-slate-50/50 gap-3">
                <div className="flex gap-2">
                  <Button type="button" variant="documento" size="sm"
                    onClick={() => handlePrint(activeOrder.id)}>
                    <Printer className="h-4 w-4" /> Imprimir PDF
                  </Button>
                  {activeOrder.supplierEmail && (
                    <Button type="button" variant="secondary" size="sm"
                      onClick={() => handleSendEmail(activeOrder.id)}>
                      <Mail className="h-4 w-4" /> Enviar por Correo
                    </Button>
                  )}
                  <Button type="button" variant="secondary" size="sm"
                    onClick={() => handleDuplicate(activeOrder.id)}>
                    <Copy className="h-4 w-4" /> Duplicar
                  </Button>
                </div>

                <div className="flex gap-2">
                  {/* Lote 273: el pie estaba al reves -- "Cancelar Pedido" iba DESPUES de la accion principal.
                      Lo que deshace va primero y la principal la ultima (docs/estandar_ui.md, sec. 4). */}
                  {activeOrder.status !== 'Received' && activeOrder.status !== 'Cancelled' && (
                    <Button type="button" variant="destructive" size="sm"
                      onClick={() => handleCancelOrder(activeOrder.id, activeOrder.orderNumber)}>
                      Cancelar Pedido
                    </Button>
                  )}
                  {activeOrder.status === 'Draft' && (
                    <Button type="button" size="sm"
                      onClick={() => handleSendOrder(activeOrder.id)}>
                      <CheckCircle2 className="h-4 w-4" /> Enviar al Suplidor
                    </Button>
                  )}
                  {(activeOrder.status === 'Sent' || activeOrder.status === 'Partial') && (
                    <Button type="button" size="sm"
                      onClick={() => openReceiveModal(activeOrder)}>
                      <Plus className="h-4 w-4" /> Registrar Recepción
                    </Button>
                  )}
                </div>
              </div>
            </m.div>
          </div>
        )}
      </AnimatePresence>

      {/* Receive Goods Modal */}
      <AnimatePresence>
        {showReceiveModal && activeOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <m.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Header */}
              <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-lg font-extrabold text-[#003366] flex items-center gap-2">
                  <Plus className="h-5 w-5 text-emerald-600" />
                  Registrar Recepción - {activeOrder.orderNumber}
                </h2>
                <IconButton type="button" onClick={() => setShowReceiveModal(false)} aria-label="Cerrar la ventana de recepción">
                  <X className="h-5 w-5" />
                </IconButton>
              </div>

              {/* Form */}
              <form onSubmit={handleReceiveSubmit} className="p-4 space-y-6 text-xs">
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
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                        <th className="px-4 py-2.5 w-[50%]">Producto</th>
                        <th className="px-4 py-2.5 text-center w-[15%]">Pendiente</th>
                        <th className="px-4 py-2.5 text-center w-[35%]">Cantidad a Recibir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receptions.map((rec, index) => (
                        <tr key={rec.itemId} className="border-t border-slate-200">
                          <td className="px-4 py-2.5 font-semibold text-slate-800">{rec.productName}</td>
                          <td className="px-4 py-2.5 text-center font-bold text-amber-700">{rec.pending}</td>
                          <td className="px-4 py-2.5 text-center">
                            <input
                              type="number"
                              min="0"
                              max={rec.pending}
                              aria-label={`Cantidad a recibir de ${rec.productName}`}
                              value={rec.toReceive}
                              onChange={e => {
                                const val = Math.min(rec.pending, Math.max(0, parseInt(e.target.value) || 0));
                                setReceptions(prev => conCampo(prev, index, { toReceive: val }));
                              }}
                              className="w-24 h-8 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-center text-xs outline-none text-slate-900 font-bold focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <Button
                    type="button" variant="secondary" size="sm"
                    onClick={() => setShowReceiveModal(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit" size="sm"
                    disabled={submitting}>
                    {submitting ? 'Registrando...' : 'Confirmar Recepción'}
                  </Button>
                </div>
              </form>
            </m.div>
          </div>
        )}
      </AnimatePresence>
      </LazyMotion>
    </>
  );
}
