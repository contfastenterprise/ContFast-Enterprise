'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Shield, ShieldCheck, ShieldAlert, LayoutDashboard, FileText,
  Wallet, Landmark, BookOpen, Settings, X, Users, Truck,
  Package, HandCoins, Receipt, PieChart, Building2, ArrowRightLeft,
  History as HistoryIcon, Banknote, PackageMinus, Tag, FileMinus,
  Calculator, Layers, ChevronDown, Search, Command, Loader2, Star,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useRbac } from '@/components/providers/rbacContext';
import { buildSidebar, getGroupIcon, getIconComponent, RouteMapping } from '@/utils/rbacHelpers';
import { coincideEnAlguno } from '@/utils/buscarTexto';
import { unaEntradaPorRuta } from '@/utils/menuSinRepetidos';
import {
  alternarFavorito, esFavorito, favoritosVisibles, sugerenciasIniciales,
} from '@/utils/favoritosDelMenu';
import { grupoRecienAbierto } from '@/utils/grupoRecienAbierto';
import { gruposDesdeTexto, favoritosDesdeTexto } from '@/utils/preferenciasDelMenu';
import { usePreferenciaDelNavegador } from '@/hooks/usePreferenciaDelNavegador';

// ─── Types ───────────────────────────────────────────────────────────────────

type Entorno = 'TEST' | 'CERT' | 'PROD';

interface NavItemDef {
  name: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
}

/**
 *  LOTE 189: el grupo viaja con el elemento. `getAllSearchableItems` lo tiraba
 *  (`g.items.map` se quedaba solo con el item), y por eso el buscador tenia que
 *  enseñar la URL cruda -- `/dashboard/ecf` -- en la columna derecha. Una URL no
 *  le dice nada a quien busca; el grupo si: "Comprobantes · Ingresos".
 */
interface NavItemBuscable extends NavItemDef {
  grupo: string;
}

interface NavGroupDef {
  title: string;
  items: NavItemDef[];
  icon: React.ElementType;
}

/**
 *  DONDE SE GUARDA QUE GRUPOS ESTAN ABIERTOS (lote 189).
 *
 *  El dueño lo describio asi: "tiende a ocultarse y hay que hacer scroll para
 *  buscar y seleccionar". Medido: 50 elementos de menu en 9 grupos, o sea 59
 *  filas con todo abierto. Y `expandedGroups` era un `useState` sin persistencia
 *  DENTRO de `SidebarContent`, del que hay DOS instancias -- escritorio y cajon
 *  movil --, asi que:
 *
 *    · al recargar se plegaba todo menos el grupo de la pagina actual;
 *    · el cajon del movil empezaba plegado CADA vez que se abria, porque es otra
 *      instancia con su propio estado.
 *
 *  Decision del dueño (2026-09-24): se recuerda lo que dejo abierto. El estado
 *  sube al padre -- una sola verdad para las dos instancias -- y se guarda en el
 *  navegador.
 */
const CLAVE_GRUPOS = 'contfast:sidebar:grupos-abiertos';

//  LOTE 195: los valores de partida, en constantes y no escritos en la llamada.
//  Son el HTML que pinta el servidor y con el que React compara al hidratar, asi
//  que conviene que se vean de una vez y en un solo sitio.
const VACIO_GRUPOS: Record<string, boolean> = {};
const VACIO_FAVORITOS: string[] = [];

/**
 *  DONDE SE GUARDA LO ANCLADO (lote 191).
 *
 *  Es del NAVEGADOR y no de la base, como los grupos abiertos, y eso es una
 *  decision: lo anclado es una preferencia de quien se sienta delante, igual que el
 *  zoom o el tema. Guardarlo en la base obligaria a una tabla, una migracion y una
 *  ruta para algo que si se pierde solo cuesta tres clics. Consecuencia asumida:
 *  quien entre desde otro ordenador empieza sin anclas.
 *
 *  La clave lleva `favoritos` y no `anclados` porque lo que se guarda son RUTAS
 *  (`/dashboard/invoices`), y es lo mismo que lee el buscador.
 */
const CLAVE_FAVORITOS = 'contfast:sidebar:favoritos';

/**
 *  LOTE 195: AQUI ESTABAN LAS CUATRO FUNCIONES DE `localStorage`.
 *
 *  Leer y escribir se fue a `hooks/usePreferenciaDelNavegador`, y la validacion de
 *  lo guardado a `utils/preferenciasDelMenu` -- que, siendo puro, un banco si puede
 *  ejecutar (antes se comprobaba leyendo el texto del fichero: que la linea
 *  estuviera escrita, no que funcionara).
 *
 *  No es una mudanza por orden: aqui habia un DEFECTO. Las dos preferencias se leian
 *  en el INICIALIZADOR del `useState`, asi que el servidor pintaba todo plegado y el
 *  navegador pintaba lo que estuviera guardado. React lo detecta como
 *  'Hydration failed... didn't match' y vuelve a construir el arbol entero en el
 *  cliente, en cada carga de cada pantalla. Lo reporto el dueño el 2026-09-25.
 */
