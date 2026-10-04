-- Lote 266: el NIVEL de precio de cada linea de factura (base, consumidor, mayorista, proveedor).
--
-- Pedido del dueño (2026-10-03): al reabrir un borrador cuyos productos cambiaron de precio, que
-- ofrezca ponerle los precios actuales. Para saber cual es "el precio actual" de una linea hay que
-- saber de que nivel era, y no se guardaba: al reabrir, todas las lineas volvian como "consumidor"
-- aunque se hubieran puesto a precio mayorista o de proveedor.
--
-- Solo AÑADE una columna nula (los borradores viejos se quedan sin nivel y la pantalla lo deduce).
-- La columna NO se declara en el esquema de Drizzle, a proposito: cuatro consultas leen la fila
-- entera de `invoice_lines` y, declarada antes de aplicar esto, las romperia (la leccion de las 0013
-- y 0015). El codigo mira si existe antes de nombrarla: sin esta migracion, todo sigue como hoy.
--
-- UNA sola sentencia, con la restriccion dentro de la columna: con `IF NOT EXISTS`, aplicarla dos
-- veces no hace nada, y la primera vez no emite ningun aviso (un `DROP CONSTRAINT IF EXISTS` previo
-- emitia un NOTICE que el lanzador de la base desechable trata como error).
ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "price_tier" varchar(16)
  CONSTRAINT "invoice_lines_price_tier_valido" CHECK ("price_tier" IS NULL OR "price_tier" IN ('base', 'consumidor', 'mayorista', 'proveedor'));
