-- Lote 198: el padron de contribuyentes de la DGII.
--
-- POR QUE. La consulta de RNC de clientes, suplidores y facturacion dependia de un
-- proxy de TERCEROS (`pptonanntevatndjyzmk.supabase.co`) que desaparecio: su nombre
-- ya no resuelve en DNS. El servicio web de la propia DGII tambien esta retirado
-- (301 hacia su portal). Lo que la DGII si publica es el padron descargable, asi que
-- el dato se trae una vez y se consulta aqui.
--
-- SIN `company_id` NI `modo`, a proposito: es dato publico del Estado, el mismo para
-- las seis empresas. La clave primaria es el RNC para que reimportar ACTUALICE en vez
-- de duplicar.
--
-- APLICARLA ANTES DE DESPLEGAR. Sin la tabla, la consulta de RNC responde que el
-- padron no esta cargado (no revienta), pero nadie podra buscar un RNC.
--
-- DESPUES DE APLICARLA, hay que CARGARLA -- la tabla nace vacia:
--     npx tsx --env-file=.env scratch/_to_delete/importar_padron_rnc.ts            (ensayo)
--     npx tsx --env-file=.env scratch/_to_delete/importar_padron_rnc.ts --aplicar

CREATE TABLE IF NOT EXISTS "rnc_padron" (
  "rnc" varchar(11) PRIMARY KEY NOT NULL,
  "nombre" text NOT NULL,
  "nombre_comercial" text,
  "estado" varchar(30),
  "actividad" text,
  "actualizado_at" timestamp DEFAULT now() NOT NULL
);
