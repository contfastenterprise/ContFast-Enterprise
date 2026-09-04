-- 0031: impedir existencias negativas (auditoria F1-04)
--
-- checkStock no comparaba la cantidad pedida contra la existencia, asi que se
-- podia facturar y despachar mas de lo que habia y el nivel quedaba negativo.
-- La correccion esta en src/services/inventoryService.ts; esta restriccion es
-- la red de seguridad en la base, para que ningun otro camino de escritura
-- pueda dejar un nivel por debajo de cero.
--
-- Se anade NOT VALID a proposito: la restriccion se aplica a partir de ahora a
-- toda insercion y actualizacion, pero NO se validan las filas existentes. Si
-- ya hay niveles negativos por el bug anterior, el despliegue no falla.
--
-- Para localizar y sanear lo existente:
--
--   SELECT il.id, p.name, w.name AS almacen, il.quantity, il.modo
--   FROM inventory_levels il
--   JOIN products p   ON p.id = il.product_id
--   JOIN warehouses w ON w.id = il.warehouse_id
--   WHERE il.quantity < 0
--   ORDER BY il.quantity;
--
-- Cada fila necesita un ajuste de inventario que explique la diferencia; no se
-- corrigen con un UPDATE a secas, porque el kardex quedaria descuadrado.
--
-- Cuando no queden negativos, activar la validacion completa:
--
--   ALTER TABLE inventory_levels VALIDATE CONSTRAINT chk_inventory_no_negativo;

DO $$ BEGIN
  ALTER TABLE "inventory_levels"
    ADD CONSTRAINT "chk_inventory_no_negativo" CHECK ("quantity" >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
