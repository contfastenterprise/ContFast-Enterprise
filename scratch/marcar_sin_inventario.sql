-- marcar_sin_inventario.sql
--
-- Marca los productos que NO llevan control de existencia y retira sus niveles.
-- Se ejecuta DESPUES de aplicar drizzle/0033_producto_sin_inventario.sql.
--
-- Por que hace falta: un servicio o una mercancia que se vende por encargo no
-- esta en ningun almacen, pero el sistema le descontaba una unidad por cada
-- venta. "Servicios Instalacion" llego a -116 y "Ventana Corrediza" a -129 por
-- esa via. Poner el nivel a cero no arregla nada: la siguiente factura lo
-- devuelve a negativo. Hay que declarar que el producto no lleva inventario.
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
WHERE p.sku IN ('PROD-000055', 'PROD-000052')
GROUP BY p.sku, p.name
ORDER BY p.sku;

-- ---------------------------------------------------------------------------
-- 2. Marcarlos.
-- ---------------------------------------------------------------------------
UPDATE products
SET tracks_inventory = false,
    updated_at = now()
WHERE sku IN ('PROD-000055', 'PROD-000052');

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
