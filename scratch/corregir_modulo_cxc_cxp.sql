-- ═══════════════════════════════════════════════════════════════════════════
--  CxC y CxP del panel financiero: poner el modulo que les corresponde
-- ═══════════════════════════════════════════════════════════════════════════
--
--  EL PROBLEMA, CONFIRMADO CON DATOS
--  Las dos entradas estan como `module = 'caja'`, pero sus rutas empiezan por
--  `/dashboard/financial`, y `buildSidebar` tiene una reja POR RUTA que solo
--  deja pasar a sistemas, administracion y contabilidad. Para verlas hay que
--  cumplir las dos cosas, y no hay nadie que las cumpla:
--
--      cajero        tiene caja:read   pero NO pasa la reja
--      facturacion   tiene caja:read   pero NO pasa la reja
--      contabilidad  pasa la reja      pero caja:read = FALSE en las 6 empresas
--
--  Solo las ven `sistemas` y `administracion`, que pasan por encima de todo.
--
--  Y ese `false` de contabilidad no es un hueco: es una fila explicita. Por el
--  orden usuario -> rol -> respaldo, una fila en false TAPA el respaldo, asi
--  que alguien decidio que contabilidad no entra en caja. Esa decision se
--  respeta: lo que esta mal no es el permiso, es la etiqueta.
--
--  LA CORRECCION
--  "Cuentas por Cobrar" no es caja, es `cobros`. "Cuentas por Pagar" no es
--  caja, es `proveedores`. Con el modulo correcto contabilidad las ve -- tiene
--  los dos -- sin que haya que abrirle el Modulo de Caja ni tocar el codigo.
--
--  La reja de `/dashboard/financial` se queda como esta: sigue reservando el
--  panel financiero a direccion y contabilidad, que es lo que dice hacer.
--
--  LO QUE ESTO NO ARREGLA -- Y ES MAS GRAVE
--  Las dos pantallas son Server Components que llaman a
--  `getReceivablesDashboardData` / `getPayablesDashboardData` en
--  `src/actions/`. Esas funciones comprueban la sesion y filtran por empresa y
--  modo, pero NO comprueban permiso. Es decir: el menu es hoy la unica puerta,
--  y un menu no es control de acceso. Cualquier sesion de la empresa que
--  escriba la URL ve la cartera entera. Eso se arregla en el codigo, no aqui.
--
--  Esto SI escribe en produccion, pero solo en el menu. El paso 4 lo deshace.
-- ---------------------------------------------------------------------------

-- ─── PASO 1 ── Como estan hoy, y a quien afectaria el cambio ──────────────
--  Arriba: las dos filas. Abajo: si contabilidad tiene de verdad los dos
--  modulos nuevos. Si `cobros_read` o `proveedores_read` sale en false, PARA:
--  el cambio la dejaria igual de fuera y no habria arreglado nada.
SELECT 'fila de menu' AS que, display_name AS a, route_pattern AS b, module AS c
FROM route_mappings
WHERE route_pattern IN ('/dashboard/financial/accounts-receivable%',
                        '/dashboard/financial/accounts-payable%')
UNION ALL
SELECT 'permiso de contabilidad',
       'cobros:read',
       COALESCE(BOOL_OR(rp.granted) FILTER (WHERE p.module='cobros'      AND p.action='read')::text, '(sin fila)'),
       COALESCE(BOOL_OR(rp.granted) FILTER (WHERE p.module='proveedores' AND p.action='read')::text, '(sin fila)')
FROM role_permissions rp
JOIN roles r       ON r.id = rp.role_id AND r.name = 'contabilidad'
JOIN permissions p ON p.id = rp.permission_id;

-- ─── PASO 2 ── La correccion ──────────────────────────────────────────────
--  Dos UPDATE, uno por fila. No se tocan ni la ruta, ni el grupo, ni el
--  order_index: la pantalla se queda donde esta, solo cambia de quien depende.
UPDATE route_mappings
SET module = 'cobros', updated_at = NOW()
WHERE route_pattern = '/dashboard/financial/accounts-receivable%'
  AND module = 'caja';

UPDATE route_mappings
SET module = 'proveedores', updated_at = NOW()
WHERE route_pattern = '/dashboard/financial/accounts-payable%'
  AND module = 'caja';

-- ─── PASO 3 ── Comprobar ──────────────────────────────────────────────────
--  Esperas 'cobros' y 'proveedores'.
SELECT display_name, route_pattern, module, group_name, order_index
FROM route_mappings
WHERE route_pattern IN ('/dashboard/financial/accounts-receivable%',
                        '/dashboard/financial/accounts-payable%')
ORDER BY route_pattern;

-- ─── PASO 4 ── DESHACER ───────────────────────────────────────────────────
--  UPDATE route_mappings SET module = 'caja', updated_at = NOW()
--  WHERE route_pattern IN ('/dashboard/financial/accounts-receivable%',
--                          '/dashboard/financial/accounts-payable%');
-- ---------------------------------------------------------------------------
