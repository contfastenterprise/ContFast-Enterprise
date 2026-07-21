'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Package, Search, Plus, Edit2, Trash2, X, RefreshCw, AlertTriangle, Archive, DollarSign, Building2, Layers, Printer, ShieldCheck, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import BarcodeRenderer from '@/components/ui/BarcodeRenderer';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/ui/search-bar';


interface Product {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  unitOfMeasure: string;
  cost: string;
  price: string;
  priceConsumidor?: string;
  priceMayorista?: string;
  priceProveedor?: string;
  categoryId: string | null;
  status: string;
  inventory?: { warehouseId: string, warehouseName: string, quantity: string, availableQuantity?: string }[];
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventoryLevels, setInventoryLevels] = useState<{ warehouseId: string, warehouseName: string, quantity: string, availableQuantity?: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [categories, setCategories] = useState<{ id: string, name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Category modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [submittingCategory, setSubmittingCategory] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });

  // Warehouses state
  const [warehouses, setWarehouses] = useState<{ id: string, name: string }[]>([]);
  const [inlineAdjustForm, setInlineAdjustForm] = useState<Record<string, string>>({});
  const [submittingAdjustId, setSubmittingAdjustId] = useState<string | null>(null);

  const [showStockInPrint, setShowStockInPrint] = useState(false);
  const [printDropdownOpen, setPrintDropdownOpen] = useState(false);

  // Form state
  const [manualPricesEnabled, setManualPricesEnabled] = useState(false);
  const [showPricesModal, setShowPricesModal] = useState(false);

  // Barcode Module States
  const [barcodeType, setBarcodeType] = useState('code128');
  const [secondaryBarcodes, setSecondaryBarcodes] = useState<{ id?: string; barcode: string; barcodeType: string }[]>([]);
  const [newSecBarcode, setNewSecBarcode] = useState('');
  const [newSecBarcodeType, setNewSecBarcodeType] = useState('code128');
  const [showSecondarySection, setShowSecondarySection] = useState(false);
  const [generatingBarcode, setGeneratingBarcode] = useState(false);

  // Label Printing Modal States
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labelPrintMode, setLabelPrintMode] = useState<'single' | 'selected' | 'category' | 'all'>('single');
  const [labelSelectedCategory, setLabelSelectedCategory] = useState('');
  const [labelSelectedProduct, setLabelSelectedProduct] = useState<Product | null>(null);
  const [labelVisibleFields, setLabelVisibleFields] = useState({
    name: true,
    code: true,
    price: true,
    sku: true,
    brand: false,
    barcode: true,
    qr: false,
  });
  const [labelSize, setLabelSize] = useState('50x30'); // '30x20' | '50x25' | '50x30' | '60x40' | 'custom'
  const [labelCustomWidth, setLabelCustomWidth] = useState(50);
  const [labelCustomHeight, setLabelCustomHeight] = useState(30);
  const [labelQuantity, setLabelQuantity] = useState(1);
  const [labelBrandText, setLabelBrandText] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    sku: '',
    barcode: '',
    name: '',
    categoryId: '',
    unitOfMeasure: 'unidad',
    cost: '',
    price: '',
    priceConsumidor: '',
    priceMayorista: '',
    priceProveedor: '',
    status: 'active'
  });

  // Autocálculo de precios cuando cambia el costo (si no están manuales)
  useEffect(() => {
    if (!manualPricesEnabled && formData.cost) {
      const costNum = Number(formData.cost);
      if (!isNaN(costNum) && costNum >= 0) {
        const pConsumidor = (costNum * 1.20).toFixed(2);
        const pMayorista = (costNum * 1.15).toFixed(2);
        const pProveedor = (costNum * 1.10).toFixed(2);

        // Evitamos actualización infinita verificando si hay cambios reales
        if (formData.priceConsumidor !== pConsumidor ||
          formData.priceMayorista !== pMayorista ||
          formData.priceProveedor !== pProveedor ||
          formData.price !== pConsumidor) {
          setFormData(prev => ({
            ...prev,
            price: pConsumidor,
            priceConsumidor: pConsumidor,
            priceMayorista: pMayorista,
            priceProveedor: pProveedor
          }));
        }
      }
    }
  }, [formData.cost, manualPricesEnabled]);

  const fetchProducts = async (searchQuery = search, catId = selectedCategory, pageNum = 1) => {
    setLoading(true);
    try {
      let url = `/api/v1/products?search=${searchQuery}&page=${pageNum}&per_page=20`;
      if (catId) url += `&categoryId=${catId}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setProducts(data.data);
        if (data.meta) {
          setPage(data.meta.page);
          setTotalPages(data.meta.total_pages);
          setTotalItems(data.meta.total);
        }
      } else {
        toast.error('Error al cargar productos');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/v1/categories');
      const data = await res.json();
      if (data.success) {
        setCategories(data.data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const res = await fetch('/api/v1/warehouses');
      const data = await res.json();
      if (data.success) {
        setWarehouses(data.data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchProducts('', selectedCategory, 1);
    fetchCategories();
    fetchWarehouses();
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchProducts(search, selectedCategory, 1);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const fetchSecondaryBarcodes = async (productId: string) => {
    try {
      const res = await fetch(`/api/v1/products/${productId}/barcodes`);
      const data = await res.json();
      if (data.success) {
        setSecondaryBarcodes(data.data);
      }
    } catch (e) {
      console.error('Error al cargar códigos secundarios', e);
    }
  };

  const handleGenerateBarcode = async () => {
    setGeneratingBarcode(true);
    try {
      const res = await fetch('/api/v1/products/next-barcode');
      const data = await res.json();
      if (data.success && data.barcode) {
        setFormData(prev => ({ ...prev, barcode: data.barcode }));
        setBarcodeType('code128');
        toast.success('Código de barras autogenerado');
      } else {
        toast.error('Error al generar código');
      }
    } catch (e) {
      toast.error('Error de conexión');
    } finally {
      setGeneratingBarcode(false);
    }
  };

  const handleAddSecondaryBarcode = async () => {
    if (!newSecBarcode.trim()) return;

    const isDup = formData.barcode === newSecBarcode.trim() || 
                  secondaryBarcodes.some(b => b.barcode === newSecBarcode.trim());
    if (isDup) {
      toast.warning('Este código de barras ya está asociado al producto');
      return;
    }

    if (editId) {
      try {
        const res = await fetch(`/api/v1/products/${editId}/barcodes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barcode: newSecBarcode.trim(), barcodeType: newSecBarcodeType })
        });
        const data = await res.json();
        if (data.success) {
          setSecondaryBarcodes(prev => [...prev, data.data]);
          setNewSecBarcode('');
          toast.success('Código secundario agregado');
        } else {
          toast.error(data.error?.message || 'Error al guardar código secundario');
        }
      } catch (e) {
        toast.error('Error de conexión');
      }
    } else {
      setSecondaryBarcodes(prev => [...prev, { barcode: newSecBarcode.trim(), barcodeType: newSecBarcodeType }]);
      setNewSecBarcode('');
      toast.success('Código secundario añadido a la lista');
    }
  };

  const handleDeleteSecondaryBarcode = async (index: number, barcodeId?: string) => {
    if (editId && barcodeId) {
      try {
        const res = await fetch(`/api/v1/products/${editId}/barcodes?barcodeId=${barcodeId}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
          setSecondaryBarcodes(prev => prev.filter(b => b.id !== barcodeId));
          toast.success('Código secundario eliminado');
        } else {
          toast.error(data.error?.message || 'Error al eliminar');
        }
      } catch (e) {
        toast.error('Error de conexión');
      }
    } else {
      setSecondaryBarcodes(prev => prev.filter((_, idx) => idx !== index));
      toast.success('Código secundario removido de la lista');
    }
  };

  const openNewModal = () => {
    setEditId(null);
    setManualPricesEnabled(false);
    setSecondaryBarcodes([]);
    setBarcodeType('code128');
    setShowSecondarySection(false);
    setFormData({ sku: '', barcode: '', categoryId: '', name: '', unitOfMeasure: 'unidad', cost: '', price: '', priceConsumidor: '', priceMayorista: '', priceProveedor: '', status: 'active' });
    setShowModal(true);
  };

  const openEditModal = (product: any) => {
    setEditId(product.id);
    setManualPricesEnabled(false);
    setSecondaryBarcodes([]);
    setBarcodeType('code128');
    setShowSecondarySection(false);
    setFormData({
      sku: product.sku || '',
      barcode: product.barcode || '',
      categoryId: product.categoryId || '',
      name: product.name,
      unitOfMeasure: product.unitOfMeasure,
      cost: product.cost,
      price: product.price,
      priceConsumidor: product.priceConsumidor || product.price,
      priceMayorista: product.priceMayorista || product.price,
      priceProveedor: product.priceProveedor || product.price,
      status: product.status
    });
    fetchSecondaryBarcodes(product.id);
    setShowModal(true);
  };

  const openInventoryModal = async (product: Product) => {
    setSelectedProduct(product);
    setShowInventoryModal(true);
    setInventoryLevels([]);
    try {
      const res = await fetch(`/api/v1/products/${product.id}/inventory`);
      const data = await res.json();
      if (data.success) {
        setInventoryLevels(data.data);
      }
    } catch (error) {
      toast.error('Error al cargar inventario');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const method = editId ? 'PUT' : 'POST';
      const url = editId ? `/api/v1/products/${editId}` : '/api/v1/products';

      const payload = {
        ...formData,
        cost: Number(formData.cost),
        price: Number(formData.priceConsumidor || formData.price),
        priceConsumidor: Number(formData.priceConsumidor || formData.price),
        priceMayorista: Number(formData.priceMayorista || formData.price),
        priceProveedor: Number(formData.priceProveedor || formData.price),
        secondaryBarcodes: !editId ? secondaryBarcodes : undefined
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.success) {
        toast.success(editId ? 'Producto actualizado' : 'Producto creado exitosamente');
        setShowModal(false);
        fetchProducts(search, selectedCategory);
      } else {
        toast.error(data.error?.message || 'Error al guardar');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.name) return;
    setSubmittingCategory(true);
    try {
      const res = await fetch('/api/v1/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: categoryForm.name, description: categoryForm.description, status: 'active' })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Categoría creada exitosamente');
        setCategoryForm({ name: '', description: '' });
        setShowCategoryModal(false);
        // Refresh categories and automatically select the new one
        await fetchCategories();
        setFormData(prev => ({ ...prev, categoryId: data.data.id }));
      } else {
        toast.error(data.error?.message || 'Error al crear categoría');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setSubmittingCategory(false);
    }
  };

  const handleInlineAdjust = async (warehouseId: string) => {
    if (!selectedProduct) return;
    const newQuantity = inlineAdjustForm[warehouseId];
    if (newQuantity === undefined || newQuantity === '') return;

    setSubmittingAdjustId(warehouseId);
    try {
      const res = await fetch('/api/v1/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId,
          productId: selectedProduct.id,
          newQuantity,
          reason: 'Ajuste desde el dashboard de inventario'
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Inventario actualizado');
        // Limpiar el campo del formulario de esa fila para que vuelva a mostrar el valor en modo texto
        setInlineAdjustForm(prev => {
          const updated = { ...prev };
          delete updated[warehouseId];
          return updated;
        });
        
        // Refresh inventory levels
        const invRes = await fetch(`/api/v1/products/${selectedProduct.id}/inventory`);
        const invData = await invRes.json();
        if (invData.success) {
          setInventoryLevels(invData.data);
        }
      } else {
        toast.error(data.error?.message || 'Error al actualizar');
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setSubmittingAdjustId(null);
    }
  };

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP'
    }).format(Number(amount));
  };

  const handlePrintList = async (overrideShowStock?: boolean) => {
    const useStock = overrideShowStock !== undefined ? overrideShowStock : showStockInPrint;
    const toastId = toast.loading('Preparando plantilla de impresión...');
    try {
      let productsUrl = `/api/v1/products?search=${search}&page=1&per_page=100000`;
      if (selectedCategory) {
        productsUrl += `&categoryId=${selectedCategory}`;
      }

      const [settingsRes, productsRes] = await Promise.all([
        fetch('/api/v1/company/settings'),
        fetch(productsUrl)
      ]);

      const settingsData = await settingsRes.json();
      const productsData = await productsRes.json();

      const company = settingsData.data || {};
      const allProducts = productsData.data || [];
      
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('No se pudo abrir la ventana de impresión. Verifique el bloqueador de ventanas emergentes.', { id: toastId });
        return;
      }

      const logoHtml = company.logoUrl 
        ? `<img src="${company.logoUrl}" style="max-height: 55px; width: auto; object-fit: contain; margin-left: -3ch;" alt="Logo">` 
        : '';
      const companyTitleHtml = logoHtml ? '' : `<div style="font-size: 20px; font-weight: bold; color: #003366;">${company.companyName || 'Latin Doors e-CF'}</div>`;

      const htmlContent = `
        <html>
          <head>
            <title>Catálogo de Productos - ${company.companyName || 'Latin Doors e-CF'}</title>
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
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .font-mono { font-family: monospace; font-size: 11px; }
              .font-bold { font-weight: bold; }
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
                <div class="subtitle">CATÁLOGO DE PRODUCTOS</div>
                <div><strong>Fecha Emisión:</strong> ${new Date().toLocaleDateString('es-DO')}</div>
                <div><strong>Productos Filtrados:</strong> ${allProducts.length}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>SKU / Código</th>
                  <th>Nombre</th>
                  <th>Medida</th>
                  ${useStock ? '<th class="text-right">Stock</th>' : ''}
                  <th class="text-right">Costo</th>
                  <th class="text-right">Precio Venta</th>
                  <th class="text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${allProducts.map((p: any) => {
                  const stockTotal = (p.inventory || []).reduce((acc: number, item: any) => acc + Number(item.quantity || 0), 0);
                  return `
                    <tr>
                      <td class="font-mono">${p.sku || 'N/A'}</td>
                      <td class="font-bold">${p.name}</td>
                      <td style="text-transform: capitalize;">${p.unitOfMeasure}</td>
                      ${useStock ? `<td class="text-right font-mono font-bold">${stockTotal}</td>` : ''}
                      <td class="text-right">${formatCurrency(p.cost)}</td>
                      <td class="text-right font-bold" style="color: #16a34a;">${formatCurrency(p.price)}</td>
                      <td class="text-center">
                        <span style="padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: bold; background-color: ${p.status === 'active' ? '#e6f4ea' : '#f1f3f4'}; color: ${p.status === 'active' ? '#137333' : '#5f6368'};">
                          ${p.status === 'active' ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            <div class="footer">
              Reporte de Inventario - Generado por ContFast Enterprise
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

  const getLabelsToRender = () => {
    let itemsToPrint: Product[] = [];
    if (labelPrintMode === 'single' && labelSelectedProduct) {
      itemsToPrint = [labelSelectedProduct];
    } else if (labelPrintMode === 'selected') {
      itemsToPrint = products.filter(p => selectedProductIds.includes(p.id));
    } else if (labelPrintMode === 'category' && labelSelectedCategory) {
      itemsToPrint = products.filter(p => p.categoryId === labelSelectedCategory);
    } else if (labelPrintMode === 'all') {
      itemsToPrint = products;
    }

    const list: Product[] = [];
    itemsToPrint.forEach(p => {
      const q = labelQuantity || 1;
      for (let i = 0; i < q; i++) {
        list.push(p);
      }
    });
    return list;
  };

  const handlePrintLabels = async () => {
    const list = getLabelsToRender();
    if (list.length === 0) {
      toast.error('No hay etiquetas para imprimir');
      return;
    }

    const toastId = toast.loading('Registrando historial de impresión...');
    try {
      const uniqueProds = Array.from(new Set(list.map(p => p.id)));
      const promises = uniqueProds.map(prodId => {
        const qty = list.filter(p => p.id === prodId).length;
        return fetch('/api/v1/products/barcodes/print-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: prodId, quantity: qty })
        });
      });
      await Promise.all(promises);
      toast.success('Historial registrado', { id: toastId });
    } catch (e) {
      console.error('Error logging print action:', e);
      toast.dismiss(toastId);
    }

    setTimeout(() => {
      window.print();
    }, 300);
  };

  // Metrics calculation (Mock/derived from current page for demo purposes)
  const totalValue = products.reduce((sum, p) => sum + (Number(p.cost) || 0), 0);

  return (

    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 font-sans">

      {/* Header section with title and CTA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary font-display flex items-center gap-2">
            <Package className="h-8 w-8 text-[#c5a059]" />
            Catálogo de Productos
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">Gestiona tu inventario, precios y servicios facturables.</p>
        </div>
        <button
          onClick={openNewModal}
          className="bg-[#003366] hover:bg-[#002244] text-white font-bold py-2.5 px-6 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 text-sm shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nuevo Producto
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Total Catálogo (Blue) */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-blue-600 group-hover:scale-110 transition-transform"><Package className="h-16 w-16" /></div>
          <p className="text-blue-800 text-sm font-semibold mb-1">Total en Catálogo</p>
          <p className="text-3xl font-bold text-blue-950 font-display">{totalItems}</p>
        </div>

        {/* Card 2: Valor Inventario (Emerald) */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-emerald-600 group-hover:scale-110 transition-transform"><DollarSign className="h-16 w-16" /></div>
          <p className="text-emerald-800 text-sm font-semibold mb-1">Valor de Inventario (Costos)</p>
          <p className="text-3xl font-bold text-emerald-950 font-display">{formatCurrency(totalValue)}</p>
        </div>

        {/* Card 3: Stock Bajo (Amber) */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="absolute top-0 right-0 p-4 opacity-10 text-amber-600 group-hover:scale-110 transition-transform"><AlertTriangle className="h-16 w-16" /></div>
          <p className="text-amber-800 text-sm font-semibold mb-1">Stock Bajo</p>
          <p className="text-3xl font-bold text-amber-950 font-display">0</p>
        </div>
      </div>

      {/* Search and Table Container */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50/50">
          <div className="flex gap-4 flex-1">
            <div className="flex-1">
              <SearchBar
                placeholder="Buscar por código, nombre o código de barras..."
                value={search}
                onChange={(val) => {
                  setSearch(val);
                  fetchProducts(val, selectedCategory);
                }}
              />
            </div>
            <div className="w-48 hidden md:block">
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  fetchProducts(search, e.target.value);
                }}
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary shadow-sm outline-none"
              >
                <option value="">Todas las categorías</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex items-center h-[38px] z-20">
              <button
                type="button"
                onClick={() => {
                  setPrintDropdownOpen(false);
                  handlePrintList(showStockInPrint);
                }}
                className="flex items-center justify-center gap-1.5 rounded-l-lg border border-r-0 border-slate-350 bg-white px-4 h-full text-xs font-bold text-slate-900 hover:bg-slate-50 transition-all active:scale-[0.98] outline-none"
                title="Imprimir listado filtrado"
              >
                <Printer className="w-4 h-4 text-[#c5a059]" />
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPrintDropdownOpen(v => !v);
                }}
                className="flex items-center justify-center rounded-r-lg border border-slate-350 bg-white px-2.5 h-full text-slate-900 hover:bg-slate-50 transition-all active:scale-[0.98] outline-none"
                title="Más opciones de impresión"
              >
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </button>

              <AnimatePresence>
                {printDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setPrintDropdownOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full right-0 mt-2 z-40 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden min-w-[210px]"
                    >
                      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Opciones de Impresión</p>
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => {
                          setPrintDropdownOpen(false);
                          setShowStockInPrint(false);
                          handlePrintList(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left font-semibold ${!showStockInPrint ? 'bg-slate-50/70 border-l-2 border-[#003366]' : ''}`}
                      >
                        <div className="flex-shrink-0 w-6 h-6 rounded bg-slate-100 flex items-center justify-center">
                          <Printer className="h-3.5 w-3.5 text-slate-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-xs">Imprimir Normal</p>
                          <p className="text-[9px] text-slate-400 font-medium">Sin columna de stock</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPrintDropdownOpen(false);
                          setShowStockInPrint(true);
                          handlePrintList(true);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left font-semibold ${showStockInPrint ? 'bg-slate-50/70 border-l-2 border-[#003366]' : ''}`}
                      >
                        <div className="flex-shrink-0 w-6 h-6 rounded bg-amber-100 flex items-center justify-center">
                          <Layers className="h-3.5 w-3.5 text-amber-700" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-xs">Imprimir con Stock</p>
                          <p className="text-[9px] text-slate-400 font-medium">Incluye existencias totales</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPrintDropdownOpen(false);
                          setLabelPrintMode(selectedProductIds.length > 0 ? 'selected' : 'all');
                          if (products.length > 0) {
                            setLabelSelectedProduct(products[0]);
                          }
                          setShowLabelModal(true);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left font-semibold"
                      >
                        <div className="flex-shrink-0 w-6 h-6 rounded bg-blue-100 flex items-center justify-center">
                          <Printer className="h-3.5 w-3.5 text-blue-700" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-xs">Imprimir Etiquetas</p>
                          <p className="text-[9px] text-slate-400 font-medium">
                            {selectedProductIds.length > 0
                              ? `Para ${selectedProductIds.length} prod. seleccionados`
                              : 'Diseñar e imprimir etiquetas'}
                          </p>
                        </div>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <button onClick={() => fetchProducts(search, selectedCategory, page)} className="p-2 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-lg transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/80 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={products.length > 0 && selectedProductIds.length === products.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProductIds(products.map(p => p.id));
                      } else {
                        setSelectedProductIds([]);
                      }
                    }}
                    className="rounded border-slate-350 text-[#003366] focus:ring-[#003366] cursor-pointer"
                  />
                </th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">SKU / Código</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nombre</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Medida</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Costo</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Precio Venta</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-[#C5A059]" />
                    Cargando catálogo...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400">
                    <Archive className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    No se encontraron productos.
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-[#C5A059]/5 transition-colors group">
                    <td className="px-4 py-2 w-10 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={selectedProductIds.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProductIds(prev => [...prev, p.id]);
                          } else {
                            setSelectedProductIds(prev => prev.filter(id => id !== p.id));
                          }
                        }}
                        className="rounded border-slate-350 text-[#003366] focus:ring-[#003366] cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-2 align-middle text-xs font-mono text-slate-700">
                      <div>{p.sku || 'N/A'}</div>
                      {p.barcode && (
                        <div className="text-[10px] text-slate-400 font-sans mt-0.5" title="Código de Barra">
                          CB: {p.barcode}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 align-middle text-xs font-semibold text-[#003366]">{p.name}</td>
                    <td className="px-4 py-2 align-middle text-xs text-slate-600 capitalize">{p.unitOfMeasure}</td>
                    <td className="px-4 py-2 align-middle text-xs text-slate-700 text-right">{formatCurrency(p.cost)}</td>
                    <td className="px-4 py-2 align-middle text-xs font-bold text-[#003366] text-right">{formatCurrency(p.price)}</td>
                    <td className="px-4 py-2 align-middle text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${p.status === 'active' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-slate-50 text-slate-500 border border-slate-200'
                        }`}>
                      {p.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                    </td>
                    <td className="px-4 py-2 align-middle text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => {
                            setLabelSelectedProduct(p);
                            setLabelPrintMode('single');
                            setLabelQuantity(1);
                            setShowLabelModal(true);
                          }}
                          title="Imprimir Etiquetas"
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => openInventoryModal(p)} title="Ver Inventario" className="p-1.5 text-slate-500 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors">
                          <Layers className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => openEditModal(p)} title="Editar" className="p-1.5 text-slate-500 hover:text-[#003366] hover:bg-[#003366]/5 rounded-lg transition-colors">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
          <p className="text-xs text-slate-500 font-medium">
            Mostrando <span className="font-bold text-slate-800">{products.length}</span> de <span className="font-bold text-slate-800">{totalItems}</span> productos
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => fetchProducts(search, selectedCategory, page - 1)}
                type="button"
                className="px-3 py-1.5 bg-[#003366]/10 hover:bg-[#003366]/20 text-[#003366] text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Anterior
              </button>
              <span className="text-xs text-slate-500 font-bold px-2">
                Pág. {page} de {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => fetchProducts(search, selectedCategory, page + 1)}
                type="button"
                className="px-3 py-1.5 bg-[#003366]/10 hover:bg-[#003366]/20 text-[#003366] text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm h-8"
              onClick={() => setShowModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-3xl bg-white border border-[#003366] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center p-6 border-b border-[#003366] bg-[#001733]">
                <h2 className="text-xl font-bold text-white font-display">
                  {editId ? 'Editar Producto' : 'Registrar Nuevo Producto'}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-white/70 hover:text-white cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#001e40]">Código SKU <span className="text-slate-500 font-normal text-xs">(Opcional)</span></label>
                    <input
                      type="text"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-[#c5a059] outline-none transition-colors font-mono"
                      placeholder="PROD-001"
                    />
                  </div>

                  <div className="space-y-3 col-span-1 md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-[#001e40]">Código de Barra Principal</label>
                      <button
                        type="button"
                        onClick={handleGenerateBarcode}
                        disabled={generatingBarcode}
                        className="text-xs flex items-center gap-1 bg-[#003366] text-white px-2.5 py-1 rounded-md font-bold hover:bg-[#002244] transition-colors disabled:opacity-50"
                      >
                        {generatingBarcode ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Generar Automático
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={formData.barcode}
                          onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-[#c5a059] outline-none transition-colors font-mono"
                          placeholder="Ingresa código o genera uno"
                        />
                      </div>

                      <div className="space-y-1">
                        <select
                          value={barcodeType}
                          onChange={(e) => setBarcodeType(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-[#c5a059] outline-none transition-colors"
                        >
                          <option value="code128">Code 128 (Estándar)</option>
                          <option value="ean13">EAN-13 (Productos internacionales)</option>
                          <option value="ean8">EAN-8 (Paquetes pequeños)</option>
                          <option value="upca">UPC-A (América del Norte)</option>
                          <option value="qrcode">Código QR</option>
                        </select>
                      </div>
                    </div>

                    {formData.barcode && (
                      <div className="mt-3 flex justify-center border-t border-slate-200/60 pt-3">
                        <div className="flex flex-col items-center gap-1 bg-white p-2.5 rounded-lg border border-slate-100 shadow-inner">
                          <p className="text-[10px] uppercase font-bold text-slate-400">Vista Previa del Código</p>
                          <BarcodeRenderer value={formData.barcode} type={barcodeType} height={35} />
                        </div>
                      </div>
                    )}

                    <div className="border-t border-slate-200/60 pt-3 mt-2">
                      <button
                        type="button"
                        onClick={() => setShowSecondarySection(!showSecondarySection)}
                        className="text-xs font-bold text-[#003366] hover:text-[#002244] flex items-center gap-1.5 transition-colors"
                      >
                        <Layers className="h-3.5 w-3.5 animate-pulse" />
                        <span>Códigos de Barra Secundarios ({secondaryBarcodes.length})</span>
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showSecondarySection ? 'rotate-180' : ''}`} />
                      </button>

                      {showSecondarySection && (
                        <div className="mt-3 space-y-3 pl-2 border-l-2 border-[#c5a059] bg-slate-50/50 p-3 rounded-r-lg">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newSecBarcode}
                              onChange={(e) => setNewSecBarcode(e.target.value)}
                              className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:border-[#c5a059] outline-none font-mono"
                              placeholder="Código secundario..."
                            />
                            <select
                              value={newSecBarcodeType}
                              onChange={(e) => setNewSecBarcodeType(e.target.value)}
                              className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-800 focus:border-[#c5a059] outline-none"
                            >
                              <option value="code128">Code 128</option>
                              <option value="ean13">EAN-13</option>
                              <option value="ean8">EAN-8</option>
                              <option value="upca">UPC-A</option>
                              <option value="qrcode">QR</option>
                            </select>
                            <button
                              type="button"
                              onClick={handleAddSecondaryBarcode}
                              className="bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] font-bold text-xs px-3 py-1.5 rounded-lg transition-colors shrink-0"
                            >
                              Añadir
                            </button>
                          </div>

                          {secondaryBarcodes.length > 0 && (
                            <div className="max-h-36 overflow-y-auto space-y-2 mt-2">
                              {secondaryBarcodes.map((b, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
                                  <div className="flex flex-col">
                                    <span className="text-xs font-mono font-bold text-slate-700">{b.barcode}</span>
                                    <span className="text-[9px] uppercase font-bold text-slate-400">{b.barcodeType}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSecondaryBarcode(idx, b.id)}
                                    className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 col-span-1 md:col-span-2">
                    <label className="text-sm font-semibold text-[#001e40]">Nombre del Producto <span className="text-[#c5a059]">*</span></label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-[#c5a059] outline-none transition-colors"
                      placeholder="Ej. Puerta Caoba 100*200 cm"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-[#001e40]">Categoría <span className="text-[#c5a059]">*</span></label>
                      <button
                        type="button"
                        onClick={() => setShowCategoryModal(true)}
                        className="text-xs text-[#c5a059] hover:text-[#d4b069] font-bold flex items-center gap-1 transition-colors"
                      >
                        <Plus className="h-3 w-3" /> Nueva
                      </button>
                    </div>
                    <select
                      required
                      value={formData.categoryId}
                      onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-[#c5a059] outline-none transition-colors"
                    >
                      <option value="">Selecciona una categoría...</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center min-h-[20px]">
                      <label className="text-sm font-semibold text-[#001e40]">Costo de Compra <span className="text-[#c5a059]">*</span></label>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">RD$</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={formData.cost}
                        onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-12 pr-3 py-2 text-xs text-slate-800 focus:border-[#c5a059] outline-none transition-colors"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 col-span-1 md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-semibold text-[#001e40]">Precios de Venta</label>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-100 text-amber-800 border border-amber-200 rounded-md shadow-sm" title="Importante: Los precios no incluyen ITBIS">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Sin ITBIS</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#001e40]">
                          <input
                            type="checkbox"
                            checked={!manualPricesEnabled}
                            onChange={(e) => setManualPricesEnabled(!e.target.checked)}
                            className="rounded border-slate-300 text-primary focus:ring-primary"
                          />
                          Autocalcular
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setManualPricesEnabled(true);
                            setShowPricesModal(true);
                          }}
                          className="text-xs flex items-center gap-1 bg-[#c5a059] text-[#001e40] px-3 py-1.5 rounded-md font-bold hover:bg-[#d4b069] transition-colors"
                        >
                          <Edit2 className="h-3 w-3" />
                          {manualPricesEnabled ? 'Editar Precios' : 'Ajustar Manual'}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="relative">
                        <label className="text-xs text-slate-650 font-medium block mb-1">P. Consumidor (+20%)</label>
                        <span className="absolute left-3 top-10 -translate-y-1/2 text-emerald-650 font-bold z-10">RD$</span>
                        <input
                          type="number"
                          readOnly
                          value={formData.priceConsumidor || formData.price}
                          className="w-full bg-slate-100 border border-slate-300 rounded-lg pl-12 pr-3 py-2 text-xs text-slate-800 opacity-80 cursor-not-allowed font-bold"
                        />
                      </div>

                      <div className="relative">
                        <label className="text-xs text-slate-650 font-medium block mb-1">P. Mayorista (+15%)</label>
                        <span className="absolute left-3 top-10 -translate-y-1/2 text-emerald-650 font-bold z-10">RD$</span>
                        <input
                          type="number"
                          readOnly
                          value={formData.priceMayorista}
                          className="w-full bg-slate-100 border border-slate-300 rounded-lg pl-12 pr-3 py-2 text-xs text-slate-800 opacity-80 cursor-not-allowed font-bold"
                        />
                      </div>

                      <div className="relative">
                        <label className="text-xs text-slate-650 font-medium block mb-1">P. Proveedor (+10%)</label>
                        <span className="absolute left-3 top-10 -translate-y-1/2 text-emerald-650 font-bold z-10">RD$</span>
                        <input
                          type="number"
                          readOnly
                          value={formData.priceProveedor}
                          className="w-full bg-slate-100 border border-slate-300 rounded-lg pl-12 pr-3 py-2 text-xs text-slate-800 opacity-80 cursor-not-allowed font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#001e40]">Unidad de Medida <span className="text-[#c5a059]">*</span></label>
                    <select
                      value={formData.unitOfMeasure}
                      onChange={(e) => setFormData({ ...formData, unitOfMeasure: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-[#c5a059] outline-none transition-colors appearance-none"
                    >
                      <option value="unidad">Unidad</option>
                      <option value="pie">Pie (pie)</option>
                      <option value="metro">Metro (m)</option>
                      <option value="servicio">Servicio</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-[#001e40]">Estado</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:border-[#c5a059] outline-none transition-colors appearance-none"
                    >
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowModal(false)}
                    className="flex items-center gap-2 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 font-semibold border border-rose-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white border-transparent font-semibold shadow-sm cursor-pointer"
                  >
                    {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    {editId ? 'Guardar Cambios' : 'Registrar Producto'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sub-Modal New Category */}
      <AnimatePresence>
        {showCategoryModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCategoryModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-white border border-[#003366] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center p-5 border-b border-[#003366] bg-[#001733]">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Package className="h-5 w-5 text-[#c5a059]" /> Nueva Categoría
                </h3>
                <button onClick={() => setShowCategoryModal(false)} className="text-white/70 hover:text-white cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateCategory} className="p-6 space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-primary">Nombre de Categoría <span className="text-[#c5a059]">*</span></label>
                  <input
                    type="text"
                    required
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    className="w-full bg-white border border-outline/50 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#c5a059] outline-none transition-colors"
                    placeholder="Ej. Herramientas"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-primary">Descripción</label>
                  <textarea
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    className="w-full bg-white border border-outline/50 rounded-lg px-4 py-2.5 text-slate-800 placeholder:text-slate-400 focus:border-[#c5a059] outline-none transition-colors"
                    placeholder="Opcional..."
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-outline/20">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowCategoryModal(false)}
                    className="flex items-center gap-2 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 font-semibold border border-rose-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={submittingCategory}
                    className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white border-transparent font-semibold shadow-sm cursor-pointer"
                  >
                    {submittingCategory ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    Guardar
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sub-Modal Edit Prices */}
      <AnimatePresence>
        {showPricesModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowPricesModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center p-5 border-b border-[#003366] bg-[#0b1120]">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-[#c5a059]" /> Edición Manual de Precios
                </h3>
                <button onClick={() => setShowPricesModal(false)} className="text-white/70 hover:text-white cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 p-3 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <p className="text-xs">
                    Al guardar estos precios, el auto-cálculo automático (20%, 15%, 10%) basado en el costo se desactivará para no sobrescribir tus ajustes.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-primary">Precio Consumidor (Venta Regular)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">RD$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.priceConsumidor || formData.price}
                        onChange={(e) => {
                          setFormData({ ...formData, priceConsumidor: e.target.value, price: e.target.value });
                        }}
                        className="w-full bg-white border border-outline/50 rounded-lg pl-14 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#c5a059] outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-primary">Precio Mayorista</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">RD$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.priceMayorista}
                        onChange={(e) => setFormData({ ...formData, priceMayorista: e.target.value })}
                        className="w-full bg-white border border-outline/50 rounded-lg pl-14 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#c5a059] outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-primary">Precio Proveedor / Distribuidor</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">RD$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.priceProveedor}
                        onChange={(e) => setFormData({ ...formData, priceProveedor: e.target.value })}
                        className="w-full bg-white border border-outline/50 rounded-lg pl-14 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#c5a059] outline-none transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    type="button"
                    onClick={() => setShowPricesModal(false)}
                    className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white border-transparent font-semibold shadow-sm cursor-pointer w-full justify-center"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Confirmar Precios
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sub-Modal Inventory */}
      <AnimatePresence>
        {showInventoryModal && selectedProduct && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowInventoryModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-5xl bg-surface-container-highest border border-[#003366] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center p-5 border-b border-[#003366] bg-[#0b1120]">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-[#c5a059]" /> Inventario: {selectedProduct.name}
                </h3>
                <button onClick={() => setShowInventoryModal(false)} className="text-on-surface-variant hover:text-primary">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-0 overflow-y-auto max-h-[70vh]">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-container-low/80 border-b border-[#003366] sticky top-0 z-10">
                    <tr>
                      <th className="p-4 text-xs font-semibold text-primary uppercase tracking-wider">Almacén</th>
                      <th className="p-4 text-xs font-semibold text-primary uppercase tracking-wider text-right">Físico</th>
                      <th className="p-4 text-xs font-semibold text-primary uppercase tracking-wider text-right">Disponible</th>
                      <th className="p-4 text-xs font-semibold text-primary uppercase tracking-wider text-right w-40">Ajustar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20 bg-surface-container-highest">
                    {warehouses.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-on-surface-variant/70">
                          <Layers className="h-8 w-8 mx-auto mb-2 opacity-20" />
                          No hay almacenes configurados en el sistema.
                        </td>
                      </tr>
                    ) : (
                      warehouses.map((w) => {
                        const level = inventoryLevels.find(l => l.warehouseId === w.id);
                        const currentQuantity = level ? Number(level.quantity).toFixed(2) : '0.00';
                        const availableQuantity = level && level.availableQuantity !== undefined
                          ? Number(level.availableQuantity).toFixed(2)
                          : currentQuantity;
                        
                        return (
                          <tr key={w.id} className="hover:bg-surface-container-low/30 transition-colors">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="bg-primary/10 p-2 rounded-lg text-primary flex-shrink-0">
                                  <Building2 className="h-4 w-4" />
                                </div>
                                <span className="font-bold text-on-surface text-sm">{w.name}</span>
                              </div>
                            </td>
                            <td className="p-4 text-right">
                              <span className="block text-md font-mono text-emerald-400">
                                {currentQuantity}
                              </span>
                              <span className="text-[10px] text-on-surface-variant capitalize">{selectedProduct.unitOfMeasure}s</span>
                            </td>
                            <td className="p-4 text-right">
                              <span className="block text-md font-mono font-bold text-amber-400">
                                {availableQuantity}
                              </span>
                              <span className="text-[10px] text-on-surface-variant">Disponibles</span>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center gap-2 justify-end">
                                <input
                                  type="number"
                                  step="1"
                                  value={inlineAdjustForm[w.id] !== undefined ? inlineAdjustForm[w.id] : currentQuantity}
                                  onChange={(e) => setInlineAdjustForm({ ...inlineAdjustForm, [w.id]: e.target.value })}
                                  className="w-24 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#c5a059] outline-none text-right font-mono"
                                />
                                <button
                                  onClick={() => handleInlineAdjust(w.id)}
                                  disabled={submittingAdjustId === w.id || inlineAdjustForm[w.id] === undefined || inlineAdjustForm[w.id] === currentQuantity}
                                  title="Guardar cambio"
                                  className="p-1.5 bg-[#c5a059] hover:bg-[#d4b069] text-[#001e40] rounded-md transition-colors disabled:opacity-30 disabled:grayscale"
                                >
                                  {submittingAdjustId === w.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Edit2 className="h-4 w-4" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Diálogo Avanzado de Impresión de Etiquetas */}
      <AnimatePresence>
        {showLabelModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowLabelModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-4xl bg-white border border-[#003366] rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row no-print"
            >
              {/* Ajustes */}
              <div className="flex-1 p-6 space-y-5 max-h-[85vh] overflow-y-auto">
                <div className="flex justify-between items-center border-b pb-4">
                  <h3 className="text-lg font-bold text-[#003366] flex items-center gap-2">
                    <Printer className="h-5 w-5 text-[#c5a059]" />
                    Generar Etiquetas de Código de Barras
                  </h3>
                  <button onClick={() => setShowLabelModal(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Modo de Selección</label>
                    <select
                      value={labelPrintMode}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setLabelPrintMode(val);
                        if (val === 'single' && products.length > 0 && !labelSelectedProduct) {
                          setLabelSelectedProduct(products[0]);
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none"
                    >
                      <option value="single">Producto Único</option>
                      <option value="selected">Productos Seleccionados ({selectedProductIds.length})</option>
                      <option value="category">Por Categoría</option>
                      <option value="all">Todo el Catálogo</option>
                    </select>
                  </div>

                  {labelPrintMode === 'category' && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Categoría</label>
                      <select
                        value={labelSelectedCategory}
                        onChange={(e) => setLabelSelectedCategory(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none"
                      >
                        <option value="">Todas las categorías</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}

                  {labelPrintMode === 'single' && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Producto</label>
                      <select
                        value={labelSelectedProduct?.id || ''}
                        onChange={(e) => {
                          const found = products.find(p => p.id === e.target.value);
                          if (found) setLabelSelectedProduct(found);
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none"
                      >
                        <option value="">Selecciona...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Tamaño Etiqueta</label>
                    <select
                      value={labelSize}
                      onChange={(e) => setLabelSize(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none"
                    >
                      <option value="30x20">30x20 mm (Mini)</option>
                      <option value="50x25">50x25 mm</option>
                      <option value="50x30">50x30 mm (Estándar)</option>
                      <option value="60x40">60x40 mm (Grande)</option>
                      <option value="custom">Personalizado</option>
                    </select>
                  </div>

                  {labelSize === 'custom' && (
                    <div className="grid grid-cols-2 gap-2 col-span-1 md:col-span-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block">Ancho (mm)</label>
                        <input
                          type="number"
                          value={labelCustomWidth}
                          onChange={(e) => setLabelCustomWidth(parseInt(e.target.value) || 50)}
                          className="w-full bg-slate-50 border border-slate-350 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-mono outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block">Alto (mm)</label>
                        <input
                          type="number"
                          value={labelCustomHeight}
                          onChange={(e) => setLabelCustomHeight(parseInt(e.target.value) || 30)}
                          className="w-full bg-slate-50 border border-slate-350 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-mono outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Cantidad por Producto</label>
                    <input
                      type="number"
                      min="1"
                      value={labelQuantity}
                      onChange={(e) => setLabelQuantity(parseInt(e.target.value) || 1)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-mono outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Marca / Empresa</label>
                    <input
                      type="text"
                      value={labelBrandText}
                      onChange={(e) => setLabelBrandText(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none"
                      placeholder="Ej. ContFast Enterprise"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Campos Visibles</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={labelVisibleFields.brand}
                        onChange={(e) => setLabelVisibleFields(prev => ({ ...prev, brand: e.target.checked }))}
                        className="rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                      />
                      Marca/Empresa
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={labelVisibleFields.name}
                        onChange={(e) => setLabelVisibleFields(prev => ({ ...prev, name: e.target.checked }))}
                        className="rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                      />
                      Nombre Producto
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={labelVisibleFields.price}
                        onChange={(e) => setLabelVisibleFields(prev => ({ ...prev, price: e.target.checked }))}
                        className="rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                      />
                      Precio Venta
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={labelVisibleFields.sku}
                        onChange={(e) => setLabelVisibleFields(prev => ({ ...prev, sku: e.target.checked }))}
                        className="rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                      />
                      SKU Código
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={labelVisibleFields.barcode}
                        onChange={(e) => setLabelVisibleFields(prev => ({ ...prev, barcode: e.target.checked }))}
                        className="rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                      />
                      Código Barras
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={labelVisibleFields.qr}
                        onChange={(e) => setLabelVisibleFields(prev => ({ ...prev, qr: e.target.checked }))}
                        className="rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                      />
                      Código QR
                    </label>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t">
                  <button onClick={() => setShowLabelModal(false)} className="px-4 py-2 border border-slate-350 text-slate-700 font-bold text-xs rounded-lg transition-colors bg-white hover:bg-slate-50">
                    Cancelar
                  </button>
                  <button onClick={handlePrintLabels} className="bg-[#003366] hover:bg-[#002244] text-white font-bold text-xs px-5 py-2 rounded-lg shadow-md transition-colors flex items-center gap-1.5">
                    <Printer className="h-4 w-4" />
                    Mandar a Imprimir
                  </button>
                </div>
              </div>

              {/* Previsualización */}
              <div className="w-full md:w-80 bg-slate-50 border-t md:border-t-0 md:border-l border-slate-200 p-6 flex flex-col items-center justify-center space-y-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Vista Previa</h4>
                {labelSelectedProduct ? (
                  <div className="flex flex-col items-center justify-center p-3 border border-slate-300 rounded bg-white shadow-lg relative overflow-hidden select-none max-w-full" style={{
                    width: `${labelSize === 'custom' ? labelCustomWidth * 3.5 : parseInt(labelSize.split('x')[0]) * 3.5}px`,
                    height: `${labelSize === 'custom' ? labelCustomHeight * 3.5 : parseInt(labelSize.split('x')[1]) * 3.5}px`,
                  }}>
                    {labelVisibleFields.brand && labelBrandText && (
                      <div className="text-[6.5px] font-bold uppercase tracking-wider text-slate-500 line-clamp-1 mb-0.5">{labelBrandText}</div>
                    )}
                    {labelVisibleFields.name && (
                      <div className="text-[7.5px] font-bold text-slate-800 line-clamp-2 text-center leading-normal mb-0.5">{labelSelectedProduct.name}</div>
                    )}
                    {labelVisibleFields.sku && labelSelectedProduct.sku && (
                      <div className="text-[6.5px] font-mono text-slate-400 mb-0.5">SKU: {labelSelectedProduct.sku}</div>
                    )}
                    {labelVisibleFields.barcode && labelSelectedProduct.barcode && (
                      <div className="my-0.5 max-w-full">
                        <BarcodeRenderer value={labelSelectedProduct.barcode} type={barcodeType} height={18} width={1.2} showText={labelVisibleFields.code} />
                      </div>
                    )}
                    {labelVisibleFields.qr && (
                      <div className="my-0.5">
                        <BarcodeRenderer value={JSON.stringify({
                          id: labelSelectedProduct.id,
                          codigo: labelSelectedProduct.barcode || labelSelectedProduct.sku || '',
                          nombre: labelSelectedProduct.name,
                          precio: parseFloat(labelSelectedProduct.price)
                        })} type="qrcode" height={22} />
                      </div>
                    )}
                    {labelVisibleFields.price && (
                      <div className="text-[8.5px] font-extrabold text-[#003366] mt-0.5">RD$ {parseFloat(labelSelectedProduct.price).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-slate-400 text-xs italic">Selecciona un producto...</div>
                )}
                <p className="text-[9px] text-slate-400 text-center max-w-[200px]">
                  Vista escalada. La impresión física se adaptará al tamaño real en milímetros.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Elementos Imprimibles Ocultos */}
      <div className="print-area hidden">
        <style>{`
          @media print {
            body * {
              display: none !important;
            }
            .print-area, .print-area * {
              display: flex !important;
            }
            .print-area {
              position: absolute;
              left: 0;
              top: 0;
              flex-direction: column !important;
              width: 100% !important;
            }
            .label-card {
              width: ${labelSize === 'custom' ? labelCustomWidth : labelSize.split('x')[0]}mm !important;
              height: ${labelSize === 'custom' ? labelCustomHeight : labelSize.split('x')[1]}mm !important;
              padding: 1.5mm;
              box-sizing: border-box;
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              justify-content: center !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              overflow: hidden;
              border: none !important;
              box-shadow: none !important;
              margin: 0 !important;
              text-align: center;
              background: white !important;
            }
          }
        `}</style>
        {getLabelsToRender().map((p, idx) => {
          const qrData = JSON.stringify({
            id: p.id,
            codigo: p.barcode || p.sku || '',
            nombre: p.name,
            precio: parseFloat(p.price)
          });
          
          return (
            <div key={idx} className="label-card">
              {labelVisibleFields.brand && labelBrandText && (
                <div className="text-[7px] font-bold uppercase tracking-wider text-slate-600 line-clamp-1 mb-0.5">{labelBrandText}</div>
              )}
              {labelVisibleFields.name && (
                <div className="text-[8px] font-bold text-slate-900 line-clamp-2 leading-tight mb-0.5">{p.name}</div>
              )}
              {labelVisibleFields.sku && p.sku && (
                <div className="text-[7px] font-mono text-slate-500 mb-0.5">SKU: {p.sku}</div>
              )}
              {labelVisibleFields.barcode && p.barcode && (
                <div className="my-0.5 max-w-full">
                  <BarcodeRenderer value={p.barcode} type={barcodeType} height={18} width={1.2} showText={labelVisibleFields.code} />
                </div>
              )}
              {labelVisibleFields.qr && (
                <div className="my-0.5">
                  <BarcodeRenderer value={qrData} type="qrcode" height={22} />
                </div>
              )}
              {labelVisibleFields.price && (
                <div className="text-[9px] font-extrabold text-[#003366] mt-0.5">RD$ {parseFloat(p.price).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
