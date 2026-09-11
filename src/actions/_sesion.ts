/**
 * El contexto de sesion de las acciones de servidor, en UN solo sitio.
 *
 * Estaba copiado palabra por palabra en `receivables.ts` y en `payables.ts`, y
 * en `documents.ts` directamente no estaba: esas dos acciones recibian el
 * `companyId` COMO PARAMETRO, es decir, se lo decia quien llamaba.
 *
 * Tres copias de la misma funcion son tres sitios donde el proximo arreglo se
 * aplica dos veces y se olvida una. Esto no lleva `'use server'` a proposito:
 * es un ayudante de servidor, no una accion, y un fichero marcado como accion
 * expone TODO lo que exporta.
 */
import { cookies } from 'next/headers';
import * as jwt from 'jsonwebtoken';
import { modoDeCookie } from '@/services/dgii/modoPeticion';
import type { ModoOperativo } from '@/services/dgii/modoPeticion';

export interface ContextoDeSesion {
  userId: string;
  companyId: string;
  role: string;
  /** Lo necesita `enforcePermission` para resolver el permiso del ROL. */
  roleId: string;
  modo: ModoOperativo;
}

/** Devuelve el contexto, o `null` si no hay sesion valida. No lanza. */
export async function contextoDeSesion(): Promise<ContextoDeSesion | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) return null;

  try {
    // Auditoria F0-04: sin valor por defecto. El resto del sistema ya aborta al
    // arrancar si falta JWT_SECRET (src/middleware/auth.ts), asi que aceptar un
    // secreto publico aqui solo abria la puerta a tokens forjados.
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('La variable de entorno JWT_SECRET es obligatoria.');
    }
    const decoded = jwt.verify(token, secret) as {
      userId: string;
      companyId: string;
      role: string;
      roleId: string;
    };

    // Accion de servidor: lee la cookie directamente. Puede faltar o venir
    // vieja -- ninguno de los dos casos debe romper la operacion. Ausente o
    // desconocida, ambas caen a PRUEBA; modoDeCookie no lanza nunca.
    const reqModo = modoDeCookie(
      cookieStore.get('cf_environment')?.value,
      'la cookie cf_environment'
    );

    return {
      userId: decoded.userId,
      companyId: decoded.companyId,
      role: decoded.role,
      roleId: decoded.roleId,
      modo: reqModo,
    };
  } catch {
    return null;
  }
}

/** Igual que el anterior, pero exige sesion. Lanza si no la hay. */
export async function exigirSesion(): Promise<ContextoDeSesion> {
  const ctx = await contextoDeSesion();
  if (!ctx) {
    const err: Error & { status?: number; code?: string } = new Error('No autorizado');
    err.status = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  return ctx;
}
