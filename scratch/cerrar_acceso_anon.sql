-- ============================================================================
--  CERRAR EL ACCESO PUBLICO A LAS TABLAS DE `public`
-- ============================================================================
--
--  EL HALLAZGO
--  -----------
--  Los roles `anon` y `authenticated` tienen DELETE, INSERT, UPDATE, SELECT y
--  TRUNCATE sobre 92 tablas de `public`, y 80 de ellas no tienen RLS.
--
--  `anon` es el rol al que mapea la clave publica de Supabase -- la que esta
--  pensada para ir en el navegador. Con la URL del proyecto y esa clave, la API
--  automatica (PostgREST) permite leer, modificar y borrar esas tablas sin
--  sesion ni contrasena.
--
--  Y se reproduce solo: Supabase deja puesto un ALTER DEFAULT PRIVILEGES, asi
--  que CADA TABLA NUEVA hereda los siete permisos. Comprobado: las dos tablas
--  creadas en esta auditoria (`invoice_sequences`, `bank_account_balances`)
--  estan en la lista sin que ninguna migracion las haya concedido.
--
--  POR QUE ESTO NO ROMPE LA APLICACION
--  ------------------------------------
--  ContFast no usa esos roles. Se conecta por Postgres directo (el pooler) con
--  su propio rol, y el unico uso del cliente de Supabase es del lado del
--  servidor con la clave de SERVICIO, que ignora estos permisos. No hay cliente
--  en el navegador ni uso de la clave `anon` en el codigo.
--
--  La unica excepcion revisada: `company/settings/logo` cae a la clave `anon`
--  si falta la de servicio, pero eso trabaja contra el esquema `storage`, que
--  esta migracion NO toca.
--
--  SI ALGUN DIA SE QUIERE USAR LA API AUTOMATICA
--  ---------------------------------------------
--  El camino correcto no es devolver estos permisos, sino aplicar
--  `0024_enable_rls_policies` -- que ya existe, esta bien escrita y activa RLS
--  con politicas por empresa -- y conceder despues lo minimo que haga falta.
-- ============================================================================

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

--  Lo mas importante: que las tablas NUEVAS no vuelvan a heredarlos.
--  Se recorre cada rol que pueda tener el ALTER DEFAULT PRIVILEGES puesto.
DO $$
DECLARE
  propietario text;
BEGIN
  FOREACH propietario IN ARRAY ARRAY['postgres', 'supabase_admin', 'supabase_auth_admin', current_user]
  LOOP
    BEGIN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated', propietario);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated', propietario);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated', propietario);
      RAISE NOTICE 'Privilegios por defecto retirados para el rol %', propietario;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'No se pudo tocar los privilegios por defecto de % (%)', propietario, SQLERRM;
    END;
  END LOOP;
END $$;

--  Comprobacion.
SELECT COALESCE(grantee, 'ninguno') AS rol,
       count(DISTINCT table_name)::text AS tablas_alcanzables
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
 GROUP BY grantee
UNION ALL
SELECT 'TOTAL con permisos para anon/authenticated',
       (SELECT count(DISTINCT table_name)::text FROM information_schema.role_table_grants
         WHERE table_schema='public' AND grantee IN ('anon','authenticated'));
