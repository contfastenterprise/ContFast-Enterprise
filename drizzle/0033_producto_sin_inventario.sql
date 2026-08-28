-- 0033: productos que no llevan control de existencia
--
-- MOTIVO
-- ------
-- No habia forma de decirle al sistema que un producto no se almacena. Toda
-- linea de una factura descuenta existencia, sea una puerta o una instalacion,
-- asi que el producto "Servicios Instalacion" acumulaba -116 unidades en el
-- almacen Principal: se le habia descontado una unidad por cada instalacion
-- vendida desde que existe.
--
-- Eso no se arregla contando -- no hay nada fisico que contar -- ni poniendo el
-- nivel a cero, porque la siguiente factura lo devuelve a negativo. Hace falta
-- que el producto pueda declarar que no lleva inventario.
--
-- Sirve para dos casos:
--   a) servicios: instalacion, transporte, mano de obra.
--   b) mercancia que se vende por encargo y nunca esta en almacen.
--
-- Con `tracks_inventory = false` el producto deja de comprobar existencia al
-- despachar, deja de descontar, y deja de admitir ajustes y transferencias.
--
-- El valor por defecto es TRUE: todos los productos que ya existen siguen
-- comportandose igual. Marcar los que no llevan inventario es una decision del
-- negocio y se hace desde la ficha del producto.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tracks_inventory boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN products.tracks_inventory IS
  'false = servicio o venta por encargo: no comprueba ni descuenta existencia.';

-- Indice parcial: las consultas que las rutas hacen son "de este producto,
-- ¿lleva inventario?", y los que NO llevan son una minoria.
CREATE INDEX IF NOT EXISTS products_sin_inventario_idx
  ON products (company_id) WHERE tracks_inventory = false;

-- ---------------------------------------------------------------------------
-- Despues de aplicar, marcar los productos que corresponda. Ejemplo, NO se
-- ejecuta solo: revisa la lista antes.
--
--   UPDATE products SET tracks_inventory = false
--   WHERE company_id = '<uuid>' AND sku IN ('PROD-000055');
--
-- Y una vez marcados, sus niveles dejan de tener sentido. Para retirarlos:
--
--   DELETE FROM inventory_levels l USING products p
--   WHERE p.id = l.product_id AND p.tracks_inventory = false;
--
-- Los movimientos historicos NO se borran: son el registro de lo que paso.
