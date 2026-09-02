/**
 * alcanceStorefront.vitest.ts
 *
 * Guarda permanente del hallazgo ISO-02 de la auditoria.
 *
 * El registro publico de la tienda (POST /api/storefront/auth/register) es
 * anonimo, acepta el nombre de cualquier empresa activa del sistema y emite
 * una sesion normal con rol `cliente`. Mientras esa sesion valiera para
 * /api/v1/*, un desconocido podia registrarse eligiendo la empresa y leer su
 * contabilidad a traves de las rutas que solo comprueban autenticacion y no
 * permisos (banco, nomina, reportes financieros, estados de cuenta).
 *
 * `verifyAuth` acota ahora el alcance de ese rol a la tienda. Esta prueba
 * ejercita la funcion real con tokens firmados y falla si alguien retira la
 * comprobacion o amplia la lista de rutas permitidas sin revisarla.
 *
 * No cubre la superficie completa del storefront: comprueba el punto unico de
 * control, que es donde el fallo se cierra.
 */
import { describe, it, expect, beforeAll } from 'vitest';

// `src/middleware/auth.ts` aborta al importarse si faltan las claves, asi que
// se fijan ANTES del import dinamico.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'clave-de-pruebas-solo-para-vitest-0123456789';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'clave-refresh-de-pruebas-vitest-0123456789';

let verifyAuth: typeof import('@/middleware/auth').verifyAuth;
let NextRequest: typeof import('next/server').NextRequest;
let jwt: typeof import('jsonwebtoken');

beforeAll(async () => {
  ({ verifyAuth } = await import('@/middleware/auth'));
  ({ NextRequest } = await import('next/server'));
  jwt = (await import('jsonwebtoken')).default;
});

function peticion(ruta: string, rol: string) {
  const accessToken = jwt.sign(
    {
      userId: '00000000-0000-4000-8000-000000000001',
      companyId: '00000000-0000-4000-8000-0000000000aa',
      role: rol,
      roleId: '00000000-0000-4000-8000-0000000000bb',
      sessionId: '00000000-0000-4000-8000-0000000000cc',
      allowedWarehouses: [],
      permissions: [],
    },
    process.env.JWT_SECRET as string,
    { expiresIn: '15m' }
  );

  return new NextRequest(`https://contfast.test${ruta}`, {
    headers: { cookie: `accessToken=${accessToken}` },
  });
}

// Muestra de las rutas que quedaban abiertas: verifican sesion pero no permiso.
const RUTAS_ERP_PROHIBIDAS = [
  '/api/v1/bank/accounts',
  '/api/v1/bank/transactions',
  '/api/v1/hr/employees',
  '/api/v1/hr/payroll',
  '/api/v1/financial/dashboard',
  '/api/v1/reports/balances/customers',
  '/api/v1/reports/receivables',
  '/api/v1/invoices',
  '/api/v1/accounting/journals',
  '/api/v1/expenses/report',
  '/api/v1/bi/stats',
  '/api/v1/company/settings',
  '/api/v1/storage/delete',
];

// Lo unico que la tienda necesita. Ampliar esta lista es una decision de
// seguridad: cada ruta que se anada queda accesible a cualquiera que se
// registre desde internet.
const RUTAS_TIENDA_PERMITIDAS = [
  '/api/storefront/quotes',
  '/api/storefront/auth/register',
  '/api/v1/auth/me',
  '/api/v1/auth/login',
  '/api/v1/auth/logout',
  '/api/v1/auth/refresh',
];

describe('ISO-02 · alcance de las sesiones del storefront', () => {
  it.each(RUTAS_ERP_PROHIBIDAS)('el rol cliente NO puede autenticarse en %s', async (ruta) => {
    const auth = await verifyAuth(peticion(ruta, 'cliente'));
    expect(auth).toBeNull();
  });

  it.each(RUTAS_TIENDA_PERMITIDAS)('el rol cliente SI puede autenticarse en %s', async (ruta) => {
    const auth = await verifyAuth(peticion(ruta, 'cliente'));
    expect(auth).not.toBeNull();
    expect(auth?.role).toBe('cliente');
  });

  it('la comprobacion no distingue mayusculas ni espacios en el nombre del rol', async () => {
    for (const rol of ['Cliente', 'CLIENTE', ' cliente ']) {
      expect(await verifyAuth(peticion('/api/v1/bank/accounts', rol))).toBeNull();
    }
  });

  it('una barra final no sortea la comprobacion', async () => {
    expect(await verifyAuth(peticion('/api/v1/bank/accounts/', 'cliente'))).toBeNull();
  });

  it.each(['contabilidad', 'administracion', 'sistemas', 'cajero', 'facturacion'])(
    'el rol %s conserva su acceso al ERP',
    async (rol) => {
      const auth = await verifyAuth(peticion('/api/v1/bank/accounts', rol));
      expect(auth).not.toBeNull();
      expect(auth?.role).toBe(rol);
      expect(auth?.companyId).toBe('00000000-0000-4000-8000-0000000000aa');
    }
  );

  it('un token invalido sigue siendo rechazado, tenga el rol que tenga', async () => {
    const req = new NextRequest('https://contfast.test/api/storefront/quotes', {
      headers: { cookie: 'accessToken=token.falsificado.aqui' },
    });
    expect(await verifyAuth(req)).toBeNull();
  });
});
