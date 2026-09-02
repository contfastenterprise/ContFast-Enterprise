'use client';

import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, CheckCircle2, RefreshCw, Building, FileText, Lock, Truck, Printer, Zap, Image as ImageIcon, UploadCloud, Award, Users, Layers, Calendar, User, Eye, EyeOff, Copy, Plus, Trash2, Edit, X } from 'lucide-react';
import { toast } from 'sonner';
import AvatarUploader from '@/components/ui/AvatarUploader';
import { useConfirm } from '@/providers/confirm-provider';

export default function SettingsPage() {
  const confirm = useConfirm();
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
  // Auditoria ISO-16: mSeller emite credenciales DISTINTAS para cada ambiente, y
  // antes solo cabia un juego. Al pasar a produccion habia que sustituir las de
  // pruebas, y a partir de ahi el modo PRUEBA se quedaba sin credenciales
  // validas. Ahora se guardan por ambiente y se elige a cual pertenecen las que
  // se estan escribiendo.
  const [entornosMseller, setEntornosMseller] = useState<string[]>([]);
  const [credencialesEntorno, setCredencialesEntorno] = useState('TesteCF');
  const [hasMsellerPassword, setHasMsellerPassword] = useState(false);
  /** El ambiente elegido ya tiene su clave de API guardada. */
  const claveYaConfigurada = entornosMseller.includes(credencialesEntorno);
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
    phone: '',
    email: '',
    logoUrl: '',
    dgiiEnv: 'test',
    printLayout: 'carta',
    printCopies: 2,
    autoDeliveryNotes: false,
    maxCreditNoteApprovalAmount: 0,
    maxCashOutApprovalAmount: 0,
    msellerUrl: 'https://ecf.api.mseller.app/v1',
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

    await confirm({
      title: 'Confirmar eliminación',
      description: confirmMessage,
      action: async () => {
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
      }
    });
  };

  async function fetchSettings() {
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
      if (data.success && data.data) {
        const nameVal = data.data.company.name || '';
        const rncVal = data.data.company.rnc || '';
        setInitialCompanyInfo({ name: nameVal, rnc: rncVal });
        setFormData({
          name: nameVal,
          rnc: rncVal,
          businessActivity: data.data.company.businessActivity || '',
          address: data.data.company.address || '',
          phone: data.data.company.phone || '',
          email: data.data.company.email || '',
          logoUrl: data.data.settings.logoUrl || '',
          dgiiEnv: data.data.settings.dgiiEnv,
          printLayout: data.data.settings.printLayout,
          printCopies: data.data.settings.printCopies ?? 2,
          autoDeliveryNotes: data.data.settings.autoDeliveryNotes,
          maxCreditNoteApprovalAmount: Number(data.data.settings.maxCreditNoteApprovalAmount),
          maxCashOutApprovalAmount: Number(data.data.settings.maxCashOutApprovalAmount),
          msellerUrl: data.data.settings.msellerUrl || 'https://ecf.api.mseller.app/v1',
          msellerEmail: data.data.settings.msellerEmail || '',
          msellerApiKey: '',
          msellerPassword: '',
          barcodeDefaultType: data.data.settings.barcodeDefaultType || 'code128',
          barcodePrefix: data.data.settings.barcodePrefix || 'COD',
          barcodeLength: data.data.settings.barcodeLength ?? 9
        });
        setEntornosMseller(data.data.settings.entornosMseller || []);
        setHasMsellerPassword(!!data.data.settings.hasMsellerPassword);
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
  }

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (activeTab === 'gastos') {
      fetchExpenseTypes();
    }
  }, [activeTab]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Auditoria ISO-16: el ambiente viaja con las credenciales. Sin el, el
        // servidor no sabe a cual pertenecen y no las guarda.
        body: JSON.stringify({ ...formData, msellerCredencialesEntorno: credencialesEntorno })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Configuración guardada exitosamente');
        // Auditoria ISO-16: los campos de credenciales no se quedan escritos
        // despues de guardar, por el mismo motivo que al cambiar de ambiente.
        if (formData.msellerApiKey) {
          setEntornosMseller(prev => prev.includes(credencialesEntorno) ? prev : [...prev, credencialesEntorno]);
        }
        if (formData.msellerPassword) setHasMsellerPassword(true);
        // Los secretos no se quedan escritos en el formulario despues de guardar.
        setFormData(f => ({ ...f, msellerApiKey: '', msellerPassword: '' }));
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
            <p className="text-slate-500/70 text-sm mt-1">
              Configura tu cuenta personal y los parámetros operativos de la empresa.
            </p>
          </div>

          {/* Tabs de Configuración */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab('perfil')}
              className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 transition-colors -mb-px ${
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
                className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 transition-colors -mb-px ${
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
                className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 transition-colors -mb-px ${
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
                className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 transition-colors -mb-px ${
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
                className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 transition-colors -mb-px ${
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

            <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
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
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-3">
                <Lock className="w-5 h-5 text-[#003366]" />
                <h3 className="font-bold text-slate-800">Identidad Fiscal</h3>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Nombre Comercial</label>
                  <input
                    type="text"
                    disabled={isNameDisabled}
                    value={formData.name || ''}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">RNC</label>
                  <input
                    type="text"
                    disabled={isRncDisabled}
                    value={formData.rnc || ''}
                    onChange={e => setFormData({ ...formData, rnc: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Dirección de la Empresa</label>
                  <input
                    type="text"
                    value={formData.address || ''}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Teléfono de la Empresa</label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Correo Electrónico de la Empresa</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 font-semibold"
                  />
                </div>
                <div className="col-span-1 md:col-span-2 border-t border-slate-100 pt-6">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Logo de la Empresa (Facturas y Reportes)</label>
                  <div className="flex items-start gap-4 mt-2">
                    {/* Botón de Subida (Izquierda, Pequeño) */}
                    <div className="w-24 h-24 flex-shrink-0">
                      <label className="flex flex-col items-center justify-center w-full h-full border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-white hover:bg-slate-50 transition-colors">
                        <UploadCloud className="w-6 h-6 text-slate-500 mb-1" />
                        <span className="text-[10px] text-slate-500/70 font-bold uppercase text-center leading-tight">Subir<br/>Logo</span>
                        <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                      </label>
                    </div>

                    {/* Previsualización del Logo (Derecha, Grande) */}
                    <div className="flex-1 max-w-sm relative group">
                      <div className="w-full h-24 border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-center overflow-hidden">
                        {formData.logoUrl ? (
                          <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                        ) : (
                          <div className="flex flex-col items-center text-slate-400">
                            <ImageIcon className="w-8 h-8 mb-2 opacity-30" />
                            <span className="text-xs font-medium opacity-50">Ningún logo cargado</span>
                          </div>
                        )}
                      </div>
                      {formData.logoUrl && (
                        <button type="button" onClick={() => setFormData({ ...formData, logoUrl: '' })} className="absolute -top-2 -right-2 bg-rose-100 text-rose-600 rounded-full p-1.5 hover:bg-rose-200 shadow-sm transition-colors opacity-0 group-hover:opacity-100" title="Remover Logo">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bloque: Configuración Editable */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-3">
                <Building className="w-5 h-5 text-[#003366]" />
                <h3 className="font-bold text-[#003366]">Parámetros Operativos</h3>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Actividad Económica</label>
                  <input type="text" value={formData.businessActivity} onChange={e => setFormData({ ...formData, businessActivity: e.target.value })} className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Zap className="w-3 h-3" /> Ambiente Sandbox/Produccion</label>
                  <select
                    disabled={!isSistemas}
                    value={formData.dgiiEnv}
                    onChange={e => setFormData({ ...formData, dgiiEnv: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 font-medium text-slate-900 bg-slate-50 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
                  >
                    <option value="test">Pruebas (Sandbox)</option>
                    <option value="production">Producción</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Printer className="w-3 h-3" /> Formato de Impresión Predeterminado</label>
                  <select value={formData.printLayout} onChange={e => setFormData({ ...formData, printLayout: e.target.value })} className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 font-medium uppercase text-slate-900 bg-slate-50">
                    <option value="carta">Carta (8.5 x 11)</option>
                    <option value="80mm">Ticket 80mm</option>
                    <option value="58mm">Ticket 58mm</option>
                  </select>
                </div>

                {formData.printLayout === 'carta' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                      <Copy className="w-3 h-3" /> Cantidad de Copias (Solo Formato Carta)
                    </label>
                    <select
                      value={formData.printCopies}
                      onChange={e => setFormData({ ...formData, printCopies: parseInt(e.target.value) || 2 })}
                      className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 font-medium text-slate-900 bg-slate-50"
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
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Límite para Notas de Crédito Automáticas (DOP)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-bold">$</span>
                    <input type="number" min="0" step="0.01" value={formData.maxCreditNoteApprovalAmount} onChange={e => setFormData({ ...formData, maxCreditNoteApprovalAmount: Number(e.target.value) })} className="w-full h-8 pl-8 pr-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 font-mono text-slate-900 bg-slate-50" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Límite para Retiro de Caja Chica (DOP)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-bold">$</span>
                    <input type="number" min="0" step="0.01" value={formData.maxCashOutApprovalAmount} onChange={e => setFormData({ ...formData, maxCashOutApprovalAmount: Number(e.target.value) })} className="w-full h-8 pl-8 pr-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 font-mono text-slate-900 bg-slate-50" />
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
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-3">
                <SettingsIcon className="w-5 h-5 text-[#003366]" />
                <h3 className="font-bold text-[#003366]">Integración mSeller API</h3>
              </div>
              <div className="p-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
                  <Lock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    <strong>Seguridad:</strong> Las contraseñas y llaves de API se encriptan de forma segura (AES-256) antes de almacenarse en la base de datos. Una vez guardadas, no podrán ser visualizadas.
                  </p>
                </div>

                {/* Auditoria ISO-13 e ISO-16: dos columnas porque son dos cosas
                    distintas.

                    IZQUIERDA -- la cuenta de la empresa: servidor, usuario y
                    contrasena. Son los mismos para los tres ambientes.

                    DERECHA -- lo unico que cambia entre ambientes: la clave de
                    API. mSeller emite una distinta para pruebas, certificacion y
                    produccion.

                    Antes habia aqui un segundo selector "Ambiente mSeller",
                    siempre deshabilitado, espejo de otro ajuste y escribiendo en
                    una columna que ninguna resolucion consultaba. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

                  {/* ── Cuenta de la empresa ── */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">URL del Servidor</label>
                      <input
                        type="text"
                        disabled={!isSistemas}
                        value={formData.msellerUrl}
                        onChange={e => setFormData({ ...formData, msellerUrl: e.target.value })}
                        className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        placeholder="https://api.mseller.app/v1"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Correo Electrónico (Usuario)</label>
                      <input
                        type="email"
                        disabled={!isSistemas}
                        value={formData.msellerEmail}
                        onChange={e => setFormData({ ...formData, msellerEmail: e.target.value })}
                        className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        placeholder="usuario@empresa.com"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Contraseña mSeller</label>
                      <div className="relative">
                        <input
                          type={showMsellerPassword ? "text" : "password"}
                          disabled={!isSistemas}
                          value={formData.msellerPassword}
                          onChange={e => setFormData({ ...formData, msellerPassword: e.target.value })}
                          className="w-full h-8 pl-3 pr-10 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 placeholder-slate-400 text-slate-900 bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
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
                      <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                        El usuario y la contraseña son los mismos para todos los ambientes.
                      </p>
                    </div>
                  </div>

                  {/* ── Lo que cambia por ambiente ── */}
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">
                        Ambiente de esta clave
                      </label>
                      <select
                        disabled={!isSistemas}
                        value={credencialesEntorno}
                        onChange={e => {
                          // Al cambiar de ambiente se vacia el campo. Si se quedara
                          // escrito, guardar otra vez copiaria la clave de un
                          // ambiente al otro sin que nadie se diera cuenta.
                          setCredencialesEntorno(e.target.value);
                          setFormData(f => ({ ...f, msellerApiKey: '' }));
                        }}
                        className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 font-medium text-slate-900 bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="TesteCF">Pruebas (TesteCF)</option>
                        <option value="CerteCF">Certificación (CerteCF)</option>
                        <option value="eCF">Producción (eCF)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Token de API (API Key)</label>
                      <input
                        type="password"
                        disabled={!isSistemas}
                        value={formData.msellerApiKey}
                        onChange={e => setFormData({ ...formData, msellerApiKey: e.target.value })}
                        className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 placeholder-slate-400 text-slate-900 bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                        placeholder={claveYaConfigurada ? "•••••••• (Configurada)" : "Ingresa el token de API"}
                      />
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      mSeller entrega una clave de API <strong>distinta para cada ambiente</strong>. Guarda la de
                      cada uno por separado.
                      {' '}
                      {entornosMseller.length === 0
                        ? 'Todavía no hay clave guardada para ningún ambiente.'
                        : `Con clave: ${entornosMseller.join(', ')}.`}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bloque: Configuración de Códigos de Barra */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-3">
                <Layers className="w-5 h-5 text-[#003366]" />
                <h3 className="font-bold text-[#003366]">Configuración de Códigos de Barra</h3>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Tipo Predeterminado</label>
                  <select
                    value={formData.barcodeDefaultType}
                    onChange={e => setFormData({ ...formData, barcodeDefaultType: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 font-medium text-slate-900 bg-slate-50"
                  >
                    <option value="code128">Code 128 (Predeterminado)</option>
                    <option value="ean13">EAN-13</option>
                    <option value="ean8">EAN-8</option>
                    <option value="upca">UPC-A</option>
                    <option value="qrcode">Código QR</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Prefijo para Auto-Generación</label>
                  <input
                    type="text"
                    value={formData.barcodePrefix}
                    onChange={e => setFormData({ ...formData, barcodePrefix: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 font-semibold"
                    placeholder="COD"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500/70 uppercase tracking-widest mb-1.5">Longitud de Código Automático</label>
                  <input
                    type="number"
                    min="4"
                    max="20"
                    value={formData.barcodeLength}
                    onChange={e => setFormData({ ...formData, barcodeLength: parseInt(e.target.value) || 9 })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-900 bg-slate-50 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button type="submit" disabled={submitting} className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm">
                {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} Guardar Cambios
              </button>
            </div>

          </form>
        ) : null}

        {/* TAB: Plan & Suscripción */}
        {!loading && activeTab === 'suscripcion' && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-3">
              <Award className="w-5 h-5 text-[#C5A059]" />
              <h3 className="font-bold text-[#003366]">Plan y Suscripción</h3>
            </div>
            <div className="p-4">
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

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {availablePlans.map((p) => {
                  const isCurrent = subscription && subscription.planName.toLowerCase() === p.name.toLowerCase();
                  return (
                    <div 
                      key={p.id} 
                      className={`bg-white rounded-xl p-4 border shadow-sm flex flex-col justify-between transition relative overflow-hidden ${
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
          <form onSubmit={handleSaveMappings} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-[#003366]">Parametrización de Cuentas Puente (Plantillas)</h3>
              <p className="text-sm text-slate-500 mt-1">Configura las cuentas por defecto que recibirán débitos/créditos de transacciones automatizadas en facturas, cobros y almacén.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 bg-slate-50 text-slate-800 focus:border-[#c5a059] outline-none"
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
                className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
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
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-[#C5A059]" />
                <h3 className="font-bold text-[#003366]">Administración de Tipos de Gastos</h3>
              </div>
              <button
                onClick={() => handleOpenTypeModal()}
                className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
              >
                <Plus className="w-4 h-4" /> Crear Tipo de Gasto
              </button>
            </div>
            <div className="p-4">
              {loadingExpenseTypes ? (
                <div className="flex justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-[#C5A059]" />
                </div>
              ) : expenseTypes.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  No hay tipos de gastos registrados.
                </div>
              ) : (
                <>
                  {/* Mobile View */}
                  <div className="md:hidden flex flex-col divide-y divide-slate-100 bg-white">
                    {expenseTypes.map((type) => {
                      const isStandard = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].includes(type.code);
                      return (
                        <div key={type.id} className="flex flex-col p-4 gap-3">
                          <div className="flex justify-between items-start">
                            <div className="flex flex-col">
                              <span className="font-mono text-xs font-bold text-slate-500">Cód. {type.code}</span>
                              <span className="font-semibold text-sm text-slate-800">{type.name}</span>
                            </div>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                              type.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                : 'bg-slate-50 text-slate-600 border border-slate-100'
                            }`}>
                              {type.status === 'active' ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>
                          
                          <div className="flex justify-end gap-2 border-t border-slate-50 pt-2 mt-1">
                            <button
                              onClick={() => handleOpenTypeModal(type)}
                              className="text-[10px] font-bold py-1.5 px-3 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1"
                            >
                              <Edit className="w-3 h-3" /> Editar
                            </button>
                            <button
                              onClick={() => handleDeleteType(type)}
                              className="text-[10px] font-bold py-1.5 px-3 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" /> {isStandard ? 'Desactivar' : 'Eliminar'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          <th className="px-4 py-2.5">Código</th>
                          <th className="px-4 py-2.5">Nombre</th>
                          <th className="px-4 py-2.5">Estado</th>
                          <th className="px-4 py-2.5 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {expenseTypes.map((type) => {
                          const isStandard = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].includes(type.code);
                          return (
                            <tr key={type.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-2.5 font-mono font-bold text-slate-700">{type.code}</td>
                              <td className="px-4 py-2.5 font-medium text-slate-800">{type.name}</td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                  type.status === 'active'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                    : 'bg-slate-50 text-slate-600 border border-slate-100'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${type.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                  {type.status === 'active' ? 'Activo' : 'Inactivo'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right space-x-2">
                                <button
                                  onClick={() => handleOpenTypeModal(type)}
                                  className="p-1.5 rounded-lg transition-colors inline-flex items-center justify-center text-slate-500 hover:text-[#003366] hover:bg-[#003366]/10"
                                  title="Editar"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteType(type)}
                                  className="p-1.5 rounded-lg transition-colors inline-flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                                  title={isStandard ? 'Desactivar' : 'Eliminar'}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Modal: Crear/Editar Tipo de Gasto */}
        {showTypeModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="bg-[#001733] border-b border-[#003366] px-4 py-3 flex items-center justify-between text-white">
                <h3 className="font-bold">{editingType ? 'Editar Tipo de Gasto' : 'Crear Tipo de Gasto'}</h3>
                <button onClick={() => setShowTypeModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSaveType} className="p-4 space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase">Código DGII</label>
                  <input
                    type="text"
                    value={typeCode}
                    onChange={e => setTypeCode(e.target.value)}
                    disabled={!!editingType}
                    maxLength={2}
                    placeholder="Ej. 11"
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 bg-slate-50 text-slate-800 disabled:opacity-60 outline-none"
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
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 bg-slate-50 text-slate-800 outline-none"
                  />
                </div>
                {editingType && (
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase">Estado</label>
                    <select
                      value={typeStatus}
                      onChange={e => setTypeStatus(e.target.value as any)}
                      className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border-slate-200 bg-slate-50 text-slate-800 outline-none"
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
                    className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 px-4 py-2 h-9 rounded-lg font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingType}
                    className="flex items-center gap-2 bg-[#003366] hover:bg-[#002244] text-white px-4 py-2 h-9 rounded-lg font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
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
