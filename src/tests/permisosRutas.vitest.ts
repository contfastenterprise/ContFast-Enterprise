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
 *
 * ── AMPLIACION: LAS ACCIONES DE SERVIDOR ──────────────────────────────────
 *
 * Esta guarda recorria `src/app/api/**` y se detenia ahi. Y `src/app/api` no
 * es la unica puerta: una funcion exportada desde un fichero con `'use server'`
 * es un punto HTTP publico, igual que una ruta, solo que sin fichero de ruta
 * que recorrer. Por ese hueco pasaron dos cosas a la vez:
 *
 *   - `actions/receivables.ts` y `actions/payables.ts` comprobaban la sesion
 *     pero no el permiso. La unica puerta que dejaba fuera a los demas era el
 *     menu lateral, y un menu no es control de acceso.
 *
 *   - `actions/documents.ts` no comprobaba NADA, y recibia el `companyId` como
 *     PARAMETRO. Preguntarle a quien llama de que empresa es no acota nada:
 *     quien invoca elige la respuesta.
 *
 * Las tres pruebas de abajo cierran ese hueco por forma, no por lista: una
 * accion nueva sin permiso, o que vuelva a recibir la empresa por parametro,
 * las rompe.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const RAIZ = join(__dirname, '..', '..');
const API = join(RAIZ, 'src', 'app', 'api');

/**
 * Formas validas de comprobar autorizacion. `requirePermission` es la que
 * introdujo la correccion de ISO-03; las demas ya existian en el codigo.
 *
 * `esSistemas` / `esAdminOSistemas` (utils/rolMatch.ts) entraron con P0-02:
 * sustituyen a `session.role !== 'sistemas'` por comparacion exacta, asi que
 * una ruta corregida deja de encajar en COMPARACION_DE_ROL. Sin ellas aqui,
 * esta prueba marcaba como desprotegidas justo las rutas que P0-01 y P0-03
 * habian endurecido.
 */
const COMPROBACIONES = [
  'requirePermission',
  'enforcePermission',
  'enforceAdminOrSistemas',
  'isAdminOrSistemas',
  'hasPermission',
  'esSistemas',
  'esAdminOSistemas',
];

/**
 * Rutas que todavia verifican sesion pero no permiso. Cada una es deuda
 * conocida, no un olvido. Al corregir una, quitarla de aqui.
 *
 * Notas sobre por que algunas no se cerraron en el mismo lote:
 *  - `auth/*` opera sobre la propia sesion del solicitante.
 *  - `dgii/rnc/[rnc]` la consumen facturacion, compras y clientes a la vez:
 *    asignarle un modulo equivocado rompe el alta de clientes.
 *  - `storage/*` lo usan muchas pantallas (logo, avatar, imagenes de producto).
 *  - los `print`/`pdf` heredan el permiso de su modulo de origen y conviene
 *    cerrarlos junto a el.
 */
