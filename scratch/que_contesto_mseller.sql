-- ¿Que contesto mSeller de verdad? Solo lee.
--
-- El sintoma reportado: al emitir queda en "enviado" y hay que sincronizar a
-- mano para que llegue el estado final.
--
-- Eso NO es un tiempo de espera corto. Un timeout deja `dgii_message` con
-- "Error de red: timeout ...". "Enviado" (submitted) significa otra cosa:
-- mSeller SI contesto, dentro de plazo, pero su respuesta no traia veredicto
-- de la DGII. `leerEstado` lo deja en 'submitted' -- mandado, pendiente de
-- confirmar -- en vez de inventarse un "Aceptado".
--
-- Si eso es lo que pasa, esperar mas no cambia nada: mSeller no esta
-- reteniendo la conexion hasta que la DGII decida. Lo que hay que hacer es
-- confirmar solo, sin que nadie pulse "sincronizar".
--
-- Esta consulta enseña la respuesta CRUDA de los ultimos envios. Con eso se ve
-- si mSeller devolvio veredicto o solo un acuse.

SELECT i.ncf                                   AS "NCF",
       i.created_at::time(0)                   AS "Hora",
       i.status                                AS "Estado factura",
       s.status                                AS "Estado envio",
       coalesce(left(i.dgii_message, 60), '')  AS "Mensaje",
       coalesce(s.track_id, '(sin trackId)')   AS "trackId",
       coalesce(nullif(s.security_code, ''), '(sin codigo)') AS "Codigo",
       left(coalesce(s.response_payload, '(vacio)'), 300)    AS "Respuesta cruda de mSeller"
  FROM invoices i
  LEFT JOIN dgii_submissions s ON s.invoice_id = i.id
 WHERE i.deleted_at IS NULL
   AND i.created_at > now() - interval '2 days'
 ORDER BY i.created_at DESC
 LIMIT 8;
