/**
 * permisosRutas.vitest.ts
 *
 * Guarda permanente del hallazgo ISO-03 de la auditoria.
 *
 * 54 de las 177 rutas de la API comprobaban que hubiera sesion, pero no que el
 * usuario tuviera permiso: cualquier sesion valida de la empresa las abria.
 * Eso incluia nomina, saldos bancarios, estados de cuenta y reportes
 * financieros, accesibles para un cajero -- o para quien se registrara desde
 * la tienda publica antes de ISO-02.
 *
 * La causa de fondo es que la autorizacion se delego al middleware perimetral
 * (`src/proxy.ts`), que Next.js nunca carga porque el archivo no se llama
 * `middleware.ts` (ISO-01). Mientras eso siga asi, cada ruta responde de lo
 * suyo, y una ruta que no comprueba nada no comprueba nada.
 *
 * Esta prueba recorre el arbol de rutas y falla si aparece una nueva sin
 * comprobacion de permisos. La lista PENDIENTES es lo que quedaba abierto al
 * cerrar el lote de nomina, banco, financiero y reportes: **solo puede
 * encogerse**. Si se corrige una ruta hay que sacarla de la lista, y la propia
 * prueba lo exige.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const RAIZ = join(__dirname, '..', '..');
const API = join(RAIZ, 'src', 'app', 'api');

/**
 * Formas validas de comprobar autorizacion. `requirePermission` es la que
 * introdujo la correccion de ISO-03; las demas ya existian en el codigo.
 */
const COMPROBACIONES = [
  'requirePermission',
  'enforcePermission',
  'enforceAdminOrSistemas',
  'isAdminOrSistemas',
  'hasPermission',
];

/**
 * Rutas que todavia verifican sesion pero no permiso. Cada una es deuda
 * conocida, no un olvido. Al corregir una, quitarla de aqui.
 *
 * Notas sobre por que algunas no se cerraron en el mismo lote:
 *  - `auth/*` y `jobs/[jobId]` operan sobre la propia sesion del solicitante.
 *  - `dgii/rnc/[rnc]` la consumen facturacion, compras y clientes a la vez:
 *    asignarle un modulo equivocado rompe el alta de clientes.
 *  - `storage/*` lo usan muchas pantallas (logo, avatar, imagenes de producto).
 *  - los `print`/`pdf` heredan el permiso de su modulo de origen y conviene
 *    cerrarlos junto a el.
 */
const PENDIENTES = new Set([
  'documents/email/[type]/[id]/route.ts',
  'documents/pdf/[type]/[id]/route.ts',
  'documents/share/[type]/[id]/route.ts',
  'storefront/quotes/route.ts',
  'v1/admin/permissions/route.ts',
  'v1/admin/sessions/route.ts',
  'v1/auth/audit/route.ts',
  'v1/auth/logout/route.ts',
  'v1/auth/me/route.ts',
  'v1/auth/profile/route.ts',
  'v1/auth/refresh/route.ts',
  'v1/auth/route-mappings/route.ts',
  'v1/cash/sessions/[id]/print/route.ts',
  'v1/cash/sessions/[id]/ticket/route.ts',
  'v1/categories/route.ts',
  'v1/company/settings/route.ts',
  'v1/customers/[id]/history/route.ts',
  'v1/dgii/rnc/[rnc]/route.ts',
  'v1/expenses/[id]/print/route.ts',
  'v1/invoices/[id]/print/route.ts',
  'v1/jobs/[jobId]/route.ts',
  'v1/ocr/route.ts',
  'v1/quotes/[id]/pdf/route.ts',
  'v1/quotes/[id]/print/route.ts',
  'v1/storage/delete/route.ts',
  'v1/storage/upload/route.ts',
  'v1/tools/print/route.ts',
]);

function rutasApi(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const p = join(dir, entrada);
    if (statSync(p).isDirectory()) rutasApi(p, acc);
    else if (entrada === 'route.ts') acc.push(p);
  }
  return acc;
}

const ARCHIVOS = rutasApi(API).map((p) => ({
  id: relative(API, p).split('\\').join('/'),
  contenido: readFileSync(p, 'utf8'),
}));

/**
 * Comparacion explicita del rol dentro del propio handler, como hacen las
 * rutas de administracion (`session.role !== 'sistemas'`). Es una comprobacion
 * valida, aunque menos declarativa que `requirePermission`.
 */
const COMPARACION_DE_ROL = /\.role\s*(?:!==|===)\s*['"]/;

const usaSesion = (c: string) => c.includes('verifyAuth');
const compruebaPermiso = (c: string) =>
  COMPROBACIONES.some((f) => c.includes(f)) || COMPARACION_DE_ROL.test(c);

describe('ISO-03 · comprobacion de permisos en las rutas de la API', () => {
  it('el arbol de rutas se recorre correctamente', () => {
    expect(ARCHIVOS.length).toBeGreaterThan(100);
  });

  it('ninguna ruta nueva verifica sesion sin verificar permiso', () => {
    const sinPermiso = ARCHIVOS.filter(
      (a) => usaSesion(a.contenido) && !compruebaPermiso(a.contenido) && !PENDIENTES.has(a.id)
    ).map((a) => a.id);

    expect(
      sinPermiso,
      'Estas rutas comprueban la sesion pero no el permiso. Anade requirePermission ' +
        '(o la comprobacion que corresponda) al handler, o justifica la excepcion ' +
        'anadiendola a PENDIENTES con su motivo.'
    ).toEqual([]);
  });

  it('la lista PENDIENTES no tiene entradas obsoletas', () => {
    const porId = new Map(ARCHIVOS.map((a) => [a.id, a.contenido]));

    const inexistentes = [...PENDIENTES].filter((id) => !porId.has(id));
    expect(inexistentes, 'Rutas de PENDIENTES que ya no existen: quitarlas.').toEqual([]);

    const yaCorregidas = [...PENDIENTES].filter((id) => compruebaPermiso(porId.get(id) || ''));
    expect(
      yaCorregidas,
      'Estas rutas ya comprueban permisos: quitarlas de PENDIENTES para que la lista siga encogiendo.'
    ).toEqual([]);
  });

  it('las rutas sensibles del lote corregido comprueban permiso', () => {
    const cerradas = [
      'v1/hr/employees/route.ts',
      'v1/hr/payroll/route.ts',
      'v1/hr/settlements/route.ts',
      'v1/hr/vacations/route.ts',
      'v1/bank/accounts/route.ts',
      'v1/bank/transactions/route.ts',
      'v1/financial/dashboard/route.ts',
      'v1/reports/receivables/route.ts',
      'v1/reports/balances/customers/route.ts',
      'v1/reports/balances/suppliers/route.ts',
      'v1/invoices/report/route.ts',
      'v1/expenses/report/route.ts',
      'v1/bi/stats/route.ts',
    ];
    const porId = new Map(ARCHIVOS.map((a) => [a.id, a.contenido]));

    for (const id of cerradas) {
      const contenido = porId.get(id);
      expect(contenido, `No se encontro la ruta ${id}`).toBeDefined();
      expect(compruebaPermiso(contenido || ''), `${id} perdio su comprobacion de permisos`).toBe(true);
    }
  });
});
