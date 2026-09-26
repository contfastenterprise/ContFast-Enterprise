-- Lote 200: los avisos del panel tambien por correo.
--
-- POR QUE. Los avisos existen desde el 158 y salen por WhatsApp desde el 178, pero
-- medido el 2026-09-26: **por WhatsApp no puede salir ninguno**. El numero que tiene la
-- cuenta es el de PRUEBA que regala Meta (+1 555-346-2012), y Meta rechaza todo lo que
-- se manda desde el -- plantilla o texto libre, con la ventana de 24 h abierta o no:
--
--     HTTP 400: (#131037) WhatsApp provided number needs display name approval
--
-- Eso se arregla dando de alta el numero real de la empresa, que es un tramite de Meta y
-- no codigo. Mientras, el SMTP de este sistema SI funciona (el lote 157 dejo el registro
-- de correos, y tiene filas). Asi que el aviso sale por donde puede salir hoy.
--
-- DOS COLUMNAS:
--   · `company_settings.avisos_correo`: a quien se le manda. Vacio = no se manda nada,
--     igual que el numero de WhatsApp. Es por EMPRESA, no por persona: quien administra
--     varias recibe las de todas en la misma direccion.
--   · `notifications.correo_enviado_at`: la marca de que ESE aviso ya salio por correo.
--     Separada de `whatsapp_enviado_at` a proposito: los dos canales van por su cuenta,
--     y el dia que WhatsApp funcione un aviso puede haber salido por uno y no por otro.
--
-- APLICARLA ANTES DE DESPLEGAR, o guardar los ajustes fallara.

ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "avisos_correo" varchar(255);
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "correo_enviado_at" timestamp;
