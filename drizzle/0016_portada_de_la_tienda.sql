-- Lote 235: la portada de la tienda publica, configurable por empresa.
--
-- POR QUE. La tienda se rediseno en el lote 231 al estilo de Spree, con una portada
-- partida (texto a la izquierda, imagen a la derecha) y sitio para una barra de anuncio.
-- Medido entonces: la portada decia lo mismo en las SEIS empresas y no existia ninguna
-- imagen de portada. El dueno eligio que sea configurable por empresa.
--
-- CUATRO COLUMNAS en `company_settings`, todas opcionales (NULL = "usa lo de siempre"):
--   · `tienda_anuncio`    la barra fina de arriba. Vacia = no hay barra.
--   · `tienda_titulo`     el titular. Vacio = "Bienvenido a <empresa>".
--   · `tienda_texto`      el parrafo de debajo. Vacio = el texto neutro de cotizar en linea.
--   · `tienda_imagen_url` la imagen de la derecha. Vacia = el logo (o las iniciales).
--
-- Solo ANADE columnas: no toca ni borra nada, y se puede repetir.
--
-- QUE PASA SI SE DESPLIEGA SIN APLICARLA: la tienda SIGUE FUNCIONANDO con la portada
-- por defecto -- la lectura de estas columnas va aparte y, si falla, se usa lo de siempre
-- (`StorefrontCompanyService.getPortada`). Lo que no funcionara hasta aplicarla es
-- GUARDAR la portada en Configuracion, que lo dira con su mensaje.

ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "tienda_anuncio" varchar(160);
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "tienda_titulo" varchar(120);
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "tienda_texto" varchar(500);
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "tienda_imagen_url" varchar(500);
