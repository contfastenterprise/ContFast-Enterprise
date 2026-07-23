'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Settings as SettingsIcon, CheckCircle2, RefreshCw, Building, FileText, Lock, Truck, Printer, Zap, Image as ImageIcon, UploadCloud, Award, Users, Layers, Calendar, User, Eye, EyeOff, Copy, Plus, Trash2, Edit, X } from 'lucide-react';
import { toast } from 'sonner';
import AvatarUploader from '@/components/ui/AvatarUploader';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'perfil' | 'empresa' | 'puente' | 'suscripcion' | 'gastos'>('perfil');

  // Expense Types States
  const [expenseTypes, setExpenseTypes] = useState<any[]>([]);
  const [loadingExpenseTypes, setLoadingExpenseTypes] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<any | null>(null);
  const [typeCode, setTypeCode] = useState('');
  const [typeName, setTypeName] = useState('');
  const [typeStatus, setTypeStatus] = useState<'active' | 'inactive'>('active');
  const [savingType, setSavingType] = useState(false);

  // Mappings Tab States
  const [accounts, setAccounts] = useState<any[]>([]);
  const [draftMappings, setDraftMappings] = useState<Record<string, string>>({});
  const [mappingSubmitting, setMappingSubmitting] = useState(false);

  // Read-only
  const [initialCompanyInfo, setInitialCompanyInfo] = useState({ name: '', rnc: '' });
  const [userRole, setUserRole] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string; avatarUrl?: string | null; avatarPath?: string | null } | null>(null);
  const [hasMsellerApiKey, setHasMsellerApiKey] = useState(false);
  const [hasMsellerPassword, setHasMsellerPassword] = useState(false);
  const [showMsellerPassword, setShowMsellerPassword] = useState(false);
  const [subscription, setSubscription] = useState<{
    id: string;
    status: string;
    currentPeriodEnd: string;
    planName: string;
    maxEcfLimit: number;
    maxUsers: number;
    maxWarehouses: number;
  } | null>(null);
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);

  // Editable
  const [formData, setFormData] = useState({
    name: '',
    rnc: '',
    businessActivity: '',
    address: '',
    logoUrl: '',
    dgiiEnv: 'test',
    printLayout: 'carta',
    printCopies: 2,
    autoDeliveryNotes: false,
    maxCreditNoteApprovalAmount: 0,
    maxCashOutApprovalAmount: 0,
    msellerUrl: 'https://ecf.api.mseller.app/v1',
    msellerEntorno: 'test',
    msellerEmail: '',
    msellerApiKey: '',
    msellerPassword: '',
    barcodeDefaultType: 'code128',
    barcodePrefix: 'COD',
    barcodeLength: 9
  });

  const isSistemas = userRole === 'sistemas' || userRole?.toLowerCase().includes('sistema');
  const isAdministracion = userRole === 'administracion' || userRole?.toLowerCase().includes('admin');
  const isNameDisabled = !(isSistemas || (isAdministracion && !initialCompanyInfo.name));
  const isRncDisabled = !(isSistemas || (isAdministracion && !initialCompanyInfo.rnc));

  const fetchExpenseTypes = async () => {
    setLoadingExpenseTypes(true);
    try {
      const res = await fetch('/api/v1/expenses/types');
      const data = await res.json();
      if (data.success) {
        setExpenseTypes(data.data || []);
      }
    } catch (e) {
      console.error('Error loading expense types:', e);
      toast.error('Error al cargar tipos de gastos');
    } finally {
      setLoadingExpenseTypes(false);
    }
  };

  const handleOpenTypeModal = (type: any = null) => {
    if (type) {
      setEditingType(type);
      setTypeCode(type.code);
      setTypeName(type.name);
      setTypeStatus(type.status);
    } else {
      setEditingType(null);
      setTypeCode('');
      setTypeName('');
      setTypeStatus('active');
    }
    setShowTypeModal(true);
  };

  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeCode.trim() || typeCode.trim().length !== 2 || isNaN(Number(typeCode))) {
      return toast.error('El código debe tener exactamente 2 dígitos numéricos.');
    }
    if (!typeName.trim()) {
      return toast.error('El nombre del tipo de gasto es requerido.');
    }

    setSavingType(true);
    try {
      const url = editingType ? `/api/v1/expenses/types/${editingType.id}` : '/api/v1/expenses/types';
      const method = editingType ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: typeCode,
          name: typeName,
          status: typeStatus
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(editingType ? 'Tipo de gasto actualizado con éxito.' : 'Tipo de gasto creado con éxito.');
        fetchExpenseTypes();
        setShowTypeModal(false);
      } else {
        toast.error(data.error?.message || 'Error al guardar el tipo de gasto');
      }
    } catch (err) {
      console.error('Error saving expense type:', err);
      toast.error('Ocurrió un error al guardar');
    } finally {
      setSavingType(false);
    }
  };

  const handleDeleteType = async (type: any) => {
    const isStandard = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].includes(type.code);
    const confirmMessage = isStandard
      ? `¿Estás seguro de que deseas desactivar el tipo de gasto estándar "${type.code} - ${type.name}"? Los tipos de gastos estándares no se eliminan físicamente, solo se desactivan de los desplegables.`
      : `¿Estás seguro de que deseas eliminar permanentemente el tipo de gasto personalizado "${type.code} - ${type.name}"?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const res = await fetch(`/api/v1/expenses/types/${type.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        toast.success(isStandard ? 'Tipo de gasto desactivado.' : 'Tipo de gasto eliminado.');
        fetchExpenseTypes();
      } else {
        toast.error(data.error?.message || 'Error al eliminar');
      }
    } catch (err) {
      console.error('Error deleting type:', err);
      toast.error('Error al realizar la operación');
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'gastos') {
      fetchExpenseTypes();
    }
  }, [activeTab]);

  const fetchSettings = async () => {
    try {
      // Cargar rol de usuario y perfil
      try {
        const userRes = await fetch('/api/v1/auth/me');
        const userData = await userRes.json();
        if (userData.success && userData.data?.user) {
          setUserRole(userData.data.user.role);
          setCurrentUser(userData.data.user);
        }
      } catch (userErr) {
        console.error('Error al obtener perfil de usuario', userErr);
      }

      const res = await fetch('/api/v1/admin/settings');
      const data = await res.json();
      if (data.success) {
        const nameVal = data.data.company.name || '';
        const rncVal = data.data.company.rnc || '';
        setInitialCompanyInfo({ name: nameVal, rnc: rncVal });
        setFormData({
          name: nameVal,
          rnc: rncVal,
          businessActivity: data.data.company.businessActivity || '',
          address: data.data.company.address || '',
          logoUrl: data.data.settings.logoUrl || '',
          dgiiEnv: data.data.settings.dgiiEnv,
          printLayout: data.data.settings.printLayout,
          printCopies: data.data.settings.printCopies ?? 2,
          autoDeliveryNotes: data.data.settings.autoDeliveryNotes,
          maxCreditNoteApprovalAmount: Number(data.data.settings.maxCreditNoteApprovalAmount),
          maxCashOutApprovalAmount: Number(data.data.settings.maxCashOutApprovalAmount),
          msellerUrl: data.data.settings.msellerUrl || 'https://ecf.api.mseller.app/v1',
          msellerEntorno: data.data.settings.dgiiEnv || 'test',
          msellerEmail: data.data.settings.msellerEmail || '',
          msellerApiKey: '',
          msellerPassword: '',
          barcodeDefaultType: data.data.settings.barcodeDefaultType || 'code128',
          barcodePrefix: data.data.settings.barcodePrefix || 'COD',
          barcodeLength: data.data.settings.barcodeLength ?? 9
        });
        setHasMsellerApiKey(data.data.settings.hasMsellerApiKey);
        setHasMsellerPassword(data.data.settings.hasMsellerPassword);
        setSubscription(data.data.subscription || null);
        setAvailablePlans(data.data.availablePlans || []);
        // Fetch accounts and mappings
        try {
          const [accRes, mapRes] = await Promise.all([
            fetch('/api/v1/accounting/accounts'),
            fetch('/api/v1/accounting/mappings')
          ]);
          const accData = await accRes.json();
          const mapData = await mapRes.json();
          if (accData.success) setAccounts(accData.data);
          if (mapData.success) {
            const m = mapData.data.reduce((acc: any, curr: any) => {
              acc[curr.mappingKey] = curr.accountId;
              return acc;
            }, {});
            setDraftMappings(m);
          }
        } catch (err) {
          console.error('Error al cargar contabilidad', err);
        }
      }
    } catch (err) {
      toast.error('Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Configuración guardada exitosamente');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('company-settings-updated'));
        }
      } else {
        toast.error(data.error?.message || 'Error al guardar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveMappings = async (e: React.FormEvent) => {
    e.preventDefault();
    setMappingSubmitting(true);
    try {
      const promises = Object.entries(draftMappings).map(([key, accountId]) => 
        fetch('/api/v1/accounting/mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mappingKey: key, accountId })
        })
      );
      await Promise.all(promises);
      toast.success('Cuentas puente guardadas exitosamente.');
    } catch (error) {
      toast.error('Error al guardar las cuentas puente');
    } finally {
      setMappingSubmitting(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecciona un archivo de imagen (PNG, JPG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData(prev => ({ ...prev, logoUrl: event.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  return (

    <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20 max-w-7xl mx-auto w-full">
      <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-end items-center shadow-inner">
        <span className="text-white text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
          <SettingsIcon className="h-3 w-3" /> Configuración Global
        </span>
      </div>

      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-[#003366] flex items-center gap-2">
              Ajustes del Sistema
            </h1>
            <p className="text-on-surface-variant/70 text-sm mt-1">
              Configura tu cuenta personal y los parámetros operativos de la empresa.
            </p>
          </div>

          {/* Tabs de Configuración */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('perfil')}
              className={`px-6 py-3 text-sm font-semibold cursor-pointer border-b-2 transition-colors -mb-px ${
                activeTab === 'perfil'
                  ? 'border-[#003366] text-[#003366]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Mi Perfil
            </button>
            {(isAdministracion || isSistemas) && (
              <button
                onClick={() => setActiveTab('empresa')}
                className={`px-6 py-3 text-sm font-semibold cursor-pointer border-b-2 transition-colors -mb-px ${
                  activeTab === 'empresa'
                    ? 'border-[#003366] text-[#003366]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                Configuración Empresa
              </button>
            )}
            {(isAdministracion || isSistemas) && (
              <button
                onClick={() => setActiveTab('puente')}
                className={`px-6 py-3 text-sm font-semibold cursor-pointer border-b-2 transition-colors -mb-px ${
                  activeTab === 'puente'
                    ? 'border-[#003366] text-[#003366]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                Cuentas Puente
              </button>
            )}
            {(isAdministracion || isSistemas) && (
              <button
                onClick={() => setActiveTab('suscripcion')}
                className={`px-6 py-3 text-sm font-semibold cursor-pointer border-b-2 transition-colors -mb-px ${
                  activeTab === 'suscripcion'
                    ? 'border-[#003366] text-[#003366]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                Plan & Suscripción
              </button>
            )}
            {(isAdministracion || isSistemas) && (
              <button
                onClick={() => setActiveTab('gastos')}
                className={`px-6 py-3 text-sm font-semibold cursor-pointer border-b-2 transition-colors -mb-px ${
                  activeTab === 'gastos'
                    ? 'border-[#003366] text-[#003366]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                Tipos de Gastos
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" />
          </div>
        ) : activeTab === 'perfil' && currentUser ? (
          /* Sección Mi Perfil */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
              <h3 className="text-lg font-bold text-[#003366] mb-4">Foto de Perfil</h3>
              <AvatarUploader
                userId={currentUser.id}
                userName={currentUser.name}
                currentAvatarUrl={currentUser.avatarUrl}
                currentAvatarPath={currentUser.avatarPath}
                onUploadSuccess={(url, path) => {
                  setCurrentUser(prev => prev ? { ...prev, avatarUrl: url, avatarPath: path } : null);
                  // Actualizar localStorage o forzar actualización si es necesario
                  if (typeof window !== 'undefined') {
                    const stored = localStorage.getItem('cf_user');
                    if (stored) {
                      try {
                        const parsed = JSON.parse(stored);
                        parsed.avatarUrl = url;
                        parsed.avatarPath = path;
                        localStorage.setItem('cf_user', JSON.stringify(parsed));
                      } catch (e) { }
                    }
                  }
                }}
                onDeleteSuccess={() => {
                  setCurrentUser(prev => prev ? { ...prev, avatarUrl: null, avatarPath: null } : null);
                  if (typeof window !== 'undefined') {
                    const stored = localStorage.getItem('cf_user');
                    if (stored) {
                      try {
                        const parsed = JSON.parse(stored);
                        parsed.avatarUrl = null;
                        parsed.avatarPath = null;
                        localStorage.setItem('cf_user', JSON.stringify(parsed));
                      } catch (e) { }
                    }
                  }
                }}
              />
            </div>

            <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-800 border-b pb-2 flex items-center gap-2">
                <User className="w-5 h-5 text-[#003366]" /> Datos del Usuario
              </h3>
              <div className="space-y-3">
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Nombre</span>
                  <span className="text-sm font-semibold text-slate-800">{currentUser.name}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Correo Electrónico</span>
                  <span className="text-sm font-semibold text-slate-800">{currentUser.email}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Rol de Sistema</span>
                  <span className="text-sm font-semibold uppercase text-[#003366] bg-[#003366]/5 px-2.5 py-1 rounded-md inline-block mt-1">
                    {userRole}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'empresa' ? (
          /* Sección Configuración Empresa */
          <form onSubmit={handleSave} className="space-y-6">

            {/* Bloque: Identidad */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-3">
                <Lock className="w-5 h-5 text-[#003366]" />
                <h3 className="font-bold text-slate-800">Identidad Fiscal</h3>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">Nombre Comercial</label>
                  <input
                    type="text"
                    disabled={isNameDisabled}
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-slate-900 bg-white disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">RNC</label>
                  <input
                    type="text"
                    disabled={isRncDisabled}
                    value={formData.rnc}
                    onChange={e => setFormData({ ...formData, rnc: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-slate-900 bg-white disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed font-semibold"
                  />
                </div>
                <div className="col-span-1 md:col-span-2 border-t border-slate-100 pt-6">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1.5">Logo de la Empresa (Facturas y Reportes)</label>
                  <div className="flex items-start gap-6 mt-2">
                    <div className="w-24 h-24 border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {formData.logoUrl ? (
                        <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-on-surface-variant" />
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="flex items-center justify-center w-full max-w-sm h-24 px-4 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-slate-50 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <UploadCloud className="w-6 h-6 text-on-surface-variant mb-2" />
                          <p className="text-sm text-on-surface-variant/70 font-medium">Haga clic para subir el logo</p>
                          <p className="text-xs text-on-surface-variant mt-1">PNG, JPG, SVG (Recomendado 250x100px)</p>
                        </div>
                        <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                      </label>
                      {formData.logoUrl && (
                        <button type="button" onClick={() => setFormData({ ...formData, logoUrl: '' })} className="text-xs text-rose-500 font-bold mt-2 hover:underline">
                          Remover Imagen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bloque: Configuración Editable */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-3">
                <Building className="w-5 h-5 text-[#003366]" />
                <h3 className="font-bold text-[#003366]">Parámetros Operativos</h3>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">Actividad Económica</label>
                  <input type="text" value={formData.businessActivity} onChange={e => setFormData({ ...formData, businessActivity: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-slate-900 bg-white" />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">Dirección de la Empresa</label>
                  <input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-slate-900 bg-white" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Zap className="w-3 h-3" /> Ambiente Sandbox/Produccion</label>
                  <select
                    disabled={!isSistemas}
                    value={formData.dgiiEnv}
                    onChange={e => setFormData({ ...formData, dgiiEnv: e.target.value, msellerEntorno: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] font-medium text-slate-900 bg-white disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    <option value="test">Pruebas (Sandbox)</option>
                    <option value="production">Producción</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Printer className="w-3 h-3" /> Formato de Impresión Predeterminado</label>
                  <select value={formData.printLayout} onChange={e => setFormData({ ...formData, printLayout: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] font-medium uppercase text-slate-900 bg-white">
                    <option value="carta">Carta (8.5 x 11)</option>
                    <option value="80mm">Ticket 80mm</option>
                    <option value="58mm">Ticket 58mm</option>
                  </select>
                </div>

                {formData.printLayout === 'carta' && (
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <Copy className="w-3 h-3" /> Cantidad de Copias (Solo Formato Carta)
                    </label>
                    <select
                      value={formData.printCopies}
                      onChange={e => setFormData({ ...formData, printCopies: parseInt(e.target.value) || 2 })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] font-medium text-slate-900 bg-white"
                    >
                      <option value={1}>1 Copia (Solo Original)</option>
                      <option value={2}>2 Copias (Original + Copia)</option>
                      <option value={3}>3 Copias</option>
                      <option value={4}>4 Copias</option>
                      <option value={5}>5 Copias</option>
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Las copias adicionales se rotularán automáticamente como "COPIA".
                    </p>
                  </div>
                )}

                <div className="col-span-1 md:col-span-2 border-t border-slate-100 pt-6 mt-2">
                  <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><FileText className="w-4 h-4" /> Límites y Automatizaciones</h4>
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">Límite para Notas de Crédito Automáticas (DOP)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-on-surface-variant font-bold">$</span>
                    <input type="number" min="0" step="0.01" value={formData.maxCreditNoteApprovalAmount} onChange={e => setFormData({ ...formData, maxCreditNoteApprovalAmount: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 outline-none focus:border-[#C5A059] font-mono text-slate-900 bg-white" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">Límite para Retiro de Caja Chica (DOP)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-on-surface-variant font-bold">$</span>
                    <input type="number" min="0" step="0.01" value={formData.maxCashOutApprovalAmount} onChange={e => setFormData({ ...formData, maxCashOutApprovalAmount: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 outline-none focus:border-[#C5A059] font-mono text-slate-900 bg-white" />
                  </div>
                </div>

                <div className="col-span-1 md:col-span-2 flex items-center gap-3 bg-amber-50 p-4 rounded-lg border border-amber-100 mt-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, autoDeliveryNotes: !formData.autoDeliveryNotes })}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${formData.autoDeliveryNotes ? 'bg-amber-500' : 'bg-slate-300'
                      }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.autoDeliveryNotes ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    />
                  </button>
                  <div>
                    <h4 className="text-sm font-bold text-amber-900 flex items-center gap-2"><Truck className="w-4 h-4" /> Conduces Automáticos</h4>
                    <p className="text-xs text-amber-700/80">Generar un borrador de remisión automáticamente al facturar productos físicos.</p>
                  </div>
                </div>

              </div>
            </div>

            {/* Bloque: Integración mSeller API */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-3">
                <SettingsIcon className="w-5 h-5 text-[#003366]" />
                <h3 className="font-bold text-[#003366]">Integración mSeller API</h3>
              </div>
              <div className="p-6">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
                  <Lock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    <strong>Seguridad:</strong> Las contraseñas y llaves de API se encriptan de forma segura (AES-256) antes de almacenarse en la base de datos. Una vez guardadas, no podrán ser visualizadas.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">Ambiente mSeller</label>
                    <select
                      disabled={true}
                      value={formData.msellerEntorno}
                      onChange={e => setFormData({ ...formData, msellerEntorno: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366] font-medium text-slate-900 bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <option value="test">Pruebas</option>
                      <option value="production">Producción</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">URL del Servidor</label>
                    <input
                      type="text"
                      disabled={!isSistemas}
                      value={formData.msellerUrl}
                      onChange={e => setFormData({ ...formData, msellerUrl: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366] text-slate-900 bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder="https://api.mseller.app/v1"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">Correo Electrónico (Usuario)</label>
                    <input
                      type="email"
                      disabled={!isSistemas}
                      value={formData.msellerEmail}
                      onChange={e => setFormData({ ...formData, msellerEmail: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366] text-slate-900 bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder="usuario@empresa.com"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">Contraseña mSeller</label>
                    <div className="relative">
                      <input
                        type={showMsellerPassword ? "text" : "password"}
                        disabled={!isSistemas}
                        value={formData.msellerPassword}
                        onChange={e => setFormData({ ...formData, msellerPassword: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg pl-3 pr-10 py-2 outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366] placeholder-slate-400 text-slate-900 bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                        placeholder={hasMsellerPassword ? "•••••••• (Configurada)" : "Ingresa contraseña"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowMsellerPassword(!showMsellerPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                      >
                        {showMsellerPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">Token de API (API Key)</label>
                    <input
                      type="password"
                      disabled={!isSistemas}
                      value={formData.msellerApiKey}
                      onChange={e => setFormData({ ...formData, msellerApiKey: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366] placeholder-slate-400 text-slate-900 bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder={hasMsellerApiKey ? "•••••••• (Configurada)" : "Ingresa el token de API"}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Bloque: Configuración de Códigos de Barra */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-3">
                <Layers className="w-5 h-5 text-[#003366]" />
                <h3 className="font-bold text-[#003366]">Configuración de Códigos de Barra</h3>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">Tipo Predeterminado</label>
                  <select
                    value={formData.barcodeDefaultType}
                    onChange={e => setFormData({ ...formData, barcodeDefaultType: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] font-medium text-slate-900 bg-white"
                  >
                    <option value="code128">Code 128 (Predeterminado)</option>
                    <option value="ean13">EAN-13</option>
                    <option value="ean8">EAN-8</option>
                    <option value="upca">UPC-A</option>
                    <option value="qrcode">Código QR</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">Prefijo para Auto-Generación</label>
                  <input
                    type="text"
                    value={formData.barcodePrefix}
                    onChange={e => setFormData({ ...formData, barcodePrefix: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-slate-900 bg-white font-semibold"
                    placeholder="COD"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest mb-1.5">Longitud de Código Automático</label>
                  <input
                    type="number"
                    min="4"
                    max="20"
                    value={formData.barcodeLength}
                    onChange={e => setFormData({ ...formData, barcodeLength: parseInt(e.target.value) || 9 })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-[#C5A059] text-slate-900 bg-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button type="submit" disabled={submitting} className="bg-[#003366] hover:bg-[#002244] text-white font-bold py-3 px-8 rounded-lg shadow-md transition-all flex items-center gap-2 font-semibold">
                {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} Guardar Cambios
              </button>
            </div>

          </form>
        ) : null}

        {/* TAB: Plan & Suscripción */}
        {!loading && activeTab === 'suscripcion' && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center gap-3">
              <Award className="w-5 h-5 text-[#C5A059]" />
              <h3 className="font-bold text-[#003366]">Plan y Suscripción</h3>
            </div>
            <div className="p-6">
              {subscription ? (
                <div>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-6">
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Plan Contratado</p>
                      <h4 className="text-xl font-bold text-[#003366] mt-1">{subscription.planName}</h4>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${subscription.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                        <span className={`w-2 h-2 rounded-full ${subscription.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {subscription.status === 'active' ? 'Activo' : subscription.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                      <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Límite e-CF</p>
                        <p className="text-lg font-bold text-slate-800 mt-1">
                          {subscription.maxEcfLimit === -1 ? 'Ilimitado' : `${subscription.maxEcfLimit} / mes`}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                      <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Límite de Usuarios</p>
                        <p className="text-lg font-bold text-slate-800 mt-1">
                          {subscription.maxUsers === -1 ? 'Ilimitado' : `${subscription.maxUsers}`}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                      <div className="p-2 bg-violet-50 rounded-lg text-violet-600">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Límite de Almacenes</p>
                        <p className="text-lg font-bold text-slate-800 mt-1">
                          {subscription.maxWarehouses === -1 ? 'Ilimitado' : `${subscription.maxWarehouses}`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-semibold">
                        Vencimiento / Renovación:{' '}
                        <span className="text-slate-800 font-bold">
                          {new Date(subscription.currentPeriodEnd).toLocaleDateString('es-DO', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium italic">
                      Para modificar su plan o límites, contacte a soporte.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-slate-500 font-medium">No se encontró una suscripción activa para esta empresa.</p>
                  <p className="text-xs text-slate-400 mt-1">Por favor, póngase en contacto con soporte técnico para activar su plan.</p>
                </div>
              )}
            </div>
          </div>

          {/* Otros Planes Disponibles */}
          {availablePlans.length > 0 && (
            <div className="mt-8 space-y-4">
              <h3 className="text-lg font-bold text-[#003366] flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#C5A059]" /> Planes Disponibles en ContFast
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {availablePlans.map((p) => {
                  const isCurrent = subscription && subscription.planName.toLowerCase() === p.name.toLowerCase();
                  return (
                    <div 
                      key={p.id} 
                      className={`bg-white rounded-xl p-6 border shadow-sm flex flex-col justify-between transition-all relative overflow-hidden ${
                        isCurrent ? 'border-[#C5A059] ring-2 ring-[#C5A059]/20' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {isCurrent && (
                        <div className="absolute top-0 right-0 bg-[#C5A059] text-white text-[9px] font-bold uppercase tracking-wider py-1 px-3 rounded-bl-lg">
                          Plan Actual
                        </div>
                      )}
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">{p.name}</h4>
                        <p className="text-xs text-slate-500 mt-1 min-h-[36px]">{p.description || 'Sin descripción'}</p>
                        
                        <div className="mt-4 flex items-baseline gap-1">
                          <span className="text-xl font-bold text-[#003366]">${Number(p.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                          <span className="text-slate-500 text-[10px] font-semibold">/ mes</span>
                        </div>

                        <ul className="mt-6 space-y-3.5 border-t border-slate-100 pt-4">
                          <li className="flex items-center gap-2 text-xs text-slate-600">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span>Límite e-CF: <strong>{p.maxEcfLimit === -1 ? 'Ilimitado' : `${p.maxEcfLimit} / mes`}</strong></span>
                          </li>
                          <li className="flex items-center gap-2 text-xs text-slate-600">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span>Límite Usuarios: <strong>{p.maxUsers === -1 ? 'Ilimitado' : `${p.maxUsers}`}</strong></span>
                          </li>
                          <li className="flex items-center gap-2 text-xs text-slate-600">
                            <Layers className="w-3.5 h-3.5 text-slate-400" />
                            <span>Límite Almacenes: <strong>{p.maxWarehouses === -1 ? 'Ilimitado' : `${p.maxWarehouses}`}</strong></span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

        {/* TAB: Cuentas Puente */}
        {!loading && activeTab === 'puente' && (
          <form onSubmit={handleSaveMappings} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-[#003366]">Parametrización de Cuentas Puente (Plantillas)</h3>
              <p className="text-sm text-slate-500 mt-1">Configura las cuentas por defecto que recibirán débitos/créditos de transacciones automatizadas en facturas, cobros y almacén.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { key: 'sales_revenue', label: 'Ingresos por Ventas' },
                { key: 'accounts_receivable', label: 'Cuentas por Cobrar (Clientes)' },
                { key: 'cash', label: 'Caja General' },
                { key: 'bank', label: 'Bancos' },
                { key: 'itbis_sales', label: 'ITBIS Cobrado en Ventas' },
                { key: 'itbis_purchases', label: 'ITBIS Pagado en Compras' },
                { key: 'cost_of_goods_sold', label: 'Costo de Ventas' },
                { key: 'inventory', label: 'Inventario' },
                { key: 'supplier_payable', label: 'Cuentas por Pagar (Proveedores)' }
              ].map((mapItem) => (
                <div key={mapItem.key} className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase">{mapItem.label}</label>
                  <select 
                    value={draftMappings[mapItem.key] || ''} 
                    onChange={e => setDraftMappings(prev => ({ ...prev, [mapItem.key]: e.target.value }))}
                    disabled={mappingSubmitting}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800 focus:border-[#c5a059] outline-none"
                  >
                    <option value="" disabled>-- Seleccione cuenta puente --</option>
                    {accounts.filter(acc => acc.isTransactional).map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={mappingSubmitting}
                className="bg-[#c5a059] text-white px-6 py-2 rounded-xl text-sm font-semibold hover:bg-[#b08d4b] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {mappingSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Guardar Cuentas Puente
              </button>
            </div>
          </form>
        )}

        {/* TAB: Tipos de Gastos */}
        {!loading && activeTab === 'gastos' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-[#C5A059]" />
                <h3 className="font-bold text-[#003366]">Administración de Tipos de Gastos</h3>
              </div>
              <button
                onClick={() => handleOpenTypeModal()}
                className="bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4" /> Crear Tipo de Gasto
              </button>
            </div>
            <div className="p-6">
              {loadingExpenseTypes ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-[#C5A059]" />
                </div>
              ) : expenseTypes.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  No hay tipos de gastos registrados.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-bold text-slate-400 uppercase">
                        <th className="py-3 px-4">Código</th>
                        <th className="py-3 px-4">Nombre</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {expenseTypes.map((type) => {
                        const isStandard = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].includes(type.code);
                        return (
                          <tr key={type.id} className="hover:bg-slate-50/50">
                            <td className="py-3 px-4 font-mono font-bold text-slate-700">{type.code}</td>
                            <td className="py-3 px-4 font-medium text-slate-800">{type.name}</td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                type.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                  : 'bg-slate-50 text-slate-600 border border-slate-100'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${type.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                {type.status === 'active' ? 'Activo' : 'Inactivo'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right space-x-2">
                              <button
                                onClick={() => handleOpenTypeModal(type)}
                                className="text-slate-500 hover:text-primary transition-colors font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Edit className="w-3.5 h-3.5" /> Editar
                              </button>
                              <button
                                onClick={() => handleDeleteType(type)}
                                className="text-rose-500 hover:text-rose-700 transition-colors font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> {isStandard ? 'Desactivar' : 'Eliminar'}
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
          </div>
        )}

        {/* Modal: Crear/Editar Tipo de Gasto */}
        {showTypeModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="bg-[#001733] border-b border-[#003366] px-6 py-4 flex items-center justify-between text-white">
                <h3 className="font-bold">{editingType ? 'Editar Tipo de Gasto' : 'Crear Tipo de Gasto'}</h3>
                <button onClick={() => setShowTypeModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveType} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase">Código DGII</label>
                  <input
                    type="text"
                    value={typeCode}
                    onChange={e => setTypeCode(e.target.value)}
                    disabled={!!editingType}
                    maxLength={2}
                    placeholder="Ej. 11"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800 disabled:opacity-60 outline-none"
                  />
                  {!editingType && <p className="text-[10px] text-slate-400">Debe tener exactamente 2 dígitos numéricos.</p>}
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase">Nombre</label>
                  <input
                    type="text"
                    value={typeName}
                    onChange={e => setTypeName(e.target.value)}
                    placeholder="Ej. Gastos Especiales"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800 outline-none"
                  />
                </div>
                {editingType && (
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase">Estado</label>
                    <select
                      value={typeStatus}
                      onChange={e => setTypeStatus(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800 outline-none"
                    >
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowTypeModal(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-500 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingType}
                    className="bg-[#003366] text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-[#002244] transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    {savingType ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
