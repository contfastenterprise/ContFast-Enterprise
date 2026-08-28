-- marcar_sin_inventario.sql
--
-- Marca los productos que NO llevan control de existencia y retira sus niveles.
-- Se ejecuta DESPUES de aplicar drizzle/0033_producto_sin_inventario.sql.
--
-- Por que hace falta: un servicio o una mercancia que se fabrica por pedido no
-- esta en ningun almacen, pero el sistema le descontaba una unidad por cada
-- venta. "Ventana Corrediza" llego a -129 y "Servicios Instalacion" a -116 por
-- esa via. Poner el nivel a cero no arregla nada: la siguiente factura lo
-- devuelve a negativo. Hay que declarar que el producto no lleva inventario.
--
-- Son nueve, y entre todos suman 379 de las 1.003 unidades en negativo del
-- almacen Principal. Ninguna se corrige contando: no hay nada fisico que contar.
--
--   PROD-000055  Servicios Instalacion         -116   servicio
--   PROD-000052  Ventana Corrediza             -129   por pedido
--   PROD-000060  Closet Blanco -EN FACIA        -42   por pedido
--   PROD-000057  Cuadro para Meseta Blanca      -40   por pedido
--   PROD-000058  Despenda Blanca -Solo Frente   -33   por pedido
--   PROD-000056  Gabinetes Blanco               -16   por pedido
--   PROD-000069  Canaleta Cajon Roble            -1   por pedido
--   PROD-000064  Cortina de Bano Alta            -1   por pedido
--   PROD-000061  Gaveta                          -1   por pedido
--
-- Los pasos 1 y 4 son de solo lectura. Ejecuta el 1, mira la lista, y sigue.

-- ---------------------------------------------------------------------------
-- 1. QUE se va a marcar. Revisa esto antes de nada.
-- ---------------------------------------------------------------------------
SELECT p.sku,
       p.name,
       coalesce(sum(l.quantity), 0) AS existencia_actual,
       count(l.id)                  AS niveles_a_retirar
FROM products p
LEFT JOIN inventory_levels l ON l.product_id = p.id
WHERE p.sku IN ('PROD-000055', 'PROD-000052', 'PROD-000060', 'PROD-000057',
                 'PROD-000058', 'PROD-000056', 'PROD-000069', 'PROD-000064',
                 'PROD-000061')
GROUP BY p.sku, p.name
ORDER BY p.sku;

-- ---------------------------------------------------------------------------
-- 2. Marcarlos.
-- ---------------------------------------------------------------------------
UPDATE products
SET tracks_inventory = false,
    updated_at = now()
WHERE sku IN ('PROD-000055', 'PROD-000052', 'PROD-000060', 'PROD-000057',
                 'PROD-000058', 'PROD-000056', 'PROD-000069', 'PROD-000064',
                 'PROD-000061');

-- ---------------------------------------------------------------------------
-- 3. Retirar sus niveles.
--
-- Los MOVIMIENTOS historicos NO se borran: son el registro de lo que paso, y
-- borrarlos seria reescribir el pasado. Lo que se retira es el saldo, que es lo
-- que no deberia existir.
-- ---------------------------------------------------------------------------
DELETE FROM inventory_levels l
USING products p
WHERE p.id = l.product_id
  AND p.tracks_inventory = false;

-- ---------------------------------------------------------------------------
-- 4. Comprobar. Con el conteo ya cargado, esto tiene que devolver CERO filas.
-- ---------------------------------------------------------------------------
SELECT p.sku, p.name, w.name AS almacen, l.modo, l.quantity
FROM inventory_levels l
JOIN products p   ON p.id = l.product_id
JOIN warehouses w ON w.id = l.warehouse_id
WHERE l.quantity < 0
ORDER BY l.quantity;

-- Y si no queda ninguno en TODA la tabla, el ultimo paso:
--
--   ALTER TABLE inventory_levels VALIDATE CONSTRAINT chk_inventory_no_negativo;
--
-- Eso convierte el CHECK de la migracion 0031 -creado NOT VALID porque habia
-- negativos- en una garantia real: a partir de ahi la propia base rechaza
-- cualquier existencia negativa, venga de donde venga.
