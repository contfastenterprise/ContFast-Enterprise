/**
 * Los filtros de la lista de conduces (lote 245): por ESTADO y por RANGO DE
 * FECHA. Pedido del dueño (2026-10-02).
 *
 * Puro -- sin React, sin base y sin red -- porque lo usan los dos lados: la
 * pantalla para armar lo que pide, y la ruta para leerlo. Una sola lista de
 * estados y una sola regla de fechas; si cada lado tuviera la suya, la pantalla
 * ofreceria un filtro que el servidor no entiende.
 *
 * LA FECHA ES LA DE ENTREGA (`delivery_date`), que es la que ensena la tabla.
 * Es una columna `date` -- un DIA, no un instante --, asi que se compara tal
 * cual, sin convertir zona: "se convierte lo que es un instante; un dia ya es
 * un dia" (lote 205). Convertirla correria los conduces un dia.
 *
 * UN FILTRO QUE NO SE ENTIENDE SE RECHAZA, NO SE IGNORA. Un parametro que
 * nadie lee no falla: devuelve la lista entera en silencio, y quien filtro por
 * "Despachado" creeria que todos lo estan (el "parametro sordo" del lote 135).
 */
import { esDiaReal } from '@/utils/fechasLocales';

export const ESTADOS_DE_CONDUCE = [
  { valor: 'draft', nombre: 'Borrador' },
  { valor: 'approved', nombre: 'Despachado' },
  { valor: 'voided', nombre: 'Anulado' },
] as const;

export type EstadoDeConduce = (typeof ESTADOS_DE_CONDUCE)[number]['valor'];

export type FiltrosDeConduces = { estado?: EstadoDeConduce; desde?: string; hasta?: string };

/** Lo que hay escrito en la barra de filtros: vacio es "sin filtrar". */
export type FiltrosEscritos = { estado: string; desde: string; hasta: string };
export const SIN_FILTROS: FiltrosEscritos = { estado: '', desde: '', hasta: '' };

const esEstado = (v: string): v is EstadoDeConduce => ESTADOS_DE_CONDUCE.some((e) => e.valor === v);

export type FiltrosLeidos = { bien: true; filtros: FiltrosDeConduces } | { bien: false; mensaje: string };

/** Lee `estado`, `desde` y `hasta` de la direccion. Lo que falta o va vacio no filtra; lo que no se entiende, se rechaza. */
export function leerFiltrosDeConduces(parametros: { get(nombre: string): string | null }): FiltrosLeidos {
  const estado = (parametros.get('estado') ?? '').trim();
  const desde = (parametros.get('desde') ?? '').trim();
  const hasta = (parametros.get('hasta') ?? '').trim();

  if (estado && !esEstado(estado)) return { bien: false, mensaje: 'El estado del filtro no es válido.' };
  if (desde && !esDiaReal(desde)) return { bien: false, mensaje: 'La fecha inicial del filtro no es válida.' };
  if (hasta && !esDiaReal(hasta)) return { bien: false, mensaje: 'La fecha final del filtro no es válida.' };
  //  Las dos son AAAA-MM-DD: se ordenan como texto igual que como fechas.
  if (desde && hasta && desde > hasta) return { bien: false, mensaje: 'La fecha inicial no puede ser posterior a la final.' };

  const filtros: FiltrosDeConduces = {};
  if (estado && esEstado(estado)) filtros.estado = estado;
  if (desde) filtros.desde = desde;
  if (hasta) filtros.hasta = hasta;
  return { bien: true, filtros };
}

/** Lo que la pantalla anade a la peticion: solo lo que este puesto. */
export function parametrosDeFiltros(f: FiltrosEscritos): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.estado) out.estado = f.estado;
  if (f.desde) out.desde = f.desde;
  if (f.hasta) out.hasta = f.hasta;
  return out;
}

export const hayFiltros = (f: FiltrosEscritos): boolean => Boolean(f.estado || f.desde || f.hasta);
