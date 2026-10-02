import { NextResponse } from 'next/server';
import { Logger } from '@/utils/logger';
import { ConflictoDePrecios, FaltaLaMigracionDeDolares } from './preciosEnDolaresRepositorio';

/** Las respuestas comunes de las tres rutas de precios en dolares (lote 247). */
export const noAutenticado = () =>
  NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } }, { status: 401 });

export const rechazo = (status: number, code: string, message: string) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

export const soloAdministracion = () =>
  rechazo(403, 'FORBIDDEN', 'Solo administración puede cambiar la tasa, los costos en dólares y los precios.');

export function fallo(error: unknown, donde: string) {
  const e = error as Error & { status?: number; code?: string };
  if (e.status === 403) return rechazo(403, e.code || 'FORBIDDEN', e.message);
  if (e instanceof FaltaLaMigracionDeDolares) return rechazo(409, 'MIGRATION_PENDING', e.message);
  if (e instanceof ConflictoDePrecios) return rechazo(409, 'CONFLICT', e.message);
  Logger.error(`[precios-en-dolares] ${donde}`, { motivo: e.message });
  return rechazo(500, 'SERVER_ERROR', 'No se pudo completar la operación.');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