const PENDIENTES = new Set([
  // `documents/email` y `documents/share` salieron de aqui: ya comprueban
  // `facturacion:read` y `facturacion:write`. La lista solo puede encoger.
  'documents/pdf/[type]/[id]/route.ts',
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
  'v1/customers/[id]/history/route.ts',
  'v1/dgii/rnc/[rnc]/route.ts',
  'v1/expenses/[id]/print/route.ts',
  'v1/invoices/[id]/print/route.ts',
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
      // Salieron de PENDIENTES al cerrarse las acciones de documentos. Aqui
      // quedan fijadas: si alguien les quita la comprobacion, esto se cae en vez
      // de que vuelvan calladas a la lista de deuda.
      'documents/email/[type]/[id]/route.ts',
      'documents/share/[type]/[id]/route.ts',
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

// ═══════════════════════════════════════════════════════════════════════════
//  Las acciones de servidor: la otra puerta
// ═══════════════════════════════════════════════════════════════════════════

const ACCIONES_DIR = join(RAIZ, 'src', 'actions');

/**
 * Ficheros de `src/actions`. Los que empiezan por `_` son ayudantes, no
 * acciones -- y esa distincion importa: un fichero marcado `'use server'`
 * expone TODO lo que exporta.
 */
const ACCIONES = readdirSync(ACCIONES_DIR)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({
    nombre: f,
    esAyudante: f.startsWith('_'),
    contenido: readFileSync(join(ACCIONES_DIR, f), 'utf8'),
  }));

/**
 * La directiva `'use server'` como SENTENCIA, sola en su linea. Buscarla con
 * `includes` era un falso positivo esperando: el propio `_sesion.ts` explica en
 * un comentario que no la lleva, y esa frase la contiene.
 */
const MARCADA_COMO_ACCION = /^\s*['"]use server['"]\s*;?\s*$/m;

/** Trocea un fichero en sus funciones exportadas, por el `export async function`. */
function funcionesExportadas(contenido: string): { nombre: string; cuerpo: string }[] {
  const trozos = contenido.split(/(?=^export async function )/m).slice(1);
  return trozos.map((t) => ({
    nombre: (t.match(/^export async function (\w+)/) || [, '(anonima)'])[1] as string,
    cuerpo: t,
  }));
}

describe('ISO-03 (ampliacion) · las acciones de servidor tambien son puertas', () => {
  it('el directorio de acciones se recorre y tiene la forma que se espera', () => {
    // Comprobar solo que hay ficheros pasaba tambien ANTES de este lote, asi
    // que no comprobaba nada. Apretada: ademas de haber acciones, tiene que
    // estar el ayudante donde vive el contexto de sesion. Si alguien lo borra
    // y vuelve a copiar el contexto en cada accion, esto se cae aqui.
    expect(ACCIONES.some((a) => !a.esAyudante)).toBe(true);
    expect(
      ACCIONES.some((a) => a.nombre === '_sesion.ts'),
      'Falta src/actions/_sesion.ts.'
    ).toBe(true);
  });

  it('toda accion de servidor exportada comprueba permiso', () => {
    const sinPermiso: string[] = [];

    for (const a of ACCIONES) {
      if (a.esAyudante) continue;
      if (!MARCADA_COMO_ACCION.test(a.contenido)) continue;
      for (const fn of funcionesExportadas(a.contenido)) {
        if (!compruebaPermiso(fn.cuerpo)) sinPermiso.push(`${a.nombre}:${fn.nombre}`);
      }
    }

    expect(
      sinPermiso,
      'Estas acciones de servidor son puntos HTTP publicos sin comprobacion de ' +
        'permiso. Anade enforcePermission con el modulo que corresponda.'
    ).toEqual([]);
  });

  it('ninguna accion recibe la empresa o el entorno por parametro', () => {
    // El anti-patron de F0-03: preguntarle a quien llama de que empresa es. Se
    // admite el parametro si esta marcado como ignorado con `_` delante, que es
    // como se conservan los que quedan por compatibilidad con los llamadores.
    const culpables: string[] = [];

    for (const a of ACCIONES) {
      if (a.esAyudante) continue;
      for (const fn of funcionesExportadas(a.contenido)) {
        const firma = fn.cuerpo.slice(0, fn.cuerpo.indexOf(') {') + 1);
        if (/(?<![\w_])(companyId|modo)\s*[?]?\s*:/.test(firma)) {
          culpables.push(`${a.nombre}:${fn.nombre}`);
        }
      }
    }

    expect(
      culpables,
      'Estas acciones reciben companyId o modo como parametro. Una accion de ' +
        'servidor es publica: quien la invoca elige el valor. Sacalos de la sesion.'
    ).toEqual([]);
  });

  it('el contexto de sesion vive en un solo sitio, y ese sitio no es una accion', () => {
    // Estaba copiado palabra por palabra en receivables.ts y payables.ts. Tres
    // copias de lo mismo son tres sitios donde el proximo arreglo se aplica dos
    // veces y se olvida una.
    const conCopia = ACCIONES
      .filter((a) => !a.esAyudante && /async function getAuthContext/.test(a.contenido))
      .map((a) => a.nombre);
    expect(conCopia, 'Copias locales del contexto de sesion: usar src/actions/_sesion.ts.').toEqual([]);

    const sesion = ACCIONES.find((a) => a.nombre === '_sesion.ts');
    expect(sesion, 'Falta src/actions/_sesion.ts, que es donde vive el contexto.').toBeDefined();

    // Y el ayudante NO puede estar marcado como accion: lo expondria entero.
    expect(
      MARCADA_COMO_ACCION.test(sesion?.contenido || ''),
      '_sesion.ts no debe llevar la directiva de accion: es un ayudante, y un ' +
        'fichero marcado como accion expone todo lo que exporta.'
    ).toBe(false);
  });
});
