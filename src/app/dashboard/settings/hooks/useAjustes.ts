'use client';

/**
 * Los ajustes de la empresa y el perfil de quien entra: lo que se carga, lo que
 * se escribe en el formulario de Empresa y guardar. Sale de `settings/page.tsx`
 * en el lote 238, movido tal cual.
 *
 * `cargarPuentes` es la carga de las cuentas puente (`useCuentasPuente`): la
 * pagina la pedia en el mismo sitio, despues de leer los ajustes y solo si se
 * habian podido leer. Sin ese cruce compila igual y la pestana sale vacia.
 *
 * Lote 239: las respuestas se leen con `leerRespuesta`, que mira el ESTADO antes
 * que el cuerpo. Lo que cambia para quien usa la pantalla: un 5xx con pagina de
 * error al guardar decia "Error de conexion" -- falso: la red funciono, fallo el
 * servidor --; ahora dice "Error al guardar". Y guardar lleva guarda de
 * re-entrada en un `useRef` (dos clics seguidos mandaban dos PATCH).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { leerRespuesta } from '@/utils/leerRespuesta';
import { esAdministracion, esSistemas } from '@/utils/rolMatch';
import { correoValido } from '@/services/avisos/avisoPorCorreo';

export function useAjustes(cargarPuentes: () => Promise<void>) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
  //  Lote 187: por que el sistema NO puede mandar avisos, si es que no puede.
  //  Lo dice el servidor (nombra la variable que falta, nunca su valor): desde
  //  el navegador no se ve el entorno de Vercel.
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
    dgiiEnv: 'PRUEBA',
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
    barcodeLength: 9,
    avisosCorreo: ''
  });

  //  LOTE 188: se recalcula en cada pintada, que es lo que hace que el aviso
  //  aparezca MIENTRAS se escribe. No hace falta estado propio: sale del valor
  //  LOTE 200: el correo tambien se diagnostica MIENTRAS SE ESCRIBE, por lo mismo
  //  que el numero en el 188: si solo se supiera al pulsar Guardar, el aviso llega
  //  tarde y en otro sitio (un 400 del servidor).
  const correoDeAvisos = correoValido(formData.avisosCorreo);

  const isSistemas = esSistemas(userRole);
  const isAdministracion = esAdministracion(userRole);
  const isNameDisabled = !(isSistemas || (isAdministracion && !initialCompanyInfo.name));
  const isRncDisabled = !(isSistemas || (isAdministracion && !initialCompanyInfo.rnc));

  const guardandoYa = useRef(false);

  const fetchSettings = useCallback(async () => {
    try {
      // Cargar rol de usuario y perfil
      try {
        const perfil = await leerRespuesta<{ data?: { user?: NonNullable<typeof currentUser> & { role: string } } }>(await fetch('/api/v1/auth/me'));
        if (perfil.bien && perfil.cuerpo.data?.user) {
          setUserRole(perfil.cuerpo.data.user.role);
          setCurrentUser(perfil.cuerpo.data.user);
        }
      } catch (userErr) {
        console.error('Error al obtener perfil de usuario', userErr);
      }

      //  `any`: la forma de los ajustes la da la ruta; aqui solo se reparte en el formulario.
      const leido = await leerRespuesta<{ data?: any }>(await fetch('/api/v1/admin/settings'));
      //  Un 4xx aqui es lo NORMAL para quien no administra (solo ve "Mi Perfil"): se calla,
      //  como antes. Un 5xx no: antes reventaba el `json()` y salia este mismo aviso.
      if (!leido.bien && leido.estado >= 500) toast.error('Error al cargar configuración');
      const data = leido.bien ? leido.cuerpo : null;
      if (data?.data) {
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
          barcodeLength: data.data.settings.barcodeLength ?? 9,
          avisosCorreo: data.data.settings.avisosCorreo ?? ''
        });
        setEntornosMseller(data.data.settings.entornosMseller || []);
        setHasMsellerPassword(!!data.data.settings.hasMsellerPassword);
        setSubscription(data.data.subscription || null);
        setAvailablePlans(data.data.availablePlans || []);
        await cargarPuentes();
      }
    } catch (err) {
      toast.error('Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  }, [cargarPuentes]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardandoYa.current) return;
    guardandoYa.current = true;
    setSubmitting(true);
    try {
      const leido = await leerRespuesta<{ avisos?: string[] }>(await fetch('/api/v1/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Auditoria ISO-16: el ambiente viaja con las credenciales. Sin el, el
        // servidor no sabe a cual pertenecen y no las guarda.
        body: JSON.stringify({ ...formData, msellerCredencialesEntorno: credencialesEntorno })
      }));
      if (leido.bien) {
        toast.success('Configuración guardada exitosamente');
        // Guardar y surtir efecto no son lo mismo: si la copia en cache no se
        // pudo tirar, lo que acabas de escribir no esta activo todavia.
        for (const aviso of leido.cuerpo.avisos ?? []) {
          toast.warning(aviso, { duration: 12000 });
        }
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

        //  LOTE 187: SE VUELVE A LEER DEL SERVIDOR (pedido del dueño).
        //
        //  Hasta aqui, guardar no releia nada: la pantalla se quedaba con lo que
        //  se habia ESCRITO, no con lo que quedo GUARDADO. Y no son lo mismo --
        //  el servidor recorta espacios, convierte un campo vacio en nulo y
        //  puede rechazar un valor --, asi que lo que veias podia no ser lo que
        //  habia en la base, sin ninguna señal.
        //
        //  Se recarga con `fetchSettings()` y no con `location.reload()`: trae
        //  los mismos datos, sin perder la pestaña en la que estas ni parpadear,
        //  y ademas refresca lo que NO se envio en el formulario -- como el
        //  motivo por el que los avisos no pueden salir.
        await fetchSettings();
      } else {
        toast.error(leido.mensaje || 'Error al guardar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      guardandoYa.current = false;
      setSubmitting(false);
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

  return {
    loading, submitting, userRole, currentUser, setCurrentUser, entornosMseller, credencialesEntorno, setCredencialesEntorno,
    hasMsellerPassword, claveYaConfigurada, showMsellerPassword, setShowMsellerPassword, subscription, availablePlans,
    formData, setFormData, correoDeAvisos, isSistemas, isAdministracion, isNameDisabled, isRncDisabled,
    fetchSettings, handleSave, handleLogoUpload,
  };
}

export type Ajustes = ReturnType<typeof useAjustes>;
