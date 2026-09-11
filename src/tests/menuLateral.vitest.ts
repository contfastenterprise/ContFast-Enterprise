/**
 * menuLateral.vitest.ts
 *
 * La barra lateral no esta escrita en el codigo: `buildSidebar` la arma leyendo
 * `route_mappings` y preguntando permisos. Encima de eso hay una capa de
 * restricciones por NOMBRE DE ROL, escritas a mano, que pueden contradecir a
 * los permisos sin que nadie se entere -- porque el resultado de una
 * contradiccion no es un error, es una pantalla que no aparece.
 *
 * Eso es justo lo que pasaba con los conduces:
 *
 *   - `DEFAULT_ROLE_PERMISSIONS` concede `conduce:read` y `conduce:write` a
 *     `facturacion`, y a nadie mas.
 *   - `buildSidebar` escondia `/dashboard/delivery-notes` precisamente a
 *     `facturacion`, por estar en la lista de "no puede ver Inventario".
 *
 * Resultado: la pantalla de Conduces no la veia NINGUN rol salvo `sistemas` y
 * `administracion`, que pasan por encima de todo. El permiso estaba concedido
 * y la pantalla era invisible.
 *
 * Estas pruebas llaman a la funcion de verdad -- no a una copia -- y por eso
 * atrapan la contradiccion, que ninguna comprobacion de texto puede ver.
 */
import { describe, it, expect } from 'vitest';
import { buildSidebar } from '@/utils/rbacHelpers';
import type { RouteMapping } from '@/types/rbac';

const AHORA = new Date();

function menu(
  routePattern: string,
  module: string,
  displayName: string,
  groupName: string
): RouteMapping {
  return {
    id: `${module}:${routePattern}`,
    routePattern,
    module,
    action: 'read',
    isMenuItem: true,
    displayName,
    groupName,
    iconName: 'HelpCircle',
    orderIndex: 1,
    createdAt: AHORA,
    updatedAt: AHORA,
  };
}

/**
 * El menu real, reducido a lo que importa aqui. Conduces va en 'Inventario'
 * porque es donde vive hoy en `route_mappings`: si la prueba lo pusiera en
 * otro grupo estaria comprobando un mundo que no existe.
 */
const MAPEOS: RouteMapping[] = [
  menu('/dashboard/delivery-notes%', 'conduce', 'Conduces', 'Inventario'),
  menu('/dashboard/products%', 'catalogo', 'Productos', 'Inventario'),
  menu('/dashboard/warehouses%', 'catalogo', 'Almacenes', 'Inventario'),
  menu('/dashboard/inventory/movements%', 'catalogo', 'Movimientos', 'Inventario'),
  menu('/dashboard/invoices%', 'facturacion', 'Facturacion e-CF', 'Ingresos'),
  menu('/dashboard/ecf%', 'facturacion', 'Comprobantes Fiscales', 'Ingresos'),
  menu('/dashboard', 'caja', 'Inicio', 'Principal'),
];

/** Nombres visibles en el menu, aplanados, para poder afirmar sobre ellos. */
function nombres(rol: string, permitido: (m: string, a: string) => boolean): string[] {
  return buildSidebar(MAPEOS, permitido, rol).flatMap((g) => g.items.map((i) => i.name));
}

const TODO = () => true;
const TODO_MENOS_CONDUCE = (m: string) => m !== 'conduce';

describe('barra lateral · los conduces y el rol facturacion', () => {
  it('facturacion ve Conduces, y sigue sin ver el inventario ni los comprobantes', () => {
    const vistos = nombres('facturacion', TODO);

    // Lo que estaba roto. Sin esto, la pantalla no la veia nadie.
    expect(vistos, 'facturacion tiene conduce:read y debe ver su pantalla').toContain('Conduces');

    // Y lo que NO debe cambiar por arreglarlo. Va en la misma prueba a
    // proposito: si se separa, esta mitad pasaria tambien con el fallo puesto
    // y dejaria de comprobar nada.
    expect(vistos).not.toContain('Productos');
    expect(vistos).not.toContain('Almacenes');
    expect(vistos).not.toContain('Movimientos');
    expect(vistos).not.toContain('Comprobantes Fiscales');
    expect(vistos).not.toContain('Inicio');

    // Su propia pantalla sigue ahi.
    expect(vistos).toContain('Facturacion e-CF');
  });

  it('la excepcion abre el grupo, no concede el permiso', () => {
    // Con el permiso denegado NO se ve, aunque la excepcion exista: lo que se
    // corrigio fue la restriccion por nombre de rol, no la comprobacion.
    expect(nombres('facturacion', TODO_MENOS_CONDUCE)).not.toContain('Conduces');

    // Este es el conjunto que fallaba antes del arreglo, y el que sostiene la
    // prueba entera.
    expect(nombres('facturacion', TODO)).toContain('Conduces');
  });

  it('a los demas roles no les cambia nada', () => {
    const cajero = nombres('cajero', TODO);
    expect(cajero).toContain('Conduces');
    expect(cajero).toContain('Productos');
    expect(cajero).toContain('Almacenes');

    // Anclada al caso que fallaba: sin esto, la prueba pasaria igual con el
    // fallo puesto y seria decorativa.
    expect(nombres('facturacion', TODO)).toContain('Conduces');
  });

  it('sistemas y administracion siguen viendolo todo', () => {
    for (const rol of ['sistemas', 'administracion']) {
      const vistos = nombres(rol, () => false);
      expect(vistos, `${rol} pasa por encima de los permisos`).toContain('Conduces');
      expect(vistos).toContain('Productos');
    }
    expect(nombres('facturacion', TODO)).toContain('Conduces');
  });
});
