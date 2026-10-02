/**
 * Que se pinta en cada pestana de Configuracion (lote 239). Era una cadena de
 * condiciones en la pagina (`!loading && activeTab === ... &&`, seis veces);
 * aqui es una pregunta: cual es la pestana.
 *
 * Dos guardas que vienen de la pagina de siempre y no sobran: el perfil no se
 * pinta hasta saber quien es el usuario, y la tienda solo para administracion
 * y sistemas aunque alguien llegara a esa pestana sin poder verla.
 */
import type { PestanaDeAjustes } from '../ajustes';
import type { Ajustes } from '../hooks/useAjustes';
import type { Puentes } from '../hooks/useCuentasPuente';
import type { TiposDeGasto } from '../hooks/useTiposDeGasto';
import type { PortadaDeAjustes } from '../hooks/usePortadaDeLaTienda';
import { MiPerfil } from './MiPerfil';
import { FormularioEmpresa } from './FormularioEmpresa';
import { PortadaDeLaTienda } from './PortadaDeLaTienda';
import { PlanYSuscripcion } from './PlanYSuscripcion';
import { CuentasPuente } from './CuentasPuente';
import { TiposDeGastos } from './TiposDeGastos';

export function ContenidoDeLaPestana({ pestana, a, p, g, portada, puedeConfigurar }: {
  pestana: PestanaDeAjustes; a: Ajustes; p: Puentes; g: TiposDeGasto; portada: PortadaDeAjustes; puedeConfigurar: boolean;
}) {
  switch (pestana) {
    case 'perfil':
      return a.currentUser ? <MiPerfil a={a} usuario={a.currentUser} /> : null;
    case 'empresa':
      return <FormularioEmpresa a={a} />;
    case 'tienda':
      return puedeConfigurar ? <PortadaDeLaTienda portada={portada} /> : null;
    case 'suscripcion':
      return <PlanYSuscripcion subscription={a.subscription} availablePlans={a.availablePlans} />;
    case 'puente':
      return <CuentasPuente p={p} />;
    case 'gastos':
      return <TiposDeGastos g={g} />;
  }
}
