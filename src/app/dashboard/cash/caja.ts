/**
 * Tipos y ayudantes de la pantalla de Caja. Salieron de `page.tsx` al partirla
 * (lote 229), sin cambiar una linea: los comparten la pagina, sus hooks y sus
 * componentes.
 */
import { DENOMINACIONES } from '@/services/caja/conteoDeCaja';
// ─── Types ────────────────────────────────────────────────────────────────────
export type CashView = 'loading' | 'apertura' | 'gestion' | 'arqueo' | 'historico';

export interface Session {
  id: string;
  status: string;
  initialBalance: string;
  //  Lote 228: solo llega si quien mira puede verlo (arqueo ciego del 172);
  //  `saldoVisible` dice cual de los dos casos es.
  expectedBalance?: string;
  saldoVisible?: boolean;
  cashRegisterId: string;
  createdAt: string;
}

export interface Movement {
  id: string;
  type: 'sale' | 'refund' | 'cash_in' | 'cash_out';
  amount: string;
  description?: string;
  reference?: string;
  createdAt: string;
}

export interface Register {
  id: string;
  name: string;
  code: string;
}

export interface HistorySession {
  id: string;
  status: string;
  initialBalance: string;
  expectedBalance: string;
  actualBalance: string | null;
  difference: string | null;
  // Lote 176: cuando un responsable dio la diferencia por revisada. Mientras
  // esté vacío, el panel avisa.
  approvedAt: string | null;
  createdAt: string;
  closedAt: string | null;
  userId: string;
  registerName: string | null;
}

// ─── Currency formatter ────────────────────────────────────────────────────────
export const fmt = (val: number | string) =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(typeof val === 'string' ? parseFloat(val) : val);

// ─── Denomination data ─────────────────────────────────────────────────────────
// Lote 172: la lista viene de `services/caja/conteoDeCaja.ts`, que es la misma
// que valida el servidor, e incluye las MONEDAS. Aqui solo se le pone color:
// si el color viviera en la lista compartida, el servidor arrastraria clases de
// CSS. Una denominacion sin color entra igual, en gris.
export const COLOR_DENOM: Record<number, string> = {
  2000: 'bg-blue-100 border-blue-200 text-blue-800',
  1000: 'bg-red-100 border-red-200 text-red-800',
  500: 'bg-green-100 border-green-200 text-green-800',
  200: 'bg-orange-100 border-orange-200 text-orange-800',
  100: 'bg-amber-100 border-amber-200 text-amber-800',
  50: 'bg-purple-100 border-purple-200 text-purple-800',
};
export const DENOMINATIONS = DENOMINACIONES.map((d) => ({
  value: d.valor,
  label: d.etiqueta,
  tipo: d.tipo,
  color: COLOR_DENOM[d.valor] || 'bg-slate-100 border-slate-200 text-slate-700',
}));

// ─── Movement type display helpers ────────────────────────────────────────────
export const movType = (type: string) => ({
  sale: { label: 'Venta', colorClass: 'text-blue-700' },
  refund: { label: 'Devolución', colorClass: 'text-amber-700' },
  cash_in: { label: 'Entrada', colorClass: 'text-green-700' },
  cash_out: { label: 'Salida', colorClass: 'text-red-700' },
}[type] ?? { label: type, colorClass: 'text-on-surface-variant/80' });