interface AppSidebarProps {
  //  LOTE 193: se fueron `user`, `companies`, `companyName`, `onSwitchCompany` y
  //  `switching`: eran todas del selector de empresa, que ahora vive en la cabecera.
  //  `entorno` SE QUEDA aunque su rotulo tambien se fuera (lote 192): con el se
  //  calcula el hueco de la franja de PRUEBA, y sin el el menu se metia debajo.
  entorno: Entorno;
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAllSearchableItems(
  routeMappings: RouteMapping[],
  hasPermission: (module: string, action: string) => boolean,
  userRole: string
): NavItemBuscable[] {
  //  UNA ENTRADA POR RUTA (lote 190).
  //
  //  `route_mappings` puede tener VARIAS filas para la misma pantalla, una por
  //  cada modulo de permisos que da acceso a ella. Medido el 2026-09-24:
  //  `/dashboard/antiguedad-saldos` tiene dos, `cobros` y `proveedores`, para que
  //  la vea tanto quien lleva los cobros como quien lleva los suplidores. NO es
  //  un duplicado por error y no se puede borrar ninguna: borrar una le quitaria
  //  la entrada del menu a un rol entero.
  //
  //  El sidebar ya lo tenia en cuenta (`seenHrefs` en `SidebarContent`); este
  //  buscador no, y por eso "Antiguedad de Saldos" salia DOS VECES en Ctrl+K.
  //  Se queda la primera, que es la del modulo con menor `order_index` segun el
  //  orden que ya trae `buildSidebar`.
  //  La regla vive en `utils/menuSinRepetidos`, fuera de este fichero: aqui
  //  dentro -- con `'use client'`, React e iconos -- un banco no la puede cargar
  //  para ejecutarla, y un banco que reimplementa la regla comprueba su copia, no
  //  el codigo. Eso paso en la primera version de este lote.
  return unaEntradaPorRuta(
    buildSidebar(routeMappings, hasPermission, userRole).flatMap(g =>
      g.items.map(item => ({
        name: item.name,
        href: item.href,
        icon: getIconComponent(item.iconName),
        grupo: g.title,
      }))
    )
  );
}

// ─── NavItem (Clean, System-token light theme) ─────────────────────────────────

function NavItem({
  item, pathname, collapsed, onClick, isSubItem, refActivo, anclado, onAnclar,
}: {
  item: NavItemDef; pathname: string; collapsed: boolean; onClick?: () => void; isSubItem?: boolean;
  //  LOTE 189: el enlace ACTIVO se deja anotar para poder traerlo a la vista.
  //  Con 59 filas posibles y el scrollbar que estaba oculto, la pantalla en la
  //  que estas podia quedar debajo del pliegue y habia que buscarla a mano.
  refActivo?: React.Ref<HTMLAnchorElement>;
  //  LOTE 191: la estrella. `onAnclar` sin dar = fila sin estrella, que es lo que
  //  hacen el menu plegado (solo caben los iconos) y la propia lista de anclados.
  anclado?: boolean;
  onAnclar?: () => void;
}) {
  const isActive =
    pathname === item.href ||
    (item.href !== '/dashboard' && pathname.startsWith(item.href));

  const conEstrella = !!onAnclar && !collapsed;

  const enlace = (
    <Link
      href={item.href}
      ref={isActive ? refActivo : undefined}
      onClick={onClick}
      title={collapsed ? item.name : undefined}
      className={clsx(
        'group flex items-center rounded-xl transition duration-300 select-none w-full relative',
        collapsed ? 'justify-center p-3' : clsx('px-3.5 py-2.5', isSubItem ? 'pl-8 text-[12px] gap-2.5' : 'gap-3 text-[13px]'),
        //  Hueco para la estrella: sin el, un nombre largo se corta DEBAJO de ella
        //  y no se lee ni el nombre ni se ve bien el icono.
        conEstrella && 'pr-9',
        isActive
          ? 'bg-[#003366] text-white font-bold border border-[#003366]/20 shadow-[0_4px_12px_rgba(0,51,102,0.15)]'
          : 'text-on-surface-variant/80 hover:bg-[#003366]/10 hover:text-[#003366] border border-transparent',
      )}
    >
      {/* Active side indicator */}
      {isActive && !collapsed && (
        <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r bg-primary shadow-[0_0_6px_rgba(0,51,102,0.4)]" />
      )}
      <item.icon
        className={clsx(
          'shrink-0 transition duration-300',
          collapsed ? 'w-[20px] h-[20px]' : isSubItem ? 'w-[15px] h-[15px]' : 'w-[18px] h-[18px]',
          isActive
            ? 'text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.2)]'
            : 'text-on-surface-variant/50 group-hover:text-on-surface group-hover:scale-105',
        )}
        strokeWidth={isActive ? 2 : 1.5}
      />
      {!collapsed && (
        <span className="tracking-wide truncate">{item.name}</span>
      )}
    </Link>
  );

  if (!conEstrella) return enlace;

  //  LA ESTRELLA VA FUERA DEL ENLACE, no dentro.
  //
  //  Un `<button>` dentro de un `<a>` es HTML invalido, y en la practica pasa algo
  //  peor que un aviso del validador: el clic navega igual -- el enlace es el
  //  ancestro y recibe el evento --, asi que anclar te sacaria de la pagina. Por
  //  eso es un hermano en posicion absoluta.
  //
  //  Y ademas del `preventDefault` hay `stopPropagation`: en el cajon del movil el
  //  contenedor lleva `onItemClick` para cerrarse, y anclar no debe cerrar el menu.
  return (
    <div className="relative group/fila">
      {enlace}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAnclar(); }}
        title={anclado ? `Quitar "${item.name}" de Favoritos` : `Anclar "${item.name}" en Favoritos`}
        aria-label={anclado ? `Quitar ${item.name} de Favoritos` : `Anclar ${item.name} en Favoritos`}
        aria-pressed={anclado}
        className={clsx(
          'absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition cursor-pointer',
          //  Sin anclar, la estrella solo aparece al pasar por encima: cincuenta
          //  estrellas apagadas a la vez son ruido, y lo que se busca es la fila.
          //  Anclada se ve siempre, porque es la unica señal de que lo esta.
          //  `focus-visible` la saca tambien con el teclado -- si no, quien navega
          //  con tabulador llegaria a un boton que no se ve.
          anclado
            ? 'opacity-100'
            : 'opacity-0 group-hover/fila:opacity-100 focus-visible:opacity-100',
          isActive
            ? 'text-white/70 hover:text-white hover:bg-white/15'
            : 'text-on-surface-variant/40 hover:text-amber-500 hover:bg-amber-500/10',
          anclado && !isActive && 'text-amber-500',
        )}
      >
        <Star
          className="w-[14px] h-[14px]"
          strokeWidth={1.75}
          fill={anclado ? 'currentColor' : 'none'}
        />
      </button>
    </div>
  );
}

