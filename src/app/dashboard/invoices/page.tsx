'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/app/dashboard/layout';
import {
  Plus, Search, FileText, Download, Check, RefreshCw, X, Trash2,
  ArrowLeft, Calendar, Filter, Eye, Printer, XCircle, ChevronLeft,
  ChevronRight, ChevronsLeft, ChevronsRight, AlertCircle, Building2, Mail,
  Package, Users, FileMinus, FilePlus, ChevronDown, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import clsx from 'clsx';
import RetentionSelector from '@/components/RetentionSelector';

function InvoicesList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [resendingEmailId, setResendingEmailId] = useState<string | null>(null);
  const [saveDropdownOpen, setSaveDropdownOpen] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Stats
  const [stats, setStats] = useState({ totalMonth: 0, pending: 0 });

  // Form State
  const [ecfType, setEcfType] = useState('31'); // 31 (Fiscal), 32 (Consumo)
  const [paymentType, setPaymentType] = useState<'cash' | 'credit' | 'bank_transfer'>('cash');
  const [bankName, setBankName] = useState('');
  const [transactionNumber, setTransactionNumber] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerRnc, setCustomerRnc] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [dbProducts, setDbProducts] = useState<any[]>([]);
  const [notes, setNotes] = useState('');
  const [modifiedNcf, setModifiedNcf] = useState('');
  const [modifiedInvoiceId, setModifiedInvoiceId] = useState('');
  const [retentions, setRetentions] = useState<any[]>([]);
  const [retentionsEnabled, setRetentionsEnabled] = useState(false);
  const [lines, setLines] = useState<any[]>([
    {
      productId: '',
      productName: '',
      quantity: 1,
      unitPrice: 0,
      discount: 0,
      taxRate: 0.18,
      unitOfMeasure: 'unidad',
      barcode: '',
      priceTier: 'consumidor',
      imageUrl: ''
    },
  ]);
  const [quoteId, setQuoteId] = useState('');

  // Product Search Modal states
  const [productSearchModalOpen, setProductSearchModalOpen] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [modalWarehouseFilter, setModalWarehouseFilter] = useState('');
  const [modalCategoryFilter, setModalCategoryFilter] = useState('');
  const [modalProducts, setModalProducts] = useState<any[]>([]);
  const [modalProductsLoading, setModalProductsLoading] = useState(false);

  // Customer Search Modal states
  const [customerSearchModalOpen, setCustomerSearchModalOpen] = useState(false);
  const [modalCustomerSearch, setModalCustomerSearch] = useState('');
  const [modalCustomers, setModalCustomers] = useState<any[]>([]);
  const [modalCustomersLoading, setModalCustomersLoading] = useState(false);

  // Create Customer Modal states
  const [createCustomerModalOpen, setCreateCustomerModalOpen] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({
    rncCedula: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    status: 'active'
  });
  const [isSearchingRnc, setIsSearchingRnc] = useState(false);
  const [rncVerified, setRncVerified] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  const fetchModalCustomers = useCallback(async (search = '') => {
    setModalCustomersLoading(true);
    try {
      const url = `/api/v1/customers?limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setModalCustomers(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching customers for modal', error);
    } finally {
      setModalCustomersLoading(false);
    }
  }, []);

  const openCustomerSearchModal = () => {
    setModalCustomerSearch('');
    setModalCustomers([]);
    setCustomerSearchModalOpen(true);
    fetchModalCustomers();
  };

  useEffect(() => {
    const delay = setTimeout(() => {
      fetchModalCustomers(modalCustomerSearch);
    }, 450);
    return () => clearTimeout(delay);
  }, [modalCustomerSearch, fetchModalCustomers]);

  const handleNewCustomerSearchDGII = async () => {
    const rnc = newCustomerData.rncCedula.replace(/\D/g, '');
    if (rnc.length !== 9 && rnc.length !== 11) {
      toast.error('El RNC/Cédula debe tener 9 u 11 dígitos');
      return;
    }

    setIsSearchingRnc(true);
    setRncVerified(false);

    try {
      const res = await fetch(`/api/v1/dgii/rnc/${rnc}`);
      const data = await res.json();

      if (data.success && data.name) {
        setNewCustomerData(prev => ({ ...prev, name: data.name }));
        setRncVerified(true);
        toast.success('Contribuyente validado por DGII');
      } else {
        toast.warning(data.message || 'No encontrado en DGII. Puede ingresarlo manual.');
      }
    } catch (error) {
      toast.warning('Servicio DGII inactivo. Ingrese el nombre manualmente.');
    } finally {
      setIsSearchingRnc(false);
    }
  };

  const handleCreateCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerData.name) {
      return toast.error('El nombre o razón social es requerido');
    }

    setIsSavingCustomer(true);
    try {
      const res = await fetch('/api/v1/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCustomerData)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Cliente creado y seleccionado exitosamente');
        setCustomerId(data.data.id);
        setCustomerRnc(data.data.rncCedula || '');
        setCustomerName(data.data.name);

        setCreateCustomerModalOpen(false);
        setNewCustomerData({
          rncCedula: '',
          name: '',
          email: '',
          phone: '',
          address: '',
          status: 'active'
        });
        setRncVerified(false);
      } else {
        toast.error(data.error?.message || 'Error al guardar cliente');
      }
    } catch (err: any) {
      toast.error('Error de red al guardar cliente', { description: err.message });
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const applyCustomer = (cust: any) => {
    setCustomerId(cust.id);
    setCustomerRnc(cust.rncCedula || '');
    setCustomerName(cust.name || '');
    setCustomerSearchModalOpen(false);
  };

  const fetchModalProducts = useCallback(async (search = '', catId = '', whId = '') => {
    setModalProductsLoading(true);
    try {
      let url = `/api/v1/products?per_page=50&search=${encodeURIComponent(search)}`;
      if (catId) url += `&categoryId=${catId}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.data) {
        const productsWithStock = await Promise.all(
          data.data.map(async (prod: any) => {
            try {
              const stockRes = await fetch(`/api/v1/products/${prod.id}/inventory`);
              const stockData = await stockRes.json();
              const inventory = stockData.success ? stockData.data : [];
              return { ...prod, inventory };
            } catch {
              return { ...prod, inventory: [] };
            }
          })
        );
        setModalProducts(productsWithStock);
      }
    } catch (error) {
      console.error('Error fetching modal products', error);
    } finally {
      setModalProductsLoading(false);
    }
  }, []);

  const openProductSearchModal = (lineIdx: number) => {
    setActiveLineIndex(lineIdx);
    setModalWarehouseFilter(warehouseId);
    setModalCategoryFilter('');
    setModalSearchTerm('');
    setProductSearchModalOpen(true);
  };

  useEffect(() => {
    if (productSearchModalOpen) {
      const delayDebounceFn = setTimeout(() => {
        fetchModalProducts(modalSearchTerm, modalCategoryFilter, modalWarehouseFilter);
      }, 300);
      return () => clearTimeout(delayDebounceFn);
    }
  }, [modalSearchTerm, modalCategoryFilter, modalWarehouseFilter, productSearchModalOpen, fetchModalProducts]);

  // Load products, warehouses and categories when form opens
  useEffect(() => {
    async function fetchData() {
      try {
        const [res, whRes, catRes] = await Promise.all([
          fetch('/api/v1/products?per_page=100'),
          fetch('/api/v1/warehouses'),
          fetch('/api/v1/categories')
        ]);
        const data = await res.json();
        const whData = await whRes.json();
        const catData = await catRes.json();
        if (data.success) {
          setDbProducts(data.data || []);
        }
        if (whData.data) {
          setWarehouses(whData.data);
          if (whData.data.length > 0 && !warehouseId) {
            setWarehouseId(whData.data[0].id);
          }
        }
        if (catData.success) {
          setCategories(catData.data || []);
        }
      } catch (error) {
        console.error('Error fetching form data', error);
      }
    }
    if (showForm) {
      fetchData();
    }
  }, [showForm, warehouseId]);

  // Load showForm from query parameter
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setShowForm(true);
    }
    const qid = searchParams.get('quoteId');
    if (qid) {
      setShowForm(true);
      setQuoteId(qid);
      fetch(`/api/v1/quotes/${qid}/convert`, { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.success && data.data) {
            const quote = data.data;
            if (quote.customerId) setCustomerId(quote.customerId);
            if (quote.warehouseId) setWarehouseId(quote.warehouseId);
            if (quote.notes) setNotes(quote.notes);
            if (quote.lines && quote.lines.length > 0) {
              setLines(quote.lines.map((l: any) => ({
                productId: l.productId,
                productName: l.productName || 'Producto Cotizado',
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                discount: l.discount,
                taxRate: 0.18,
                unitOfMeasure: 'unidad'
              })));
            }
          }
        });
    }
  }, [searchParams]);

  // Fetch Current User
  useEffect(() => {
    try {
      const stored = localStorage.getItem('cf_user');
      if (stored) {
        setCurrentUser(JSON.parse(stored));
      }
    } catch(e) {}
    
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/v1/auth/me');
        const data = await res.json();
        if (data.success && data.data?.user) {
          setCurrentUser(data.data.user);
        }
      } catch (err) {}
    };
    fetchUser();
  }, []);

  // Load Invoices
  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        per_page: '10',
      });
      if (statusFilter) queryParams.append('status', statusFilter);
      if (searchTerm) queryParams.append('ncf', searchTerm);
      if (typeFilter) queryParams.append('ecfType', typeFilter);

      const res = await fetch(`/api/v1/invoices?${queryParams.toString()}`);
      const data = await res.json();

      if (data.success) {
        setInvoices(data.data || []);
        setTotalPages(data.pagination?.total_pages || data.meta?.total_pages || 1);
        setTotalRecords(data.pagination?.total || data.meta?.total || 0);

        // Dummy stats calculation for demo based on current page if full stats not in API
        const totalAmount = (data.data || []).reduce((acc: number, inv: any) => acc + parseFloat(inv.total), 0);
        const pendingCount = (data.data || []).filter((i: any) => ['submitted', 'draft', 'signed'].includes(i.status)).length;

        setStats({
          totalMonth: totalAmount || 1200000, // fallback to match design if 0
          pending: pendingCount || 24,
        });
      }
    } catch (error) {
      toast.error('Error al cargar facturas');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, searchTerm, typeFilter]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  // Totals calculations
  const calculateTotals = () => {
    let subtotal = 0;
    let discount = 0;
    let taxes = 0;

    lines.forEach((line) => {
      const lineSub = line.quantity * line.unitPrice;
      const lineDisc = line.quantity * line.discount;
      const taxable = lineSub - lineDisc;
      const taxAmount = taxable * line.taxRate;

      subtotal += lineSub;
      discount += lineDisc;
      taxes += taxAmount;
    });

    const total = subtotal - discount + taxes;

    let totalRetained = 0;
    if (retentionsEnabled) {
      retentions.forEach((ret) => {
        totalRetained += ret.retentionAmount;
      });
    }
    const totalNet = total - totalRetained;

    return { subtotal, discount, taxes, total, totalRetained, totalNet };
  };

  const { subtotal, discount, taxes, total, totalRetained, totalNet } = calculateTotals();

  // Form Operations
  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        productId: '',
        productName: '',
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        taxRate: 0.18,
        unitOfMeasure: 'unidad',
        barcode: '',
        priceTier: 'consumidor',
        imageUrl: ''
      },
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx: number, field: string, value: any) => {
    const updated = [...lines];
    updated[idx][field] = value;
    setLines(updated);
  };

  const handleBarcodeSearch = async (idx: number, barcodeValue: string) => {
    handleLineChange(idx, 'barcode', barcodeValue);
    if (!barcodeValue) return;

    // Search in loaded dbProducts first
    const matched = dbProducts.find(p => p.barcode === barcodeValue);
    if (matched) {
      applyProductToLine(idx, matched);
      return;
    }

    // Call API
    try {
      const res = await fetch(`/api/v1/products?barcode=${encodeURIComponent(barcodeValue)}`);
      const data = await res.json();
      if (data.success && data.data && data.data.length > 0) {
        const prod = data.data[0];
        setDbProducts(prev => {
          if (!prev.some(p => p.id === prod.id)) return [...prev, prod];
          return prev;
        });
        applyProductToLine(idx, prod);
      }
    } catch (e) {
      console.error('Barcode lookup failed', e);
    }
  };

  const applyProductToLine = (idx: number, product: any) => {
    const updated = [...lines];
    updated[idx].productId = product.id;
    updated[idx].productName = product.name;
    updated[idx].unitOfMeasure = product.unitOfMeasure || 'unidad';
    updated[idx].barcode = product.barcode || '';
    updated[idx].imageUrl = product.imageUrl || '';

    const tier = updated[idx].priceTier || 'consumidor';
    if (tier === 'consumidor') {
      updated[idx].unitPrice = parseFloat(product.priceConsumidor) || parseFloat(product.price) || 0;
    } else if (tier === 'proveedor') {
      updated[idx].unitPrice = parseFloat(product.priceProveedor) || parseFloat(product.price) || 0;
    } else if (tier === 'mayorista') {
      updated[idx].unitPrice = parseFloat(product.priceMayorista) || parseFloat(product.price) || 0;
    }
    setLines(updated);
  };

  const handlePriceTierChange = (idx: number, tier: 'consumidor' | 'proveedor' | 'mayorista') => {
    const updated = [...lines];
    updated[idx].priceTier = tier;

    const product = dbProducts.find(p => p.id === updated[idx].productId);
    if (product) {
      if (tier === 'consumidor') {
        updated[idx].unitPrice = parseFloat(product.priceConsumidor) || parseFloat(product.price) || 0;
      } else if (tier === 'proveedor') {
        updated[idx].unitPrice = parseFloat(product.priceProveedor) || parseFloat(product.price) || 0;
      } else if (tier === 'mayorista') {
        updated[idx].unitPrice = parseFloat(product.priceMayorista) || parseFloat(product.price) || 0;
      }
    }
    setLines(updated);
  };

  const handleCreateAdjustmentNote = async (inv: any, noteType: '33' | '34') => {
    try {
      toast.info('Cargando datos del e-CF original...');
      const res = await fetch(`/api/v1/invoices/${inv.id}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al obtener detalles de la factura.');
      }

      const invoice = data.data;

      // Cargar detalles al formulario
      setWarehouseId(invoice.warehouseId || '');
      setEcfType(noteType);
      setPaymentType(invoice.paymentType || 'cash');
      setBankName(invoice.bankName || '');
      setTransactionNumber(invoice.transactionNumber || '');
      setCustomerId(invoice.customerId || '');
      setCustomerRnc(invoice.customerRnc || invoice.buyerRnc || '');
      setCustomerName(invoice.customerName || invoice.buyerName || 'Consumidor Final');
      setNotes(`Nota de ajuste para el e-CF ${invoice.ncf}`);

      // Precargar líneas de productos
      const preloadedLines = invoice.lines.map((line: any) => ({
        productId: line.productId,
        productName: line.productName,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        discount: Number(line.discount || 0),
        taxRate: Number(line.taxRate || 0.18),
      }));
      setLines(preloadedLines);

      setModifiedNcf(invoice.ncf);
      setModifiedInvoiceId(invoice.id);

      setShowForm(true);
      toast.success(`Datos de ${invoice.ncf} cargados para nota de ${noteType === '34' ? 'crédito' : 'débito'}`);
    } catch (err: any) {
      toast.error('Error al iniciar nota de ajuste', { description: err.message });
    }
  };

  const resetForm = () => {
    setCustomerId(''); setCustomerRnc(''); setCustomerName('');
    setBankName(''); setTransactionNumber('');
    setNotes('');
    setModifiedNcf(''); setModifiedInvoiceId('');
    setLines([{ productId: '', productName: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 0.18, unitOfMeasure: 'unidad', barcode: '', priceTier: 'consumidor', imageUrl: '' }]);
    setQuoteId('');
  };

  const buildInvoicePayload = () => ({
    customerId: customerId || undefined,
    warehouseId,
    ecfType,
    paymentType,
    bankName: paymentType === 'bank_transfer' ? bankName : undefined,
    transactionNumber: paymentType === 'bank_transfer' ? transactionNumber : undefined,
    notes: notes || undefined,
    modifiedNcf: modifiedNcf || undefined,
    modifiedInvoiceId: modifiedInvoiceId || undefined,
    quoteId: quoteId || undefined,
    buyerRnc: customerRnc || undefined,
    buyerName: customerName || undefined,
    lines: lines.map(l => ({
      productId: l.productId,
      productName: l.productName,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discount,
      taxRate: l.taxRate,
    })),
  });

  const validateFormBasic = () => {
    if ((ecfType === '31' || ecfType === '45') && (!customerRnc || !customerName)) {
      throw new Error('El RNC y la Razón Social del cliente son requeridos para Crédito Fiscal (e-31) o Comprobantes Gubernamentales (e-45).');
    }
    if (lines.some((l) => !l.productName)) {
      throw new Error('Todos los artículos deben tener un nombre.');
    }
    if (!warehouseId) {
      throw new Error('Debe seleccionar un almacén.');
    }
  };

  // Handler: Save as Draft
  const handleSaveDraft = async () => {
    setSaveDropdownOpen(false);
    setSavingDraft(true);
    try {
      validateFormBasic();
      const res = await fetch('/api/v1/invoices/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildInvoicePayload()),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Error al guardar borrador.');
      }
      toast.success('Factura guardada en Borrador', {
        description: `Código: ${data.data.codigoFactura}. Puedes emitirla más tarde.`
      });
      setShowForm(false);
      router.replace('/dashboard/invoices');
      resetForm();
      loadInvoices();
    } catch (error: any) {
      toast.error('Error al guardar borrador', { description: error.message });
    } finally {
      setSavingDraft(false);
    }
  };

  const handleIssueInvoice = async (e: React.FormEvent, postAction?: 'print' | 'email') => {
    e.preventDefault();
    setSaveDropdownOpen(false);
    setSubmitting(true);

    try {
      if ((ecfType === '31' || ecfType === '45') && (!customerRnc || !customerName)) {
        throw new Error('El RNC y la Razón Social del cliente son requeridos para Crédito Fiscal (e-31) o Comprobantes Gubernamentales (e-45).');
      }
      if (lines.some((l) => !l.productName)) {
        throw new Error('Todos los artículos deben tener un nombre.');
      }

      const isNote = ecfType === '33' || ecfType === '34';
      const linesToSubmit = lines.map((l: any) => ({
        productId: l.productId,
        productName: l.productName,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        taxRate: l.taxRate,
      }));

      const res = await fetch('/api/v1/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customerId || undefined,
          warehouseId,
          ecfType,
          paymentType,
          bankName: paymentType === 'bank_transfer' ? bankName : undefined,
          transactionNumber: paymentType === 'bank_transfer' ? transactionNumber : undefined,
          notes: notes || undefined,
          modifiedNcf: isNote ? modifiedNcf : undefined,
          modifiedInvoiceId: isNote ? modifiedInvoiceId : undefined,
          quoteId: quoteId || undefined,
          lines: linesToSubmit,
          retentions: retentionsEnabled ? retentions : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.error?.code === 'MSELLER_COMMUNICATION_ERROR') {
          const proceed = window.confirm(
            'Hubo un error de comunicación con la DGII (a través de MSeller).\n\n¿Desea continuar emitiendo la factura localmente para transmitirla de manera automática más tarde?'
          );
          if (proceed) {
            const retryRes = await fetch('/api/v1/invoices', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customerId: customerId || undefined,
                warehouseId,
                ecfType,
                paymentType,
                bankName: paymentType === 'bank_transfer' ? bankName : undefined,
                transactionNumber: paymentType === 'bank_transfer' ? transactionNumber : undefined,
                ignoreCommunicationError: true,
                notes: notes || undefined,
                modifiedNcf: modifiedNcf || undefined,
                modifiedInvoiceId: modifiedInvoiceId || undefined,
                lines: linesToSubmit,
                retentions: retentionsEnabled ? retentions : undefined,
              }),
            });
            const retryData = await retryRes.json();
            if (!retryRes.ok || !retryData.success) {
              throw new Error(retryData.error?.message || 'Error al emitir factura localmente.');
            }
            toast.success('Documento e-CF emitido localmente', {
              description: `Registrado fuera de línea con NCF: ${retryData.data.ncf}. Pendiente de envío.`
            });

            setShowForm(false);
            router.replace('/dashboard/invoices');
            resetForm();
            loadInvoices();
            return;
          } else {
            return;
          }
        }
        throw new Error(data.error?.message || 'Error al emitir factura.');
      }

      toast.success('Comprobante e-CF emitido y firmado', {
        description: `NCF: ${data.data.ncf}`
      });

      const invoiceId = data.data.id;

      setShowForm(false);
      router.replace('/dashboard/invoices');
      resetForm();
      loadInvoices();

      // Post-action: print or email
      if (postAction === 'print') {
        setTimeout(() => {
          window.open(`/api/v1/invoices/${invoiceId}/print`, '_blank');
        }, 500);
      } else if (postAction === 'email') {
        if (!data.data.customerId) {
          toast.warning('No se puede enviar correo', { description: 'La factura no tiene un cliente con correo asociado.' });
        } else {
          try {
            const emailRes = await fetch(`/api/v1/invoices/${invoiceId}/email`, { method: 'POST' });
            const emailData = await emailRes.json();
            if (emailRes.ok && emailData.success) {
              toast.success('Correo enviado', { description: emailData.message });
            } else {
              toast.error('Error al enviar correo', { description: emailData.error?.message });
            }
          } catch {
            toast.error('Error de red al enviar el correo.');
          }
        }
      }
    } catch (error: any) {
      toast.error('Error de emisión', { description: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const viewInvoiceDetails = async (inv: any) => {
    try {
      const res = await fetch(`/api/v1/invoices/${inv.id}`);
      const data = await res.json();
      if (data.success) {
        setSelectedInvoice(data.data);
      }
    } catch (error) {
      toast.error('No se pudieron obtener los detalles de la factura.');
    }
  };

  const handleDownloadPdf = (inv: any) => {
    window.open(`/api/v1/invoices/${inv.id}/pdf`, '_blank');
  };

  const handleResendEmail = async (invoiceId: string) => {
    setResendingEmailId(invoiceId);
    try {
      const res = await fetch(`/api/v1/invoices/${invoiceId}/email`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Correo reenviado exitosamente.');
      } else {
        toast.error(data.error?.message || 'Error al reenviar el correo.');
      }
    } catch (error) {
      toast.error('Error de red al intentar reenviar el correo.');
    } finally {
      setResendingEmailId(null);
    }
  };

  // Status mapping matching the Stitch design
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted': return { label: 'ACEPTADO', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' };
      case 'signed': return { label: 'FIRMADO', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' };
      case 'submitted': return { label: 'ENVIADO', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', dot: 'bg-blue-500' };
      case 'rejected': return { label: 'RECHAZADO', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20', dot: 'bg-rose-500', icon: <XCircle className="w-3 h-3 mr-1" /> };
      case 'draft': return { label: 'BORRADOR', cls: 'bg-slate-500/10 text-on-surface-variant/80 border-slate-500/20', dot: 'bg-slate-500' };
      default: return { label: status.toUpperCase(), cls: 'bg-slate-500/10 text-on-surface-variant/80 border-slate-500/20', dot: 'bg-slate-500' };
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case '31': return 'Crédito Fiscal';
      case '32': return 'Consumo';
      case '33': return 'Nota de Débito';
      case '34': return 'Nota de Crédito';
      case '45': return 'Gubernamental';
      default: return `Tipo ${type}`;
    }
  };

  return (

    <div className=" pb-12 max-w-7xl mx-10 w-280">
      <AnimatePresence mode="wait">
        {showForm ? (
          /* ==============================================================================
             EMIT INVOICE FORM (Preserved & Styled)
             ============================================================================== */
          <motion.div
            key="form"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xl space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-5 gap-4">
              <div>
                <button onClick={() => { setShowForm(false); router.replace('/dashboard/invoices'); }} className="flex items-center gap-1.5 text-xs font-semibold text-[#C5A059] hover:text-[#b08c4a] mb-2 transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                  Volver al listado
                </button>
                <h2 className="text-2xl font-bold text-[#003366] tracking-tight">Nueva Factura e-CF</h2>
                <p className="text-on-surface-variant/80 text-sm mt-1">Complete los datos para emitir y firmar electrónicamente.</p>
              </div>
            </div>

            <form onSubmit={handleIssueInvoice} className="space-y-8">
              {/* General Settings */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50/40 p-6 rounded-xl border border-slate-200">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider">Almacén Origen</label>
                  <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    required
                    className="w-full rounded-lg bg-white border border-slate-300 py-3 px-4 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all"
                  >
                    <option value="">Seleccione...</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider">Tipo de e-CF</label>
                  <select
                    value={ecfType}
                    onChange={(e) => setEcfType(e.target.value)}
                    className="w-full rounded-lg bg-white border border-slate-300 py-3 px-4 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all"
                  >
                    <option value="31">e-31 Factura de Crédito Fiscal</option>
                    <option value="32">e-32 Factura de Consumo</option>
                    <option value="45">e-45 Comprobante Gubernamental</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider">Método de Pago</label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as any)}
                    className="w-full rounded-lg bg-white border border-slate-300 py-3 px-4 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all"
                  >
                    <option value="cash">Efectivo / Caja</option>
                    <option value="credit">Crédito </option>
                    <option value="bank_transfer">Transferencia Bancaria</option>
                  </select>
                </div>
                {paymentType === 'bank_transfer' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 col-span-1 md:col-span-3 bg-[#003366]/5 p-4 rounded-xl border border-[#003366]/10 mt-2">
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-[#003366] uppercase tracking-wider">Banco</label>
                      <select
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        required
                        className="w-full rounded-lg bg-white border border-slate-300 py-3 px-4 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all"
                      >
                        <option value="">Seleccione Banco...</option>
                        <option value="Banco Popular Dominicano">Banco Popular Dominicano</option>
                        <option value="Banco de Reservas">Banco de Reservas (Banreservas)</option>
                        <option value="Banco BHD">Banco BHD</option>
                        <option value="Asociación Popular de Ahorros y Préstamos">Asociación Popular (APAP)</option>
                        <option value="Banco Scotiabank">Banco Scotiabank</option>
                        <option value="Banco Promerica">Banco Promerica</option>
                        <option value="Banco Santa Cruz">Banco Santa Cruz</option>
                        <option value="Otro">Otro / Internacional</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-[#003366] uppercase tracking-wider">Número de Transferencia / Referencia</label>
                      <input
                        type="text"
                        required
                        value={transactionNumber}
                        onChange={(e) => setTransactionNumber(e.target.value)}
                        placeholder="Ej. TXN12345678"
                        className="w-full rounded-lg bg-white border border-slate-300 py-3 px-4 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all"
                      />
                    </div>
                  </div>
                )}
                {modifiedNcf && (
                  <div className="space-y-2 col-span-1 md:col-span-3 bg-amber-50 p-4 rounded-xl border border-amber-200 flex items-center justify-between mt-2">
                    <div>
                      <span className="block text-xs font-bold text-amber-800 uppercase tracking-wider">Documento Modificado (Referencia)</span>
                      <span className="text-sm font-mono font-bold text-amber-950">eNCF Original: {modifiedNcf}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setModifiedNcf(''); setModifiedInvoiceId(''); }}
                      className="text-xs text-rose-600 font-bold hover:underline"
                    >
                      Remover Referencia
                    </button>
                  </div>
                )}
              </div>

              {/* Customer Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/40 p-6 rounded-xl border border-slate-200">
                <div className="col-span-1 md:col-span-2 flex items-center justify-between border-b border-slate-200/55 pb-3 gap-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-[#C5A059]" />
                    <div>
                      <h4 className="text-[#003366] font-semibold text-base">Datos del Cliente</h4>
                      <p className="text-xs text-on-surface-variant/80">Requerido para crédito fiscal (e-31)</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={openCustomerSearchModal}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-bold text-[#003366] transition-all"
                    >
                      <Search className="h-3.5 w-3.5" />
                      Buscar Cliente
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateCustomerModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 border border-amber-600 rounded-lg text-xs font-bold text-slate-900 transition-all shadow-sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Nuevo Cliente
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider">RNC o Cédula</label>
                  <input
                    type="text"
                    value={customerRnc}
                    onChange={(e) => setCustomerRnc(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-lg bg-white border border-slate-300 py-3 px-4 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all placeholder:text-on-surface-variant/80"
                    placeholder="Ej: 131002002"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider">Razón Social</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-lg bg-white border border-slate-300 py-3 px-4 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all placeholder:text-on-surface-variant/80"
                    placeholder="Ej: Distribuidora Comercial S.A."
                  />
                </div>
              </div>

              {/* Item Lines */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[#003366] font-semibold text-base">Artículos / Servicios</h4>
                </div>

                <div className="space-y-3">
                  {lines.map((line, idx) => {
                    const lineSubtotal = line.quantity * line.unitPrice;
                    const lineDiscount = line.quantity * (line.discount || 0);
                    const lineTaxable = lineSubtotal - lineDiscount;
                    const lineTax = lineTaxable * line.taxRate;
                    const lineTotal = lineTaxable + lineTax;
                    const hasProduct = !!line.productId;

                    return (
                      <div key={idx} className="flex flex-col gap-4 bg-slate-50/60 p-4 rounded-xl border border-slate-200">
                        {/* Upper row: Selection, Name, Barcode & Image Preview */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 w-full">

                          {/* Image preview (if exists) */}
                          <div className="md:col-span-1 flex items-center justify-center bg-white border border-slate-200 rounded-lg h-[42px] w-[42px] overflow-hidden self-end">
                            {line.imageUrl ? (
                              <img src={line.imageUrl} alt="preview" className="h-full w-full object-cover" />
                            ) : (
                              <FileText className="h-5 w-5 text-on-surface-variant/80" />
                            )}
                          </div>

                          {/* Product Selection / Custom Name */}
                          <div className="md:col-span-6 space-y-1.5">
                            <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Producto o Servicio</label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => openProductSearchModal(idx)}
                                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-bold text-[#003366] transition-all"
                              >
                                <Search className="h-3.5 w-3.5" />
                                Buscar
                              </button>
                              <input
                                type="text"
                                value={line.productName}
                                onChange={(e) => handleLineChange(idx, 'productName', e.target.value)}
                                className="flex-1 rounded-lg bg-white border border-slate-300 py-2 px-3 text-[#003366] focus:border-[#C5A059] outline-none text-xs transition-all"
                                placeholder="Nombre del producto o servicio"
                                required
                              />
                            </div>
                          </div>

                          {/* Barcode input */}
                          <div className="md:col-span-3 space-y-1.5">
                            <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Código de Barras</label>
                            <input
                              type="text"
                              value={line.barcode || ''}
                              onChange={(e) => handleBarcodeSearch(idx, e.target.value)}
                              className="w-full rounded-lg bg-white border border-slate-300 py-2 px-3 text-[#003366] focus:border-[#C5A059] outline-none text-xs transition-all"
                              placeholder="Escanear o ingresar"
                            />
                          </div>

                          {/* Unit of measure */}
                          <div className="md:col-span-2 space-y-1.5">
                            <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Medida</label>
                            <select
                              value={line.unitOfMeasure || 'unidad'}
                              onChange={(e) => handleLineChange(idx, 'unitOfMeasure', e.target.value)}
                              disabled={!hasProduct}
                              className={`w-full rounded-lg border py-2 px-3 outline-none text-xs transition-all ${!hasProduct ? 'bg-slate-100 border-slate-300 text-[#003366]/50 cursor-not-allowed' : 'bg-white border-slate-300 text-[#003366] focus:border-[#C5A059]'}`}
                            >
                              <option value="unidad">Unidad</option>
                              <option value="pie">Pie</option>
                              <option value="pieza">Pieza</option>
                              <option value="centimetro">Centímetro</option>
                              <option value="plancha">Plancha</option>
                              <option value="otro">Otro</option>
                            </select>
                          </div>
                        </div>

                        {/* Lower row: Quantities, Price tier, unitPrice, discount, taxRate, calculated total & delete button */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 w-full items-end">
                          <div className="md:col-span-1 space-y-1.5">
                            <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Cant.</label>
                            <input
                              type="number"
                              value={line.quantity}
                              onChange={(e) => handleLineChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              disabled={!hasProduct}
                              className={`w-full rounded-lg border py-2.5 px-2 outline-none text-xs transition-all ${!hasProduct ? 'bg-slate-100 border-slate-300 text-[#003366]/50 cursor-not-allowed' : 'bg-white border-slate-300 text-[#003366] focus:border-[#C5A059]'}`}
                              min={0.0001} step="any" required
                            />
                          </div>

                          <div className="md:col-span-2 space-y-1.5">
                            <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Nivel de Precio</label>
                            <select
                              value={line.priceTier || 'consumidor'}
                              onChange={(e) => handlePriceTierChange(idx, e.target.value as any)}
                              disabled={!hasProduct}
                              className={`w-full rounded-lg border py-2 px-2 outline-none text-xs transition-all ${!hasProduct ? 'bg-slate-100 border-slate-300 text-[#003366]/50 cursor-not-allowed' : 'bg-white border-slate-300 text-[#003366] focus:border-[#C5A059]'}`}
                            >
                              <option value="consumidor">Consumidor (P1)</option>
                              <option value="proveedor">Proveedor (P2)</option>
                              <option value="mayorista">Mayorista (P3)</option>
                            </select>
                          </div>

                          <div className="md:col-span-2 space-y-1.5">
                            <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Precio Unit.</label>
                            <input
                              type="number"
                              value={line.unitPrice}
                              readOnly
                              className="w-full rounded-lg bg-slate-100 border border-slate-300 py-2.5 px-2 text-[#003366]/70 cursor-not-allowed outline-none text-xs transition-all"
                              min={0} step="any" required
                            />
                          </div>

                          <div className="md:col-span-2 space-y-1.5">
                            <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Desc. Unit.</label>
                            {(() => {
                              const userRole = currentUser?.roleName?.toLowerCase() || currentUser?.role?.toLowerCase() || '';
                              const canEditDiscount = userRole === 'admin' || userRole === 'sistema';
                              const isDisabled = !hasProduct || !canEditDiscount;
                              
                              return (
                                <div>
                                  <input
                                    type="number"
                                    value={line.discount || 0}
                                    onChange={(e) => handleLineChange(idx, 'discount', parseFloat(e.target.value) || 0)}
                                    disabled={isDisabled}
                                    className={`w-full rounded-lg border py-2.5 px-2 outline-none text-xs transition-all ${isDisabled ? 'bg-slate-100 border-slate-300 text-[#003366]/50 cursor-not-allowed' : 'bg-white border-slate-300 text-[#003366] focus:border-[#C5A059]'}`}
                                    min={0} step="any"
                                    title={!canEditDiscount ? "Solo administradores pueden modificar el descuento" : ""}
                                  />
                                  {!canEditDiscount && (
                                    <p className="text-[9px] text-red-500 mt-0.5">Solo admin</p>
                                  )}
                                </div>
                              );
                            })()}
                          </div>

                          <div className="md:col-span-2 space-y-1.5">
                            <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">ITBIS (Tasa)</label>
                            <select
                              value={line.taxRate}
                              onChange={(e) => handleLineChange(idx, 'taxRate', parseFloat(e.target.value))}
                              disabled={!hasProduct}
                              className={`w-full rounded-lg border py-2.5 px-2 outline-none text-xs transition-all ${!hasProduct ? 'bg-slate-100 border-slate-300 text-[#003366]/50 cursor-not-allowed' : 'bg-white border-slate-300 text-[#003366] focus:border-[#C5A059]'}`}
                            >
                              <option value="0.18">18% ITBIS</option>
                              <option value="0.16">16% ITBIS</option>
                              <option value="0.00">0% Exento</option>
                            </select>
                          </div>

                          <div className="md:col-span-2 space-y-1.5">
                            <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider">Total Fila</label>
                            <input
                              type="text"
                              value={`RD$ ${lineTotal.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                              disabled
                              className="w-full rounded-lg bg-slate-100 border border-slate-200 py-2.5 px-2 text-[#003366] text-xs font-semibold"
                            />
                          </div>

                          <div className="md:col-span-1 flex justify-end">
                            <button type="button" onClick={() => handleRemoveLine(idx)} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-start mt-2">
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="text-xs text-[#C5A059] font-bold hover:text-[#b08c4a] flex items-center gap-1.5 bg-[#C5A059]/10 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar Fila
                  </button>
                </div>
              </div>

              {/* Notas de la Factura */}
              <div className="bg-slate-50/40 p-6 rounded-xl border border-slate-200 space-y-2">
                <label className="block text-xs font-semibold text-on-surface-variant/80 uppercase tracking-wider">Notas de la Factura</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: Términos de pago, garantía, o cualquier otra observación que aparecerá en la factura impresa..."
                  rows={3}
                  className="w-full rounded-lg bg-white border border-slate-300 py-3 px-4 text-[#003366] focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059] outline-none text-sm transition-all resize-y placeholder:text-slate-400"
                />
              </div>

              {/* Retenciones Fiscales */}
              <RetentionSelector
                subtotal={subtotal}
                discount={discount}
                itbis={taxes}
                defaultRnc={customerRnc}
                onChange={(applied, enabled) => {
                  setRetentions(applied);
                  setRetentionsEnabled(enabled);
                }}
              />

              {/* Calculation Summary & Submit */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-t border-slate-200 pt-8">
                <div className="bg-slate-50/60 p-5 rounded-xl border border-slate-200 w-full md:max-w-sm space-y-2 text-sm text-slate-700">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-[#003366]">RD$ {subtotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Descuento:</span>
                    <span className="font-semibold text-[#003366]">RD$ {discount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-on-surface-variant/80">
                    <span>Impuestos (ITBIS):</span>
                    <span className="font-semibold text-[#003366]">RD$ {taxes.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-3 mt-3 text-lg font-bold">
                    <span className="text-[#003366]">Total Bruto:</span>
                    <span className="text-[#003366]">RD$ {total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {retentionsEnabled && totalRetained > 0 && (
                    <>
                      <div className="flex justify-between text-orange-600 text-sm">
                        <span>Total Retenido:</span>
                        <span className="font-semibold">- RD$ {totalRetained.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between border-t border-orange-200 pt-3 mt-1 text-lg font-bold">
                        <span className="text-emerald-700">Total Neto a Cobrar:</span>
                        <span className="text-emerald-500">RD$ {totalNet.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  )}
                  {(!retentionsEnabled || totalRetained === 0) && (
                    <div className="flex justify-between border-t border-slate-200 pt-1 mt-1 text-lg font-bold">
                      <span className="text-[#003366]">Total General:</span>
                      <span className="text-emerald-400">RD$ {total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-4 w-full md:w-auto">
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); router.replace('/dashboard/invoices'); }}
                    className="rounded-xl border border-slate-300 bg-transparent px-6 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-100 hover:text-[#003366] transition-all text-center"
                  >
                    Cancelar
                  </button>

                  {/* Save Draft button */}
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={savingDraft || submitting}
                    className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-all"
                    title="Guardar como Borrador (sin emitir NCF)"
                  >
                    {savingDraft ? (
                      <><RefreshCw className="h-4 w-4 animate-spin" /> Guardando...</>
                    ) : (
                      <><Save className="h-4 w-4" /> Guardar Borrador</>
                    )}
                  </button>

                  {/* Split Emit Button */}
                  <div className="relative flex">
                    {/* Main action: Emitir Comprobante */}
                    <button
                      type="submit"
                      disabled={submitting || savingDraft}
                      onClick={(e) => { setSaveDropdownOpen(false); }}
                      className="flex items-center justify-center gap-2 rounded-l-xl bg-[#C5A059] px-7 py-3.5 text-sm font-bold text-slate-950 hover:bg-[#b08c4a] disabled:opacity-50 transition-all shadow-lg shadow-[#C5A059]/20 active:scale-[0.98] border-r border-[#a88840]"
                    >
                      {submitting ? (
                        <><RefreshCw className="h-4 w-4 animate-spin" /> Procesando...</>
                      ) : (
                        <><Check className="h-4 w-4" /> Emitir Comprobante</>
                      )}
                    </button>
                    {/* Dropdown toggle */}
                    <button
                      type="button"
                      disabled={submitting || savingDraft}
                      onClick={(e) => { e.stopPropagation(); setSaveDropdownOpen(v => !v); }}
                      className="flex items-center justify-center rounded-r-xl bg-[#C5A059] px-3 py-3.5 text-slate-950 hover:bg-[#b08c4a] disabled:opacity-50 transition-all shadow-lg shadow-[#C5A059]/20 active:scale-[0.98]"
                      title="Más opciones"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>

                    {/* Dropdown menu */}
                    <AnimatePresence>
                      {saveDropdownOpen && (
                        <>
                          {/* Backdrop to close */}
                          <div
                            className="fixed inset-0 z-30"
                            onClick={() => setSaveDropdownOpen(false)}
                          />
                          <motion.div
                            initial={{ opacity: 0, y: -6, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -6, scale: 0.97 }}
                            transition={{ duration: 0.15 }}
                            className="absolute bottom-full right-0 mb-2 z-40 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden min-w-[230px]"
                          >
                            <div className="px-3 py-2 border-b border-slate-100">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Opciones de Guardado</p>
                            </div>
                            {/* Option 1: Emitir e Imprimir */}
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => {
                                setSaveDropdownOpen(false);
                                const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                                handleIssueInvoice(fakeEvent, 'print');
                              }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-amber-50 transition-colors text-left"
                            >
                              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                                <Printer className="h-4 w-4 text-amber-700" />
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800">Emitir e Imprimir</p>
                                <p className="text-xs text-slate-500">Emite el e-CF y abre el PDF automáticamente</p>
                              </div>
                            </button>
                            {/* Option 2: Emitir y Enviar por Correo */}
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={(e) => {
                                setSaveDropdownOpen(false);
                                const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                                handleIssueInvoice(fakeEvent, 'email');
                              }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-blue-50 transition-colors text-left"
                            >
                              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                <Mail className="h-4 w-4 text-blue-700" />
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800">Emitir y Enviar por Correo</p>
                                <p className="text-xs text-slate-500">Emite el e-CF y lo envía al correo del cliente</p>
                              </div>
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </form>
          </motion.div>
        ) : (
          /* ==============================================================================
             INVOICE LIST (Stitch Design Adapted)
             ============================================================================== */
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Header & Stats Row */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-2">
              <div>
                <nav className="flex items-center gap-2 text-on-surface-variant/80 font-medium text-xs mb-2">
                  <span>Facturación</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                  <span className="text-[#C5A059] font-bold">Listado e-CF</span>
                </nav>
                <h1 className="text-3xl md:text-4xl font-bold text-[#003366] tracking-tight">Comprobantes Electrónicos</h1>
                <div className="mt-3 flex items-center gap-2 bg-[#003366]/5 border border-[#003366]/10 px-3 py-1.5 rounded-full w-fit">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-xs font-bold text-[#003366] uppercase tracking-wider">Powered by MSeller API</span>
                </div>
                <p className="text-on-surface-variant/80 text-sm mt-1.5">Gestione y rastree sus documentos fiscales electrónicos autorizados.</p>
              </div>

              <div className="flex gap-4 w-full md:w-auto">
                <div className="bg-white border border-slate-200 rounded-xl p-4 min-w-[140px] shadow-lg flex-1 md:flex-none">
                  <span className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1">Total Mes</span>
                  <span className="block font-mono text-xl md:text-2xl font-bold text-[#003366]">RD$ {(stats.totalMonth / 1000000).toFixed(1)}M</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 min-w-[140px] shadow-lg flex-1 md:flex-none relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-[#C5A059]" />
                  <span className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1">Pendientes DGII</span>
                  <span className="block font-mono text-xl md:text-2xl font-bold text-[#C5A059]">{stats.pending}</span>
                </div>
              </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 md:p-5 flex flex-col md:flex-row flex-wrap items-end gap-4 shadow-lg">
              <div className="flex-1 min-w-[200px] w-full">
                <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5">Rango de Fechas</label>
                <div className="relative">
                  <input
                    type="text"
                    value="Mes Actual"
                    disabled
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-700 opacity-70 cursor-not-allowed"
                  />
                  <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/80" />
                </div>
              </div>

              <div className="w-full md:w-[180px]">
                <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5">Tipo de e-CF</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-[#003366] focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059] outline-none transition-all appearance-none"
                >
                  <option value="">Todos los Tipos</option>
                  <option value="31">Factura Crédito Fiscal (31)</option>
                  <option value="32">Factura Consumo (32)</option>
                  <option value="33">Nota Débito (33)</option>
                  <option value="34">Nota Crédito (34)</option>
                  <option value="45">Gubernamental (45)</option>
                </select>
              </div>

              <div className="w-full md:w-[180px]">
                <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5">Estado</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-[#003366] focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059] outline-none transition-all appearance-none"
                >
                  <option value="">Todos los Estados</option>
                  <option value="draft">Borrador</option>
                  <option value="submitted">Transmitido (En Cola)</option>
                  <option value="accepted">Aceptado DGII</option>
                  <option value="rejected">Rechazado</option>
                </select>
              </div>

              <div className="flex-1 min-w-[240px] w-full">
                <label className="block text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5">Buscar Cliente / NCF</label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Ej: E3100... o RNC"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#003366] placeholder:text-on-surface-variant/80 focus:ring-1 focus:ring-[#C5A059] focus:border-[#C5A059] outline-none transition-all"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/70" />
                </div>
              </div>

              <button
                onClick={loadInvoices}
                className="w-full md:w-auto bg-slate-100 text-[#003366] px-6 py-2.5 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors h-[42px] flex items-center justify-center gap-2 border border-slate-300"
              >
                <Filter className="h-4 w-4" />
                FILTRAR
              </button>
            </div>

            {/* Data Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/80 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">Fecha</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">Comprobante / Tipo</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Cliente</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest text-right">Monto Total</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest text-center">Estado DGII</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest text-center">MSeller Info</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20/80">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center justify-center gap-3">
                            <RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" />
                            <span className="text-on-surface-variant/80 text-sm font-medium">Cargando facturas electrónicas...</span>
                          </div>
                        </td>
                      </tr>
                    ) : invoices.length > 0 ? (
                      invoices.map((inv) => {
                        const badge = getStatusBadge(inv.status);
                        return (
                          <motion.tr
                            key={inv.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="hover:bg-[#C5A059]/5 transition-colors group"
                          >
                            <td className="px-6 py-4 align-top">
                              <span className="font-mono text-sm text-slate-700">
                                {new Date(inv.createdAt).toISOString().split('T')[0]}
                              </span>
                            </td>
                            <td className="px-6 py-4 align-top">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-mono font-bold text-[#b08c4a] group-hover:text-[#9a7a3e] transition-colors">
                                  {inv.ncf || `e-${inv.ecfType}`}
                                </span>
                                <span className="text-xs text-on-surface-variant/70">
                                  {getTypeLabel(inv.ecfType)}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 align-top">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-[#003366] truncate max-w-[200px] md:max-w-xs">
                                  {inv.buyerName || 'Consumidor Final'}
                                </span>
                                {inv.buyerRnc && (
                                  <span className="text-xs text-on-surface-variant/70 font-mono">
                                    RNC/Cédula: {inv.buyerRnc}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 align-top text-right">
                              <span className="font-mono font-bold text-[#003366]">
                                RD$ {parseFloat(inv.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="px-6 py-4 align-top text-center">
                              <span className={clsx('inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border', badge.cls)}>
                                {badge.icon || <span className={clsx('w-1.5 h-1.5 rounded-full mr-1.5', badge.dot)} />}
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-6 py-4 align-top text-center text-xs">
                              <div className="flex flex-col gap-1 items-center">
                                {inv.msellerTrackId && (
                                  <span className="text-[10px] font-mono bg-slate-100 text-on-surface-variant/80 px-1.5 py-0.5 rounded border border-slate-200" title="Track ID">
                                    {inv.msellerTrackId}
                                  </span>
                                )}
                                {inv.dgiiMessage && (
                                  <span className="text-[10px] text-emerald-600 font-semibold max-w-[120px] truncate" title={inv.dgiiMessage}>
                                    {inv.dgiiMessage}
                                  </span>
                                )}
                                {(!inv.msellerTrackId && !inv.dgiiMessage) && <span className="text-on-surface-variant">-</span>}
                              </div>
                            </td>
                            <td className="px-6 py-4 align-top text-right">
                              <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => viewInvoiceDetails(inv)}
                                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-on-surface-variant/80 hover:text-[#003366]"
                                  title="Ver Detalles"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDownloadPdf(inv)}
                                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-on-surface-variant/80 hover:text-[#003366]"
                                  title="Descargar PDF"
                                >
                                  <Printer className="h-4 w-4" />
                                </button>
                                {inv.customerId && (
                                  <button
                                    onClick={() => handleResendEmail(inv.id)}
                                    disabled={resendingEmailId === inv.id}
                                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-on-surface-variant/80 hover:text-[#003366] disabled:opacity-40"
                                    title="Reenviar Correo"
                                  >
                                    {resendingEmailId === inv.id ? (
                                      <RefreshCw className="h-4 w-4 animate-spin text-[#C5A059]" />
                                    ) : (
                                      <Mail className="h-4 w-4" />
                                    )}
                                  </button>
                                )}
                                {inv.status === 'draft' && (
                                  <button className="p-2 hover:bg-rose-500/20 rounded-lg transition-colors text-rose-500" title="Eliminar Borrador">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <AlertCircle className="h-8 w-8 text-on-surface-variant/80" />
                            <span className="text-on-surface-variant/80 text-sm">No se encontraron facturas con los filtros actuales.</span>
                            <button
                              onClick={() => { setSearchTerm(''); setStatusFilter(''); setTypeFilter(''); }}
                              className="mt-2 text-[#C5A059] hover:text-[#b08c4a] text-xs font-bold"
                            >
                              Limpiar Filtros
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div className="bg-slate-50/80 px-6 py-4 flex flex-col md:flex-row items-center justify-between border-t border-slate-200 gap-4">
                <div className="text-xs text-on-surface-variant/70 font-medium">
                  Mostrando página <span className="text-[#003366]">{page}</span> de <span className="text-[#003366]">{totalPages}</span>
                  {' '}({totalRecords} registros en total)
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage(1)} disabled={page === 1}
                    className="p-1.5 rounded-lg text-on-surface-variant/80 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="p-1.5 rounded-lg text-on-surface-variant/80 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {/* Simplified page numbers (just current around) */}
                  <div className="flex gap-1 mx-2">
                    <button className="w-8 h-8 rounded-lg bg-[#C5A059] text-slate-950 font-bold text-xs flex items-center justify-center">
                      {page}
                    </button>
                  </div>

                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                    className="p-1.5 rounded-lg text-on-surface-variant/80 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage(totalPages)} disabled={page >= totalPages}
                    className="p-1.5 rounded-lg text-on-surface-variant/80 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button for New Invoice */}
      {!showForm && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowForm(true)}
          className="fixed bottom-8 right-8 md:bottom-12 md:right-12 w-14 h-14 bg-[#C5A059] text-slate-950 rounded-full shadow-xl shadow-[#C5A059]/20 flex items-center justify-center z-40"
          title="Nueva Factura e-CF"
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </motion.button>
      )}

      {/* ==============================================================================
            INVOICE DETAILS MODAL
            ============================================================================== */}
      <AnimatePresence>
        {selectedInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedInvoice(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-highest border border-[#003366] rounded-2xl max-w-4xl w-full shadow-2xl z-10 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-[#003366] bg-[#001733] px-6 py-5 md:px-8">
                <div>
                  <h3 className="text-xl font-display font-bold text-white tracking-tight">Detalles de Factura</h3>
                  <p className="text-sm text-[#c5a059]/80 mt-1">{selectedInvoice.ncf || 'Borrador'}</p>
                </div>
                <button onClick={() => setSelectedInvoice(null)} className="p-2 text-on-surface-variant hover:text-primary transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 md:p-8">

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                  <div className="col-span-2">
                    <span className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest block mb-1">Cliente</span>
                    <p className="font-semibold text-[#003366] text-base">{selectedInvoice.buyerName || 'Consumidor Final'}</p>
                    {selectedInvoice.buyerRnc && <p className="text-xs font-mono text-on-surface-variant/80 mt-0.5">RNC: {selectedInvoice.buyerRnc}</p>}
                  </div>
                  <div className="col-span-1">
                    <span className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest block mb-1">Tipo Comprobante</span>
                    <p className="font-semibold text-[#003366] text-sm">{getTypeLabel(selectedInvoice.ecfType)}</p>
                  </div>
                  <div className="col-span-1">
                    <span className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest block mb-1">Estado DGII</span>
                    <div className="mt-1">
                      {(() => {
                        const badge = getStatusBadge(selectedInvoice.status);
                        return (
                          <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border', badge.cls)}>
                            {badge.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest block mb-1">Método de Pago</span>
                    <p className="font-semibold text-[#003366] text-sm capitalize">
                      {selectedInvoice.paymentType === 'cash' && 'Efectivo / Caja'}
                      {selectedInvoice.paymentType === 'credit' && 'Crédito'}
                      {selectedInvoice.paymentType === 'bank_transfer' && 'Transferencia Bancaria'}
                      {!selectedInvoice.paymentType && 'Efectivo / Caja'}
                    </p>
                  </div>
                  {selectedInvoice.paymentType === 'bank_transfer' && (
                    <>
                      <div className="col-span-1">
                        <span className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest block mb-1">Banco</span>
                        <p className="font-semibold text-[#003366] text-sm">{selectedInvoice.bankName || '-'}</p>
                      </div>
                      <div className="col-span-1">
                        <span className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest block mb-1">No. Transferencia</span>
                        <p className="font-semibold font-mono text-[#003366] text-sm">{selectedInvoice.transactionNumber || '-'}</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="mb-6 border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/60 text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">
                      <tr>
                        <th className="py-3 px-4">Descripción del Artículo</th>
                        <th className="py-3 px-4 text-center">Cant.</th>
                        <th className="py-3 px-4 text-right">Precio Unit.</th>
                        <th className="py-3 px-4 text-right">Descuento</th>
                        <th className="py-3 px-4 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20/60 bg-white/40">
                      {selectedInvoice.lines?.map((line: any) => (
                        <tr key={line.id}>
                          <td className="py-3 px-4 text-slate-700">{line.productName || 'Servicio'}</td>
                          <td className="py-3 px-4 text-center font-mono text-on-surface-variant/80">{parseFloat(line.quantity)}</td>
                          <td className="py-3 px-4 text-right font-mono text-on-surface-variant/80">RD$ {parseFloat(line.unitPrice).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                          <td className="py-3 px-4 text-right font-mono text-on-surface-variant/80">RD$ {(parseFloat(line.discount || 0) * parseFloat(line.quantity)).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-[#003366]">RD$ {parseFloat(line.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-end gap-6 pt-4 border-t border-slate-200">
                  <div className="flex gap-3 w-full md:w-auto">
                    <button
                      onClick={() => setSelectedInvoice(null)}
                      className="flex-1 md:flex-none rounded-xl border border-slate-300 bg-white px-6 py-2.5 text-sm font-bold text-[#003366] hover:bg-slate-100 transition-colors"
                    >
                      Cerrar
                    </button>
                    <a
                      href={`/api/v1/invoices/${selectedInvoice.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 rounded-xl bg-[#C5A059] px-6 py-2.5 text-sm font-bold text-slate-950 hover:bg-[#b08c4a] transition-colors"
                    >
                      <Printer className="h-4 w-4" />
                      Imprimir
                    </a>
                    {selectedInvoice.status !== 'draft' && ['31', '32', '45'].includes(selectedInvoice.ecfType) && (
                      <>
                        <button
                          onClick={() => {
                            handleCreateAdjustmentNote(selectedInvoice, '34');
                            setSelectedInvoice(null);
                          }}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 rounded-xl bg-pink-50 border border-pink-200 px-6 py-2.5 text-sm font-bold text-pink-700 hover:bg-pink-100 transition-colors"
                        >
                          <FileMinus className="h-4 w-4" />
                          Nota de Crédito
                        </button>
                        <button
                          onClick={() => {
                            handleCreateAdjustmentNote(selectedInvoice, '33');
                            setSelectedInvoice(null);
                          }}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 rounded-xl bg-orange-50 border border-orange-200 px-6 py-2.5 text-sm font-bold text-orange-700 hover:bg-orange-100 transition-colors"
                        >
                          <FilePlus className="h-4 w-4" />
                          Nota de Débito
                        </button>
                      </>
                    )}
                    {selectedInvoice.customerId && (
                      <button
                        onClick={() => handleResendEmail(selectedInvoice.id)}
                        disabled={resendingEmailId === selectedInvoice.id}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-2.5 text-sm font-bold text-[#003366] hover:bg-slate-100 disabled:opacity-40 transition-colors"
                      >
                        {resendingEmailId === selectedInvoice.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin text-[#C5A059]" />
                        ) : (
                          <Mail className="h-4 w-4" />
                        )}
                        Reenviar Correo
                      </button>
                    )}
                  </div>

                  <div className="w-full md:w-64 space-y-2 text-sm">
                    <div className="flex justify-between text-on-surface-variant/80">
                      <span>Subtotal</span>
                      <span className="font-mono">RD$ {parseFloat(selectedInvoice.subtotal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {parseFloat(selectedInvoice.discount || 0) > 0 && (
                      <div className="flex justify-between text-on-surface-variant/80">
                        <span>Descuento</span>
                        <span className="font-mono">- RD$ {parseFloat(selectedInvoice.discount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-on-surface-variant/80">
                      <span>ITBIS</span>
                      <span className="font-mono">RD$ {parseFloat(selectedInvoice.totalTaxes).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-slate-200 pt-2 mt-2">
                      <span className="text-[#003366] font-bold uppercase tracking-wider text-xs">Total Bruto</span>
                      <span className="font-mono font-bold text-xl text-[#C5A059]">RD$ {parseFloat(selectedInvoice.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {selectedInvoice.retentions && selectedInvoice.retentions.length > 0 && (
                      <div className="border-t border-orange-200 pt-2 mt-2 space-y-1">
                        <p className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-1">Retenciones Fiscales</p>
                        {selectedInvoice.retentions.map((ret: any, i: number) => (
                          <div key={i} className="flex justify-between text-orange-600 text-xs">
                            <span>{ret.retentionName} ({parseFloat(ret.retentionPercentage).toFixed(2)}%)</span>
                            <span className="font-mono">- RD$ {parseFloat(ret.retentionAmount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                        <div className="flex justify-between items-center border-t border-orange-200 pt-2 mt-1">
                          <span className="text-orange-700 font-bold uppercase tracking-wider text-xs">Total Retenido</span>
                          <span className="font-mono font-bold text-orange-600">- RD$ {parseFloat(selectedInvoice.totalRetained).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center border-t border-slate-300 pt-2 mt-1">
                          <span className="text-emerald-700 font-bold uppercase tracking-wider text-xs">Total Neto a Cobrar</span>
                          <span className="font-mono font-bold text-xl text-emerald-500">RD$ {parseFloat(selectedInvoice.totalNet).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Product Search Modal (Size: 4xl) */}
      <AnimatePresence>
        {productSearchModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setProductSearchModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] z-10"
            >
              {/* Header */}
              <div className="flex justify-between items-center p-5 border-b border-slate-200 bg-slate-50">
                <h3 className="text-lg font-bold text-[#003366] flex items-center gap-2">
                  <Package className="h-5 w-5 text-[#C5A059]" /> Búsqueda de Productos
                </h3>
                <button
                  type="button"
                  onClick={() => setProductSearchModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Filters */}
              <div className="p-4 bg-slate-100 border-b border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={modalSearchTerm}
                    onChange={(e) => setModalSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre, SKU o barra..."
                    className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-[#C5A059]"
                  />
                </div>

                <select
                  value={modalCategoryFilter}
                  onChange={(e) => setModalCategoryFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-xs outline-none focus:border-[#C5A059]"
                >
                  <option value="">Todas las categorías</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto p-4">
                {modalProductsLoading ? (
                  <div className="flex justify-center items-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" />
                  </div>
                ) : modalProducts.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    No se encontraron productos con los filtros seleccionados.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-[#003366] uppercase font-bold border-b border-slate-200">
                          <th className="p-3">SKU / Código</th>
                          <th className="p-3">Producto</th>
                          <th className="p-3 text-center">Stock Físico</th>
                          <th className="p-3 text-center">Existencia</th>
                          <th className="p-3 text-right">Precio Consumidor</th>
                          <th className="p-3 text-right">Precio Mayorista</th>
                          <th className="p-3 text-right">Precio Distribuidor</th>
                          <th className="p-3 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {modalProducts.map((p) => {
                          let stockQty = 0;
                          let availQty = 0;
                          let showAllStock = !modalWarehouseFilter;
                          if (modalWarehouseFilter) {
                            const level = p.inventory?.find((l: any) => l.warehouseId === modalWarehouseFilter);
                            stockQty = level ? parseFloat(level.quantity) : 0;
                            availQty = level ? parseFloat(level.availableQuantity || level.quantity) : 0;
                          } else {
                            stockQty = p.inventory?.reduce((acc: number, cur: any) => acc + parseFloat(cur.quantity), 0) || 0;
                            availQty = p.inventory?.reduce((acc: number, cur: any) => acc + parseFloat(cur.availableQuantity || cur.quantity), 0) || 0;
                          }

                          return (
                            <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3 font-mono font-bold text-slate-500">{p.sku || p.barcode || '-'}</td>
                              <td className="p-3">
                                <span className="font-bold text-slate-800 block">{p.name}</span>
                                {p.description && <span className="text-[10px] text-slate-400 block truncate max-w-[200px]">{p.description}</span>}
                              </td>
                              <td className="p-3 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700">
                                  {stockQty.toFixed(2)} {p.unitOfMeasure || 'ud'}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded font-bold text-[10px] ${availQty > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                  {availQty.toFixed(2)} {p.unitOfMeasure || 'ud'}
                                </span>
                                {showAllStock && p.inventory?.length > 0 && (
                                  <span className="block text-[8px] text-slate-400 mt-0.5">Total disponible</span>
                                )}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-700">RD$ {parseFloat(p.priceConsumidor || p.price || '0').toFixed(2)}</td>
                              <td className="p-3 text-right font-mono text-slate-500">RD$ {parseFloat(p.priceMayorista || p.price || '0').toFixed(2)}</td>
                              <td className="p-3 text-right font-mono text-slate-500">RD$ {parseFloat(p.priceProveedor || p.price || '0').toFixed(2)}</td>
                              <td className="p-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (activeLineIndex !== null) {
                                      applyProductToLine(activeLineIndex, p);
                                      setProductSearchModalOpen(false);
                                    }
                                  }}
                                  className="bg-[#003366] hover:bg-[#002244] text-white font-bold py-1 px-3 rounded text-[10px] transition-colors"
                                >
                                  Seleccionar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Search Modal */}
      <AnimatePresence>
        {customerSearchModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setCustomerSearchModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] z-10"
            >
              {/* Header */}
              <div className="flex justify-between items-center p-5 border-b border-slate-200 bg-slate-50">
                <h3 className="text-lg font-bold text-[#003366] flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#C5A059]" /> Búsqueda de Clientes
                </h3>
                <button
                  type="button"
                  onClick={() => setCustomerSearchModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Search input */}
              <div className="p-4 bg-slate-100 border-b border-slate-200">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={modalCustomerSearch}
                    onChange={(e) => setModalCustomerSearch(e.target.value)}
                    placeholder="Buscar por nombre, RNC o cédula de identidad..."
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-xs outline-none focus:border-[#C5A059]"
                  />
                </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto p-4">
                {modalCustomersLoading ? (
                  <div className="flex justify-center items-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" />
                  </div>
                ) : modalCustomers.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    No se encontraron clientes en el directorio.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-[#003366] uppercase font-bold border-b border-slate-200">
                          <th className="p-3">Nombre / Razón Social</th>
                          <th className="p-3">RNC o Cédula</th>
                          <th className="p-3">Contacto</th>
                          <th className="p-3 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {modalCustomers.map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3">
                              <span className="font-bold text-slate-800 block">{c.name}</span>
                              {c.address && <span className="text-[10px] text-slate-400 block truncate max-w-[250px]">{c.address}</span>}
                            </td>
                            <td className="p-3 font-mono text-slate-600">{c.rncCedula || '-'}</td>
                            <td className="p-3 text-slate-500">
                              {c.email && <div className="block">{c.email}</div>}
                              {c.phone && <div className="block mt-0.5">{c.phone}</div>}
                              {!c.email && !c.phone && <span className="text-slate-400">-</span>}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => applyCustomer(c)}
                                className="bg-[#003366] hover:bg-[#002244] text-white font-bold py-1.5 px-3 rounded text-[10px] transition-colors"
                              >
                                Seleccionar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Customer Modal */}
      <AnimatePresence>
        {createCustomerModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setCreateCustomerModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10 text-slate-800"
            >
              {/* Header */}
              <div className="flex justify-between items-center p-5 border-b border-slate-200 bg-slate-50">
                <h3 className="text-lg font-bold text-[#003366] flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#C5A059]" /> Registrar Nuevo Cliente
                </h3>
                <button
                  type="button"
                  onClick={() => setCreateCustomerModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleCreateCustomerSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#003366] uppercase tracking-wider">RNC o Cédula</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ej: 131002002"
                      value={newCustomerData.rncCedula}
                      onChange={(e) => {
                        setNewCustomerData({ ...newCustomerData, rncCedula: e.target.value });
                        setRncVerified(false);
                      }}
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-[#C5A059] outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleNewCustomerSearchDGII}
                      disabled={isSearchingRnc || !newCustomerData.rncCedula}
                      className="px-4 py-2 bg-[#003366] text-white rounded-lg text-xs font-bold hover:bg-[#002244] transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isSearchingRnc ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Search className="h-3.5 w-3.5" />
                      )}
                      DGII
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#003366] uppercase tracking-wider">Nombre o Razón Social *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Distribuidora Comercial S.A."
                    value={newCustomerData.name}
                    onChange={(e) => setNewCustomerData({ ...newCustomerData, name: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-[#C5A059] outline-none"
                  />
                  {rncVerified && (
                    <span className="text-[10px] text-emerald-600 font-bold block">✓ Contribuyente verificado y cargado de DGII</span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-[#003366] uppercase tracking-wider">Correo Electrónico</label>
                    <input
                      type="email"
                      placeholder="ejemplo@correo.com"
                      value={newCustomerData.email}
                      onChange={(e) => setNewCustomerData({ ...newCustomerData, email: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-[#C5A059] outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-[#003366] uppercase tracking-wider">Teléfono</label>
                    <input
                      type="text"
                      placeholder="809-555-0199"
                      value={newCustomerData.phone}
                      onChange={(e) => setNewCustomerData({ ...newCustomerData, phone: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-[#C5A059] outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#003366] uppercase tracking-wider">Dirección</label>
                  <textarea
                    placeholder="Calle Principal #123, Ensanche Naco..."
                    value={newCustomerData.address}
                    onChange={(e) => setNewCustomerData({ ...newCustomerData, address: e.target.value })}
                    rows={2}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-[#C5A059] outline-none resize-none"
                  />
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateCustomerModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-[#003366] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCustomer}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg text-xs font-bold transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSavingCustomer ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Registrar Cliente
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

export default function InvoicesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-slate-50 text-on-surface">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" />
            <p className="text-on-surface-variant/80 text-sm font-medium">Cargando módulo de facturación...</p>
          </div>
        </div>
      }
    >
      <InvoicesList />
    </Suspense>
  );
}
