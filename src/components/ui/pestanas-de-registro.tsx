/**
 * Las dos pestanas de una pantalla con alta de registro: la LISTA y REGISTRAR
 * (lotes 240 y 241). Pedido del dueño (2026-10-02): "todas las paginas de la
 * seccion de inventario que lleven nuevo registro, que sean con tab, al igual
 * que compras".
 *
 * Sustituyen al boton suelto "Nuevo ..." y al modal que abria: el formulario
 * pasa a ocupar la pagina, sin barra de desplazamiento propia. El aspecto es el
 * del conmutador de Compras.
 *
 * Solo pinta. Que hay en cada pestana, y que significa "registrar" (vaciar el
 * formulario, soltar lo que se estaba editando), lo decide cada pantalla.
 */
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';

const base = 'px-4 py-2 rounded-lg text-xs font-bold transition';
const activa = 'bg-white text-[#003366] shadow-sm';
const inactiva = 'text-slate-500 hover:text-slate-800';

export function PestanasDeRegistro({ enFormulario, lista, icono, alVerLista, alRegistrar, editando = false }: {
  /** El formulario esta abierto (la pestana activa es la de registrar). */
  enFormulario: boolean;
  /** Como se llama la lista: "Almacenes", "Categorías", "Conduces"... */
  lista: string;
  icono?: ReactNode;
  alVerLista: () => void;
  alRegistrar: () => void;
  /** Se esta editando un registro que ya existe: la pestana lo dice. */
  editando?: boolean;
}) {
  return (
    <div className="bg-slate-50 p-1 rounded-lg flex gap-1 border border-slate-200 shrink-0">
      <button type="button" onClick={alVerLista} aria-pressed={!enFormulario} className={`${base} ${!enFormulario ? activa : inactiva}`}>
        {icono}{lista}
      </button>
      <button type="button" onClick={alRegistrar} aria-pressed={enFormulario} className={`${base} ${enFormulario ? activa : inactiva}`}>
        <Plus className="h-4 w-4 inline mr-1.5" />{enFormulario && editando ? 'Editando' : 'Registrar'}
      </button>
    </div>
  );
}

/** La caja del formulario cuando ocupa la pagina: cabecera con el titulo, y el contenido debajo. */
export function PanelDeRegistro({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50 rounded-t-xl">
        <h2 className="text-lg font-bold text-[#003366] font-display">{titulo}</h2>
        {descripcion && <p className="text-xs text-slate-500 mt-0.5">{descripcion}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
