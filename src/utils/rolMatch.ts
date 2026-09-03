/**
 * Comparacion EXACTA de rol contra los roles fijos de privilegio elevado.
 *
 * LO QUE PASO (auditoria del 2026-09-03, hallazgo P0-02)
 * --------------------------------------------------------
 * `middleware/permissions.ts` ya habia corregido este patron una vez
 * (comentario "Auditoria F0-05"): `role.includes('admin'|'sistema')` dejaba
 * pasar cualquier rol cuyo NOMBRE contuviera esas letras -- un rol creado de
 * buena fe como "Admin de Almacen" o "Soporte de Sistemas" obtenia privilegio
 * total sin que nadie se lo otorgara. La correccion (comparacion exacta) solo
 * se aplico ahi. El mismo patron roto seguia vivo, sin corregir, en:
 *   - proxy.ts (middleware de Edge: acceso total inmediato a TODAS las rutas
 *     mapeadas -- contabilidad, banco, nomina, reportes, admin -- para
 *     cualquier "isSistemas")
 *   - services/auth/rbacService.ts (genera los permisos que se firman en el
 *     JWT en login/refresh)
 *   - app/api/v1/expenses/[id]/route.ts (UNICO guardia del DELETE: permite
 *     borrar una compra y su asiento contable completo)
 *   - repositories/adminRepository.ts, services/invoice/invoiceDbBooker.ts,
 *     utils/rbacHelpers.ts (sidebar del cliente)
 *
 * Por que no se importo simplemente `isAdminOrSistemas` de
 * `middleware/permissions.ts` en todos esos sitios: ese archivo importa el
 * cliente de base de datos (`@/db`, drizzle+postgres). `proxy.ts` corre en el
 * runtime Edge de Next.js, que no soporta ese driver -- importarlo ahi rompe
 * el build. `rbacHelpers.ts` se usa desde componentes de cliente (el sidebar);
 * arrastrar el cliente de base de datos al bundle del navegador seria un
 * error igual de real, aunque de otro tipo.
 *
 * Esta funcion no importa NADA (ni base de datos, ni Node, ni React) para que
 * cualquier archivo -- Edge, cliente o servidor -- pueda usarla como la unica
 * fuente de verdad de esta comparacion, sin arrastrar dependencias
 * incompatibles con su entorno de ejecucion.
 */

export function esSistemas(roleName: string | null | undefined): boolean {
  return (roleName || '').toLowerCase().trim() === 'sistemas';
}

export function esAdministracion(roleName: string | null | undefined): boolean {
  return (roleName || '').toLowerCase().trim() === 'administracion';
}

export function esAdminOSistemas(roleName: string | null | undefined): boolean {
  return esSistemas(roleName) || esAdministracion(roleName);
}
