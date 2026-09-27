'use client';

/**
 * Lote 208 -- la RUTA se queda; el cuerpo vive en un componente.
 *
 * El dueño pidio sacar Inteligencia de Negocios del menu lateral y verla desde el inicio.
 * Lo que se retira es la ENTRADA DEL MENU, no la pantalla: la ruta sigue respondiendo
 * porque hay enlaces guardados apuntando aqui y porque su fila de `route_mappings` es la
 * que dice quien puede verla. Esa fila tampoco se borra -- solo deja de ser elemento de
 * menu (`isMenuItem: false`) --, que es la leccion del lote 190: borrar una fila de esa
 * tabla afecta a las SEIS empresas y puede quitarle el acceso a un rol entero sin aviso.
 */
import VistaInteligenciaNegocio from '@/components/bi/vista-inteligencia-negocio';

export default function BIDashboardPage() {
  return <VistaInteligenciaNegocio />;
}
