/**
 * El RNC de una empresa que se da de alta: que forma tiene y cuando ya esta tomado.
 *
 * DE DONDE SALE (lote 287)
 * ------------------------
 * Hay dos puertas para crear una empresa -- el registro publico
 * (`api/v1/auth/register`) y Administracion (`api/v1/admin/companies`) -- y cada
 * una decidia a su manera que RNC valia y cuando estaba repetido: Administracion
 * admitia cualquier texto de 9 a 11 caracteres (un "101-00100" con guion pasaba) y
 * contestaba 400; el registro ni preguntaba, porque metia siempre '101001001'.
 * La regla vive aqui y la usan las dos.
 *
 * LA FORMA es la del padron (`rncBuscable`, lote 198): solo digitos, 9 (RNC) u 11
 * (cedula). Es la misma con la que la consulta a la DGII decide si buscar, asi que
 * un RNC que se puede buscar es un RNC que se puede registrar, y al reves.
 *
 * Fichero puro: el unico import es otro modulo puro. Se ejecuta en el banco.
 */
import { rncBuscable } from '@/services/dgii/padronDeRnc';

export const RNC_INVALIDO = 'El RNC o cédula de la empresa debe tener 9 u 11 dígitos.';

/**
 * Lo que se le dice a quien intenta dar de alta una empresa que ya existe.
 *
 * NO es una invitacion a entrar: un RNC ya registrado nunca da acceso (auditoria
 * F0-02). Se le dice a quien pedirselo, que es el unico camino.
 */
export const RNC_YA_REGISTRADO =
  'Ya hay una empresa registrada con ese RNC o cédula. Si trabajas en ella, pide a su administrador que te cree un usuario.';

/** El RNC tal como se guarda (solo digitos), o `null` si no tiene la forma. */
export function rncDeLaEmpresa(texto: string | null | undefined): string | null {
  return rncBuscable(texto);
}

/**
 * ¿Este error es el indice unico de `companies.rnc`?
 *
 * Hace falta ademas de la consulta previa: dos altas con el mismo RNC a la vez
 * pasan las dos la consulta, y la segunda choca con `companies_rnc_idx` al
 * insertar. Eso tiene que ser el mismo 409, no un 500.
 *
 * Drizzle ENVUELVE el error de postgres.js ("Failed query: ...") y el codigo viaja
 * en `cause` (la leccion del lote 197), asi que se recorre la cadena. Se exige el
 * NOMBRE del indice: un 23505 de otra tabla (el correo del usuario, por ejemplo)
 * no es un RNC repetido y decirlo seria mentir.
 */
export function esRncRepetidoEnLaBase(error: unknown): boolean {
  let e: unknown = error;
  for (let i = 0; i < 5 && e && typeof e === 'object'; i++) {
    const o = e as { code?: unknown; constraint_name?: unknown; constraint?: unknown; cause?: unknown };
    if (o.code === '23505' && (o.constraint_name === 'companies_rnc_idx' || o.constraint === 'companies_rnc_idx')) return true;
    e = o.cause;
  }
  return false;
}
