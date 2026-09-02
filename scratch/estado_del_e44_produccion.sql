-- ============================================================================
--  E440000000001 (PRODUCCION): ¿LA SINCRONIZACION LLEGO A CORRER?
-- ============================================================================
--
--  Se reenvio en mSeller y salio bien, pero al sincronizar en el sistema no
--  cambia nada. Hay tres motivos posibles y `updated_at` los separa:
--
--    A) LA SINCRONIZACION NI SIQUIERA CORRIO.
--       `updated_at` sigue en la hora de la emision (18:02). Lo mas probable:
--       estas en modo PRUEBA y la factura es de PRODUCCION. La ruta filtra por
--       modo, asi que ni la encuentra -- devuelve 404 y la pantalla no dice
--       gran cosa. Se arregla cambiando el selector de modo arriba.
--
--    B) CORRIO, PERO mSELLER SIGUE DICIENDO LO MISMO.
--       `updated_at` es reciente y `dgii_message` trae lo que contesto mSeller.
--       Si sigue diciendo "Error", el reenvio creo un registro NUEVO en mSeller
--       y la consulta por e-NCF sigue viendo el viejo.
--
--    C) CORRIO Y mSELLER YA DICE OTRA COSA, pero el estado no se movio.
--       `updated_at` reciente y `dgii_message` con un texto distinto de
--       "Error". Eso seria un fallo de lectura y quiero ver el texto exacto.
--
--  La columna "Sincronizado?" hace esa cuenta.
-- ============================================================================

SELECT i.ncf                                            AS "e-NCF",
       i.modo                                           AS "Modo",
       i.status                                         AS "Estado",
       to_char(i.created_at, 'DD-MM HH24:MI:SS')        AS "Emitida",
       to_char(i.updated_at, 'DD-MM HH24:MI:SS')        AS "Ultimo cambio",
       CASE
         WHEN i.updated_at <= i.created_at + interval '5 seconds'
           THEN 'NO -> la sincronizacion no llego a escribir (motivo A)'
         ELSE 'si, escribio a las ' || to_char(i.updated_at, 'HH24:MI:SS')
       END                                              AS "Sincronizado?",
       coalesce(i.mseller_track_id, '(nulo)')           AS "Track ID",
       coalesce(i.security_code, '(nulo)')              AS "Cod. seguridad",
       left(coalesce(i.dgii_message, '(nulo)'), 220)    AS "Lo que dice el sistema"
  FROM invoices i
 WHERE i.ncf = 'E440000000001'
   AND i.deleted_at IS NULL
 ORDER BY i.modo;
