'use client';

/**
 * Configuracion. Desde el lote 238 la pagina es el armazon: las pestanas y que
 * se pinta en cada una. El estado vive en cuatro hooks que crea ELLA (ajustes,
 * cuentas puente, tipos de gasto y portada de la tienda), para que lo escrito
 * en una pestana sobreviva a cambiar a otra, como antes de partirla.
 */
import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, RefreshCw } from 'lucide-react';
import { PortadaDeLaTienda } from './components/PortadaDeLaTienda';
import { usePortadaDeLaTienda } from './hooks/usePortadaDeLaTienda';
import { useAjustes } from './hooks/useAjustes';
import { useCuentasPuente } from './hooks/useCuentasPuente';
import { useTiposDeGasto } from './hooks/useTiposDeGasto';
import { MiPerfil } from './components/MiPerfil';
import { FormularioEmpresa } from './components/FormularioEmpresa';
import { PlanYSuscripcion } from './components/PlanYSuscripcion';
import { CuentasPuente } from './components/CuentasPuente';
import { TiposDeGastos } from './components/TiposDeGastos';
import { ModalTipoDeGasto } from './components/ModalTipoDeGasto';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'perfil' | 'empresa' | 'tienda' | 'puente' | 'suscripcion' | 'gastos'>('perfil');
  const portada = usePortadaDeLaTienda();
  const p = useCuentasPuente();
  const a = useAjustes(p.cargar);
  const g = useTiposDeGasto();
  const { loading } = a;
  const { fetchExpenseTypes } = g;

  useEffect(() => {
    if (activeTab === 'gastos') {
      fetchExpenseTypes();
    }
  }, [activeTab]);

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
            {(a.isAdministracion || a.isSistemas) && (
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
            {(a.isAdministracion || a.isSistemas) && (
              <button
                onClick={() => { setActiveTab('tienda'); void portada.cargar(); }}
                className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 transition-colors -mb-px ${
                  activeTab === 'tienda'
                    ? 'border-[#003366] text-[#003366]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                Tienda
              </button>
            )}
            {(a.isAdministracion || a.isSistemas) && (
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
            {(a.isAdministracion || a.isSistemas) && (
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
            {(a.isAdministracion || a.isSistemas) && (
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
        ) : activeTab === 'perfil' && a.currentUser ? (
          <MiPerfil a={a} usuario={a.currentUser} />
        ) : activeTab === 'empresa' ? (
          <FormularioEmpresa a={a} />
        ) : null}

        {/* TAB: Tienda (lote 235). Pedido del dueno: la portada en una pestana
            NUEVA, no dentro de Empresa. Carga y guarda lo suyo, sin pasar por
            el formulario grande de la empresa; se pide al pulsar la pestana y
            lo escrito sobrevive a cambiar de pestana (lote 236). */}
        {!loading && activeTab === 'tienda' && (a.isAdministracion || a.isSistemas) && (
          <PortadaDeLaTienda portada={portada} />
        )}

        {/* TAB: Plan & Suscripción */}
        {!loading && activeTab === 'suscripcion' && (
          <PlanYSuscripcion subscription={a.subscription} availablePlans={a.availablePlans} />
        )}

        {/* TAB: Cuentas Puente */}
        {!loading && activeTab === 'puente' && (
          <CuentasPuente p={p} />
        )}

        {/* TAB: Tipos de Gastos */}
        {!loading && activeTab === 'gastos' && (
          <TiposDeGastos g={g} />
        )}

        {/* Modal: Crear/Editar Tipo de Gasto */}
        {g.showTypeModal && (
          <ModalTipoDeGasto g={g} />
        )}
      </div>
    </div>
  );
}
