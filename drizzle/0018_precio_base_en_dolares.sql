-- Lote 258: el precio BASE de un producto que sigue al dolar, fijado en dolares.
--
-- Pedido del dueño (2026-10-03): "el precio en dolares seria solo para el precio base". Con el,
-- al aplicar, el precio base = precio en dolares x tasa; los otros niveles siguen conservando su
-- margen sobre el costo, como hasta ahora. Nulo = el producto no tiene precio base en dolares y su
-- precio base tambien conserva el margen.
--
-- Solo AÑADE una columna a una tabla propia del lote 247 (no a `products`). El codigo mira si la
-- columna existe antes de leerla: sin esta migracion, la pantalla funciona como antes y solo
-- fijar un precio en dolares avisa de que falta.
ALTER TABLE "productos_en_dolares" ADD COLUMN "precio_usd" numeric(15, 4);
--> statement-breakpoint
ALTER TABLE "productos_en_dolares" ADD CONSTRAINT "productos_en_dolares_precio_positivo" CHECK ("precio_usd" IS NULL OR "precio_usd" > 0);
