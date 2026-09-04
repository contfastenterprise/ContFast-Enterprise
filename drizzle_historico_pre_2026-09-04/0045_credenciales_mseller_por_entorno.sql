-- ============================================================================
--  REEMPLAZADA  --  no ejecutes este archivo
-- ============================================================================
--
--  Esta version duplicaba el correo y la contrasena de mSeller en cada ambiente.
--  No hacia falta: de las tres credenciales, solo la CLAVE DE API cambia entre
--  ambientes. El correo y la contrasena son los mismos y se quedan en
--  `company_settings`.
--
--  La buena es:  0045_clave_api_por_entorno.sql
--
--  Si llegaste a ejecutar esta version, no pasa nada: la nueva detecta la tabla
--  `mseller_credentials`, la renombra y le quita las dos columnas que sobran.
--
--  Este archivo se puede borrar.
-- ============================================================================

SELECT 'Archivo reemplazado por 0045_clave_api_por_entorno.sql. No ejecutar.' AS aviso;