// ─── SearchModal ─────────────────────────────────────────────────────────────

function SearchModal({ onClose, favoritos }: { onClose: () => void; favoritos: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { hasPermission, routeMappings, user } = useRbac();
  const allItems = getAllSearchableItems(routeMappings, hasPermission, user?.role || '');

  //  LOTE 189: SIN TILDES Y TAMBIEN POR GRUPO.
  //
  //  Antes filtraba con `name.toLowerCase().includes(query.toLowerCase())`, que
  //  deja fuera lo que nadie escribe con acento: buscar "facturacion" no
  //  encontraba "Facturacion" con tilde. La comparacion vive ahora en
  //  `utils/buscarTexto`, porque el mismo problema lo tiene cualquier filtro por
  //  nombre de la aplicacion.
  //
  //  Y se busca tambien por el GRUPO: quien escribe "finanzas" espera ver lo que
  //  hay dentro de Finanzas, aunque ninguno de esos elementos se llame asi.
  //  LOTE 191: CON LA CAJA VACIA, LO ANCLADO PRIMERO.
  //
  //  Antes era `allItems.slice(0, 7)`: los siete primeros del menu, que para quien
  //  abre Ctrl+K es un orden arbitrario -- los del grupo que `buildSidebar` puso
  //  primero, no los que usa. Asi el buscador obligaba a escribir SIEMPRE, incluso
  //  para ir a la pantalla de cada dia.
  //
  //  La regla vive en `utils/favoritosDelMenu` y no aqui: en este fichero, con
  //  `'use client'`, React e iconos, un banco no puede cargarla para ejecutarla
  //  (leccion del lote 190).
  const results = query.trim()
    ? allItems.filter(i => coincideEnAlguno([i.name, i.grupo], query))
    : sugerenciasIniciales(allItems, favoritos, 7);

  //  EL TECLADO, QUE ERA LO QUE FALTABA. Solo se atendia `Escape`: escribias,
  //  aparecian los resultados y habia que ir al raton. Un buscador que obliga a
  //  soltar el teclado a mitad no es rapido.
  const [seleccion, setSeleccion] = useState(0);

  //  Al cambiar lo escrito, la seleccion vuelve al primero: si se quedara donde
  //  estaba, Enter abriria algo que ya no es lo que se esta viendo.
  useEffect(() => { setSeleccion(0); }, [query]);

  const handleSelect = (href: string) => {
    router.push(href);
    onClose();
  };

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      //  Da la vuelta: con nueve grupos y cincuenta elementos, llegar al final y
      //  quedarse atascado obliga a subir a mano.
      setSeleccion(i => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSeleccion(i => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const elegido = results[seleccion];
      if (elegido) handleSelect(elegido.href);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm px-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-surface-container-lowest border border-outline-variant/40 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center px-4 border-b border-outline-variant/20">
          <Search className="w-[18px] h-[18px] text-on-surface-variant/40 mr-3 shrink-0" strokeWidth={1.5} />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={alTeclear}
            className="flex-1 bg-transparent py-4.5 outline-none text-[14px] text-on-surface placeholder:text-on-surface-variant/40"
            placeholder="Buscar módulo o acción..."
          />
          <span className="hidden sm:flex items-center gap-1 mr-2 text-[10px] text-on-surface-variant/40">
            <kbd className="px-1.5 py-0.5 bg-surface-container border border-outline-variant/30 rounded font-mono">&uarr;&darr;</kbd>
            moverse
            <kbd className="px-1.5 py-0.5 bg-surface-container border border-outline-variant/30 rounded font-mono ml-1">&crarr;</kbd>
            abrir
          </span>
          <kbd
            onClick={onClose}
            className="hidden sm:inline-flex items-center h-6 px-2 text-[10px] font-mono text-on-surface-variant/50 bg-surface-container border border-outline-variant/30 rounded-lg cursor-pointer hover:text-on-surface transition-colors"
          >
            ESC
          </kbd>
        </div>
        <div className="max-h-72 overflow-y-auto custom-scrollbar">
          {results.length > 0 ? (
            <div className="p-2 flex flex-col gap-0.5">
              {results.map((item, i) => (
                <button
                  key={item.href}
                  onClick={() => handleSelect(item.href)}
                  onMouseEnter={() => setSeleccion(i)}
                  ref={i === seleccion ? (el) => { el?.scrollIntoView({ block: 'nearest' }); } : undefined}
                  className={[
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors group',
                    i === seleccion
                      ? 'bg-surface-container-low text-on-surface'
                      : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface',
                  ].join(' ')}
                >
                  <item.icon
                    className={[
                      'w-4 h-4 shrink-0 transition-colors',
                      i === seleccion ? 'text-primary' : 'text-on-surface-variant/40 group-hover:text-primary',
                    ].join(' ')}
                    strokeWidth={1.5}
                  />
                  <span className="text-[13px] flex-1">{item.name}</span>
                  {/*  LOTE 191: se dice POR QUE esta ahi. Sin esto, con la caja
                       vacia, lo anclado y el relleno se ven exactamente igual y
                       la lista parece otra vez arbitraria.  */}
                  {esFavorito(favoritos, item.href) && (
                    <Star className="w-3 h-3 shrink-0 text-amber-500" fill="currentColor" strokeWidth={1.75} />
                  )}
                  <span className="text-[10px] text-on-surface-variant/40 truncate max-w-[160px]">
                    {item.grupo}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <Command className="w-8 h-8 text-on-surface-variant/20" strokeWidth={1.5} />
              <p className="text-[13px] text-on-surface-variant/40">
                Sin resultados para &quot;{query}&quot;
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SidebarContent (Glow and Accordion) ────────────────────────────────────────

function SidebarContent({
  entorno,
  collapsed, onItemClick,
  expandedGroups, toggleGroup, abrirGrupo,
  favoritos, alternarAnclado, subirGrupo,
}: {
  entorno: Entorno;
  collapsed: boolean; onItemClick?: () => void;
  //  LOTE 189: el estado de los grupos viene de FUERA. Antes lo tenia cada
  //  instancia, y hay dos -- escritorio y cajon movil --, asi que lo que abrias
  //  en una no existia en la otra y el movil empezaba plegado cada vez.
  expandedGroups: Record<string, boolean>;
  toggleGroup: (title: string) => void;
  abrirGrupo: (title: string) => void;
  //  LOTE 191: lo anclado viene de FUERA por el mismo motivo que los grupos, y
  //  ademas porque el buscador -- que es del padre, no de aqui -- lo necesita.
  favoritos: string[];
  alternarAnclado: (href: string) => void;
  //  LOTE 194: que grupo acaba de abrir esta persona, y con que numero de clic.
  //  El numero (`sello`) no es decorativo: sin el, abrir DOS VECES el mismo grupo
  //  no cambiaria el valor y el efecto no volveria a dispararse -- el segundo clic
  //  no subiria nada. Y como hay dos instancias de este componente (escritorio y
  //  cajon movil), no se puede limpiar el aviso despues de usarlo: la primera que
  //  corriera se lo quitaria a la otra. Con un sello que cambia en cada clic las
  //  dos se enteran y no hay nada que limpiar.
  subirGrupo: { titulo: string; sello: number } | null;
}) {
  const pathname = usePathname();
  const { hasPermission, routeMappings, user: rbacUser } = useRbac();

  const dynamicGroups: NavGroupDef[] = buildSidebar(routeMappings, hasPermission, rbacUser?.role || '').map(g => {
    const items: { name: string; href: string; icon: any }[] = [];
    const seenHrefs = new Set<string>();
    g.items.forEach(item => {
      if (seenHrefs.has(item.href)) return;
      seenHrefs.add(item.href);
      items.push({
        name: item.name,
        href: item.href,
        icon: getIconComponent(item.iconName),
      });
      if (item.name === 'Productos') {
        const barcodeHref = '/dashboard/products/barcodes';
        if (!seenHrefs.has(barcodeHref)) {
          seenHrefs.add(barcodeHref);
          items.push({
            name: 'Barcode',
            href: barcodeHref,
            icon: getIconComponent('Barcode'),
          });
        }
      }
    });
    return {
      title: g.title,
      icon: getGroupIcon(g.title),
      items
    };
  });

  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);

  //  El grupo de la pagina actual se abre solo. Esto se queda: entrar a una
  //  pantalla y no ver donde estas dentro del menu desorienta.
  useEffect(() => {
    dynamicGroups.forEach(g => {
      const active = g.items.some(item => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)));
      if (active) abrirGrupo(g.title);
    });
  }, [pathname, routeMappings]);

  //  LOTE 189: EL ELEMENTO ACTIVO SE TRAE A LA VISTA.
  //
  //  No habia un solo `scrollIntoView` en este fichero. Con 59 filas posibles, la
  //  pagina en la que estas puede caer debajo del pliegue -- y como el scrollbar
  //  esta oculto, ni se ve que haya mas abajo. Habia que buscarla a mano en cada
  //  navegacion.
  //
  //  `block: 'nearest'` a proposito: mueve lo justo para que se vea, sin
  //  centrarla de un salto cada vez que cambias de pantalla.
  const refActivo = React.useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    refActivo.current?.scrollIntoView({ block: 'nearest' });
  }, [pathname, expandedGroups]);

  //  LOTE 194: EL GRUPO QUE ACABAS DE ABRIR SUBE A LA PARTE DE ARRIBA.
  //
  //  Pedido del dueño. Con 50 elementos en 9 grupos, pulsar un grupo de la mitad
  //  de abajo -- Sistema, Finanzas, RRHH -- abria su submenu DEBAJO DEL PLIEGUE:
  //  pulsabas para ver algo y lo que se despliega no se veia, asi que habia que
  //  hacer scroll otra vez. `block: 'start'` lo lleva arriba, y el submenu se
  //  despliega hacia abajo en el sitio que acaba de quedar libre.
  //
  //  ESTE EFECTO VA DESPUES DEL DE ARRIBA A PROPOSITO, Y NO ES INDIFERENTE.
  //  Los dos reaccionan al mismo cambio de estado y piden cosas contrarias: el de
  //  arriba trae el elemento ACTIVO con `nearest` (mover lo menos posible) y este
  //  lleva la cabecera del grupo ARRIBA. React ejecuta los efectos de un
  //  componente en el orden en que estan escritos, asi que el ultimo es el que
  //  deja el scroll donde queda. Si alguien los intercambia, al abrir un grupo el
  //  menu volveria a saltar al elemento activo y esto dejaria de funcionar sin que
  //  faltara una linea. Hay una comprobacion en el banco que vigila el orden.
  //
  //  `abrirGrupo` NO pasa por aqui: el grupo de la pagina actual se abre solo en
  //  cada navegacion, y si eso subiera el menu, entrar a cualquier pantalla daria
  //  un salto que nadie pidio. Solo sube lo que se abre con el dedo.
  const refsDeGrupo = React.useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    if (!subirGrupo) return;
    refsDeGrupo.current[subirGrupo.titulo]?.scrollIntoView({ block: 'start' });
  }, [subirGrupo]);

  //  LOTE 191: LO ANCLADO, CRUZADO CON LO QUE ESTA PERSONA PUEDE VER.
  //
  //  `dynamicGroups` ya viene de `buildSidebar`, o sea filtrado por permisos, asi
  //  que un ancla a una pantalla que ya no se ve -- permiso retirado, o ruta que
  //  desaparecio, como el modulo de documentos del lote 100 -- se ignora sola. El
  //  ancla NO se borra: si el permiso vuelve, sigue ahi.
  const anclados = favoritosVisibles(dynamicGroups.flatMap(g => g.items), favoritos);

  return (
    <>
      {/*  LOTE 193: AQUI ESTABA EL SELECTOR DE EMPRESA.
           Se fue a la cabecera, a peticion del dueño. Aqui abajo el nombre de la
           empresa estaba REPETIDO -- la cabecera ya lo enseñaba en texto plano -- y,
           con el menu plegado, el selector se quedaba en un cuadrito con la inicial
           que no se podia pulsar: el unico sitio donde se cambia de empresa
           desaparecia justo cuando el menu esta estrecho.  */}

      <div className="h-px bg-outline-variant/20 mx-4 mb-3" />

      {/* Nav Groups */}
      {/*  LOTE 189: LA BARRA DE SCROLL DEJA DE ESTAR OCULTA.
           Aqui habia `[&::-webkit-scrollbar]:hidden` y `[scrollbar-width:none]`
           en una lista de hasta 59 filas: habia scroll, pero nada te decia que
           hubiera mas abajo ni donde estabas, y no habia barra que agarrar. Es la
           mitad de "hay que hacer scroll para buscar" que reporto el dueño.
           `custom-scrollbar` es la clase fina que ya usan el buscador y el
           selector de empresa de este mismo fichero.  */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-4 flex flex-col gap-2 mt-1 relative">
        {/*  LOTE 191: LO ANCLADO, ARRIBA Y SIEMPRE A LA VISTA.
             Esto es lo que convierte 50 elementos en 5: no hay que abrir el grupo,
             ni hacer scroll, ni acordarse de en que grupo cayo la pantalla.
             Solo se pinta si hay algo anclado -- una cabecera "Favoritos" sobre una
             lista vacia seria una fila gastada de las que se querian ahorrar.  */}
        {anclados.length > 0 && (
          <div className="flex flex-col gap-1">
            {!collapsed && (
              <div className="flex items-center gap-2 px-3.5 pt-0.5 pb-1">
                <Star className="w-3 h-3 shrink-0 text-amber-500" fill="currentColor" strokeWidth={1.75} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/45">
                  Favoritos
                </span>
              </div>
            )}
            {anclados.map(item => (
              <NavItem
                key={`anclado-${item.href}`}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
                onClick={onItemClick}
                anclado
                onAnclar={() => alternarAnclado(item.href)}
                /*  A PROPOSITO SIN `refActivo`: la misma pantalla aparece dos veces
                    -- aqui y en su grupo -- y un solo `ref` no puede apuntar a las
                    dos; la que se pintara ultima ganaria. Se queda con la del grupo,
                    que es la que puede estar debajo del pliegue. Esta ya esta
                    arriba: no hace falta traerla a la vista.  */
              />
            ))}
            <div className="h-px bg-outline-variant/25 mx-1 mt-1.5" />
          </div>
        )}
        {dynamicGroups.map(group => {
          const visible = group.items;
          if (visible.length === 0) return null;

          const isPrincipal = group.title === 'Principal';
          const hasSubmenu = !isPrincipal && visible.length > 1;

          if (!hasSubmenu) {
            return (
              <div key={group.title} className="flex flex-col gap-1">
                {visible.map(item => (
                  <NavItem
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    collapsed={collapsed}
                    onClick={onItemClick}
                    refActivo={refActivo}
                    anclado={esFavorito(favoritos, item.href)}
                    onAnclar={() => alternarAnclado(item.href)}
                  />
                ))}
              </div>
            );
          }

          const isExpanded = !!expandedGroups[group.title];
          const isGroupActive = visible.some(item => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)));

          return (
            <div
              key={group.title}
              className="flex flex-col gap-1 relative"
              onMouseEnter={() => setHoveredGroup(group.title)}
              onMouseLeave={() => setHoveredGroup(null)}
            >
              {collapsed ? (
                <div className="relative">
                  <button
                    title={group.title}
                    className={clsx(
                      'group flex items-center justify-center rounded-xl w-full p-3 transition duration-300 select-none cursor-pointer',
                      isGroupActive
                        ? 'bg-primary/10 text-primary font-bold border border-primary/20'
                        : 'text-on-surface-variant/80 hover:bg-surface-container-high hover:text-on-surface border border-transparent'
                    )}
                  >
                    <group.icon
                      className={clsx(
                        'shrink-0 transition duration-300 w-[20px] h-[20px]',
                        isGroupActive ? 'text-primary drop-shadow-[0_0_4px_rgba(0,51,102,0.15)]' : 'text-on-surface-variant/50 group-hover:text-on-surface'
                      )}
                      strokeWidth={isGroupActive ? 2 : 1.5}
                    />
                  </button>

                  {/* Popover Submenu */}
                  <AnimatePresence>
                    {hoveredGroup === group.title && (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-[54px] top-0 bg-surface-container-lowest border border-outline-variant/40 shadow-2xl rounded-xl py-2 z-[70] min-w-[190px] flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100"
                      >
                        <div className="px-3 py-1.5 text-[10px] font-bold text-on-surface-variant/45 border-b border-outline-variant/10 uppercase mb-1.5 tracking-wider">
                          {group.title}
                        </div>
                        {visible.map(item => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={onItemClick}
                            className={clsx(
                              'flex items-center gap-2.5 px-3 py-2.5 text-[12px] text-on-surface-variant hover:bg-[#003366]/10 hover:text-[#003366] transition-colors',
                              pathname === item.href && 'bg-[#003366] text-white font-bold border-l-2 border-[#003366]'
                            )}
                          >
                            <item.icon className="w-4 h-4 text-on-surface-variant/45" strokeWidth={1.5} />
                            {item.name}
                          </Link>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <>
                  <button
                    ref={(el) => { refsDeGrupo.current[group.title] = el; }}
                    onClick={() => toggleGroup(group.title)}
                    className={clsx(
                      'group flex items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] text-on-surface-variant/80 hover:bg-[#003366]/10 hover:text-[#003366] transition duration-300 w-full cursor-pointer select-none font-semibold border border-transparent',
                      isGroupActive && 'text-primary font-bold'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <group.icon
                        className={clsx(
                          'w-[18px] h-[18px] shrink-0 text-on-surface-variant/50 group-hover:text-on-surface transition-colors',
                          isGroupActive && 'text-primary'
                        )}
                        strokeWidth={isGroupActive ? 2 : 1.5}
                      />
                      <span className="tracking-wide">{group.title}</span>
                    </div>
                    <ChevronDown
                      className={clsx(
                        'w-3.5 h-3.5 transition-transform duration-200 text-on-surface-variant/30 group-hover:text-on-surface-variant/60',
                        isExpanded && 'rotate-180'
                      )}
                      strokeWidth={1.5}
                    />
                  </button>

                  {/* Sub-items list with expansion animation */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden flex flex-col gap-1 pl-2 border-l border-[#003366]/40 ml-[22px] my-1"
                      >
                        {visible.map(item => (
                          <NavItem
                            key={item.href}
                            item={item}
                            pathname={pathname}
                            collapsed={collapsed}
                            onClick={onItemClick}
                            isSubItem={true}
                            refActivo={refActivo}
                            anclado={esFavorito(favoritos, item.href)}
                            onAnclar={() => alternarAnclado(item.href)}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          );
        })}
      </nav>

      {/*  LOTE 192: AQUI ESTABAN EL ROTULO DEL ENTORNO Y "CERRAR SESION".
           Los dos se fueron a la barra de arriba, a peticion del dueño: el entorno
           al lado de la campana (sin etiqueta, con globo al pasar por encima) y
           cerrar sesion DENTRO del avatar.
           Por que no se quedan aqui: los dos desaparecian con el menu plegado, y
           gastaban dos filas fijas de un menu de cincuenta elementos para decir
           cosas que no cambian durante la sesion. Con el menu plegado ademas el
           rotulo del entorno no se enseñaba, que es cuando mas falta hace saber si
           lo que se emite vale.  */}
    </>
  );
}

// ─── NewAppSidebar (main export) ───────────────────────────────────────────────

export default function NewAppSidebar({
  entorno, collapsed, mobileOpen, onMobileClose,
}: AppSidebarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [diagExpanded, setDiagExpanded] = useState(false);

  //  LOTE 189: QUE GRUPOS ESTAN ABIERTOS, AQUI Y NO EN CADA INSTANCIA.
  //
  //  Hay DOS `SidebarContent` -- escritorio y cajon movil --, y cada una tenia su
  //  propio `useState`. Consecuencia: lo que abrias en el escritorio no existia
  //  en el movil, y el cajon del movil empezaba plegado cada vez que se abria.
  //  Con el estado aqui arriba hay UNA sola verdad para las dos.
  //
  //  Y se recuerda (decision del dueño, 2026-09-24): con 50 elementos en 9
  //  grupos, volver a plegar todo en cada recarga obliga a rehacer el mismo
  //  camino cada dia.
  //
  //  LOTE 195: la preferencia se restaura DESPUES de montar y ANTES de pintar, no en
  //  el inicializador. Leerla en el inicializador hacia que el servidor pintase todo
  //  plegado y el navegador otra cosa -- error de hidratacion en cada carga. El
  //  porque de `useLayoutEffect`, y por que no se ve ningun salto, esta en el hook.
  const [expandedGroups, setExpandedGroups] = usePreferenciaDelNavegador<Record<string, boolean>>(
    CLAVE_GRUPOS, VACIO_GRUPOS, gruposDesdeTexto,
  );

  //  LOTE 194: al alternar un grupo se apunta si lo que ha pasado es que se ABRIO.
  //  La decision es de `utils/grupoRecienAbierto`, fuera de este fichero, para que
  //  se pueda ejecutar en un banco.
  //
  //  Se calcula con el estado que se ve al pulsar y no dentro del actualizador de
  //  React: meter un `setState` (o escribir en un `ref`) dentro del actualizador es
  //  un efecto colateral que en modo estricto se ejecuta dos veces. Es un clic, no
  //  hay carrera que temer.
  const [subirGrupo, setSubirGrupo] = useState<{ titulo: string; sello: number } | null>(null);

  const toggleGroup = React.useCallback((title: string) => {
    const siguiente = { ...expandedGroups, [title]: !expandedGroups[title] };
    setExpandedGroups(siguiente);
    const abierto = grupoRecienAbierto(expandedGroups, siguiente);
    //  El sello cambia en cada clic: abrir dos veces el mismo grupo tiene que
    //  subirlo las dos veces, y sin el sello el valor seria el mismo y el efecto no
    //  se volveria a disparar.
    if (abierto) setSubirGrupo(prev => ({ titulo: abierto, sello: (prev?.sello ?? 0) + 1 }));
  }, [expandedGroups]);

  //  Abrir NO es alternar: el grupo de la pagina actual se abre solo, y si eso
  //  llamara a `toggleGroup` lo cerraria cuando ya estuviera abierto.
  const abrirGrupo = React.useCallback((title: string) => {
    setExpandedGroups(prev => (prev[title] ? prev : { ...prev, [title]: true }));
  }, []);

  //  LOTE 191: LO ANCLADO, TAMBIEN AQUI ARRIBA.
  //
  //  Tres consumidores a la vez: las dos instancias de `SidebarContent`
  //  (escritorio y cajon movil) y el buscador de Ctrl+K, que tambien es hijo de
  //  este componente. Si el estado viviera en `SidebarContent`, anclar en el
  //  escritorio no se veria en el movil ni en el buscador -- exactamente el defecto
  //  que el lote 189 arreglo con los grupos.
  //
  //  LOTE 195: igual que los grupos -- se restaura antes de pintar, no en el
  //  inicializador. Mover las filas justo cuando alguien va a hacer clic era el
  //  motivo de leerlo cuanto antes, y con `useLayoutEffect` se sigue cumpliendo sin
  //  romper la hidratacion.
  const [favoritos, setFavoritos] = usePreferenciaDelNavegador<string[]>(
    CLAVE_FAVORITOS, VACIO_FAVORITOS, favoritosDesdeTexto,
  );

  //  La regla de anclar/desanclar vive en `utils/favoritosDelMenu`: aqui solo se
  //  guarda el resultado.
  const alternarAnclado = React.useCallback((href: string) => {
    setFavoritos(prev => alternarFavorito(prev, href));
  }, []);
  const { hasPermission, routeMappings, user: rbacUser } = useRbac();

  const auditGroups = buildSidebar(routeMappings, hasPermission, rbacUser?.role || '');

  // ⌘K global shortcut
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const topOffset = entorno !== 'PROD' ? 'pt-24' : 'pt-14';

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <aside
        className={clsx(
          'hidden md:flex flex-col fixed left-0 top-0 h-full z-40',
          'border-r border-outline-variant/30 bg-slate-50/95 backdrop-blur-2xl shadow-[5px_0_30px_rgba(0,0,0,0.02)]',
          'transition-[width] duration-300 ease-in-out overflow-hidden',
          topOffset,
          collapsed ? 'w-[70px]' : 'w-[260px]',
        )}
      >
        {/* Top spacing for sidebar */}
        <div className="pt-4" />

        {/* Search button */}
        <div className={clsx('px-3 pt-3 pb-2', !collapsed && 'px-4')}>
          <button
            id="sidebar-search-btn"
            onClick={() => setSearchOpen(true)}
            className={clsx(
              'w-full flex items-center rounded-xl px-3 py-2 border border-outline-variant/20 bg-surface-container-low',
              'text-on-surface-variant/60 hover:bg-surface-container hover:text-on-surface transition duration-300 group',
              collapsed ? 'justify-center' : 'gap-3',
            )}
            title={collapsed ? 'Buscar (⌘K)' : undefined}
          >
            <Search className="w-[17px] h-[17px] shrink-0 text-on-surface-variant/40 group-hover:text-on-surface transition-colors" strokeWidth={1.5} />
            {!collapsed && (
              <>
                <span className="text-[13px] tracking-wide flex-1 text-left">Buscar</span>
                <kbd className="text-[10px] font-mono text-on-surface-variant/30 bg-surface-container border border-outline-variant/20 rounded px-1.5">
                  ⌘K
                </kbd>
              </>
            )}
          </button>
        </div>

        <SidebarContent
          entorno={entorno}
          collapsed={collapsed}
          expandedGroups={expandedGroups}
          toggleGroup={toggleGroup}
          abrirGrupo={abrirGrupo}
          favoritos={favoritos}
          alternarAnclado={alternarAnclado}
          subirGrupo={subirGrupo}
        />
      </aside>

      {/* ── Mobile Drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-[70] md:hidden flex">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={onMobileClose}
              className="fixed inset-0 bg-black"
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative bg-slate-50/95 backdrop-blur-2xl h-full w-[260px] flex flex-col pt-6 z-[80] border-r border-outline-variant/30 shadow-2xl"
            >
              {/* Top spacing for mobile sidebar */}
              <div className="pt-2" />

              {/* Close button */}
              <button
                onClick={onMobileClose}
                className="absolute top-4 right-4 p-2 rounded-xl text-on-surface-variant/50 hover:bg-surface-container hover:text-on-surface transition-colors"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>

              {/* Search */}
              <div className="px-4 pt-2 pb-2">
                <button
                  onClick={() => { setSearchOpen(true); onMobileClose(); }}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2 border border-outline-variant/20 bg-surface-container-low text-on-surface-variant/50 hover:bg-surface-container hover:text-on-surface transition duration-300"
                >
                  <Search className="w-[17px] h-[17px] shrink-0 text-on-surface-variant/40" strokeWidth={1.5} />
                  <span className="text-[13px] tracking-wide flex-1 text-left">Buscar</span>
                </button>
              </div>

              <SidebarContent
                entorno={entorno}
                collapsed={false}
                onItemClick={onMobileClose}
                expandedGroups={expandedGroups}
                toggleGroup={toggleGroup}
                abrirGrupo={abrirGrupo}
                favoritos={favoritos}
                alternarAnclado={alternarAnclado}
                subirGrupo={subirGrupo}
              />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* ── Search Modal ── */}
      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          favoritos={favoritos}
        />
      )}

      {/* ── Diagnostic Panel (RBAC) ── */}
      {rbacUser?.role === 'sistemas' && (
        diagExpanded ? (
          <div className="fixed bottom-4 right-4 z-[9999] bg-[#0c1020]/95 backdrop-blur border border-indigo-500/40 shadow-2xl p-4 rounded-xl max-w-xs text-[11px] font-mono text-slate-200">
            <div 
              onClick={() => setDiagExpanded(false)}
              className="font-bold text-indigo-400 mb-1.5 flex justify-between items-center pb-1 border-b border-white/5 cursor-pointer hover:text-indigo-300 select-none"
              title="Minimizar panel"
            >
              <span>Diagnóstico RBAC</span>
              <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[9px] uppercase">Sys ✕</span>
            </div>
            <div className="space-y-1">
              <div><strong>Rol Client:</strong> {rbacUser?.role || 'null'}</div>
              <div><strong>Permisos:</strong> {rbacUser?.permissions?.length || 0}</div>
              <div><strong>Route Mappings:</strong> {routeMappings?.length || 0}</div>
              <div><strong>Grupos Sidebar:</strong> {auditGroups?.length || 0}</div>
              <div className="mt-1.5 pt-1.5 border-t border-white/5 max-h-32 overflow-y-auto">
                <strong>Compilados:</strong>
                {auditGroups.length === 0 ? (
                  <div className="text-rose-400 mt-0.5">Vacío. Filtros bloqueados.</div>
                ) : (
                  auditGroups.map(g => (
                    <div key={g.title} className="text-emerald-400 text-[10px]">
                      • {g.title} ({g.items.length})
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setDiagExpanded(true)}
            className="fixed bottom-4 right-4 z-[9999] bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-lg border border-indigo-400/30 transition-transform active:scale-95 select-none"
            title="Mostrar panel de diagnóstico"
          >
            Diagnóstico RBAC (Sys)
          </button>
        )
      )}
    </>
  );
}
