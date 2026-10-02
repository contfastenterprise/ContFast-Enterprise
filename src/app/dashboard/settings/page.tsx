'use client';

/**
 * Configuracion. Desde el lote 238 la pagina es el armazon: las pestanas y que
 * se pinta en cada una. El estado vive en cuatro hooks que crea ELLA (ajustes,
 * cuentas puente, tipos de gasto y portada de la tienda), para que lo escrito
 * en una pestana sobreviva a cambiar a otra, como antes de partirla.
 *
 * Lote 239: lo que una pestana necesita pedir se pide AL ELEGIRLA (`elegir`),
 * no en un efecto que mira cual esta activa: la portada de la tienda y los
 * tipos de gasto. Es una accion del usuario, y se atiende en esa accion.
 */
import { useState } from 'react';
import { Settings as SettingsIcon, RefreshCw } from 'lucide-react';
import { usePortadaDeLaTienda } from './hooks/usePortadaDeLaTienda';
import { useAjustes } from './hooks/useAjustes';
import { useCuentasPuente } from './hooks/useCuentasPuente';
import { useTiposDeGasto } from './hooks/useTiposDeGasto';
import type { PestanaDeAjustes } from './ajustes';
import { PestanasDeAjustes } from './components/PestanasDeAjustes';
import { ContenidoDeLaPestana } from './components/ContenidoDeLaPestana';
import { ModalTipoDeGasto } from './components/ModalTipoDeGasto';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<PestanaDeAjustes>('perfil');
  const portada = usePortadaDeLaTienda();
  const p = useCuentasPuente();
  const a = useAjustes(p.cargar);
  const g = useTiposDeGasto();
  const puedeConfigurar = a.isAdministracion || a.isSistemas;

  const elegir = (pestana: PestanaDeAjustes) => {
    setActiveTab(pestana);
    if (pestana === 'tienda') void portada.cargar();
    if (pestana === 'gastos') void g.fetchExpenseTypes();
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

          <PestanasDeAjustes activa={activeTab} puedeConfigurar={puedeConfigurar} alElegir={elegir} />
        </div>

        {a.loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" />
          </div>
        ) : (
          <ContenidoDeLaPestana pestana={activeTab} a={a} p={p} g={g} portada={portada} puedeConfigurar={puedeConfigurar} />
        )}

        {/* Modal: Crear/Editar Tipo de Gasto */}
        {g.showTypeModal && (
          <ModalTipoDeGasto g={g} />
        )}
      </div>
    </div>
  );
}
