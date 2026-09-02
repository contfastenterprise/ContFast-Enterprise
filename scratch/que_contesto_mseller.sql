-- ============================================================================
--  QUE CONTESTO mSELLER, LITERALMENTE
-- ============================================================================
--
--  UNA SOLA CONSULTA, A PROPOSITO
--  ------------------------------
--  La version anterior tenia tres. El editor SQL de Supabase devuelve solo el
--  resultado de la ULTIMA, asi que las dos primeras -- que eran las que
--  importaban -- no llegaban nunca. Ahora todo va en un unico SELECT.
--
--  LA PREGUNTA QUE RESPONDE
--  ------------------------
--  "El estado se queda en ENVIADO y tengo que sincronizar para que aparezcan
--  la firma, el QR y el codigo de seguridad."
--
--  Ya sabemos, por el reparto de estados, que las dos filas en 'submitted'
--  TRAEN codigo de seguridad. O sea que mSeller no se quedo callado: contesto,
--  y con material de firma dentro. Lo que no supimos leer fue el ESTADO.
--
--  Quedan dos variantes, y las distingue la columna "Mensaje del envio":
--
--    A1  "...la respuesta no trae estado de la DGII..."
--        -> el estado no viene en NINGUNO de los campos que mira `leerEstado`
--           (dgiiResponse[].estado, dgiiStatus, estadoDGII, status, estado).
--           Hay que encontrar donde viene, y para eso esta el JSON crudo.
--
--    A2  "...Estado no reconocido (\"X\")..."
--        -> si viene, con un texto que `leerEstado` no contempla. Ese X es lo
--           que hay que anadir a la lista de sinonimos.
--
--  CUIDADO CON UNA COSA
--  --------------------
--  `response_payload` lo REESCRIBE cada consulta de estado. La columna
--  "JSON sin pisar" dice si lo que se ve es la respuesta del ENVIO o ya la de
--  una sincronizacion posterior. Si sale `false` en todas las filas, emite un
--  comprobante mas y corre esto ANTES de sincronizar.
--
--  Si en el JSON aparece algo que parezca una credencial, tapalo antes de
--  pegarlo. Aqui solo hace falta la parte del estado.
-- ============================================================================

SELECT i.ncf                                              AS "e-NCF",
       'e-' || i.ecf_type                                 AS "Tipo",
       i.modo                                             AS "Modo",
       i.status                                           AS "Estado factura",
       d.status                                           AS "Estado envio",
       to_char(d.created_at, 'DD-MM HH24:MI:SS')          AS "Enviado",
       round(extract(epoch from (d.updated_at - d.created_at))::numeric, 1)
                                                          AS "Seg. hasta cambio",
       (d.created_at = d.updated_at)                      AS "JSON sin pisar",
       coalesce(d.security_code, '(nulo)')                AS "Cod. envio",
       coalesce(i.security_code, '(nulo)')                AS "Cod. factura",
       -- ESTAS DOS SON LAS QUE DISTINGUEN A1 DE A2:
       coalesce(d.response_message, '(nulo)')             AS "Mensaje del envio",
       coalesce(i.dgii_message, '(nulo)')                 AS "Mensaje en factura",
       coalesce(d.response_code, '(nulo)')                AS "Cod. resp.",
       -- Y ESTE ES EL DATO DECISIVO:
       left(coalesce(d.response_payload, '(vacio)'), 2000) AS "JSON crudo de mSeller"
  FROM dgii_submissions d
  JOIN invoices i ON i.id = d.invoice_id
 WHERE i.deleted_at IS NULL
 ORDER BY d.created_at DESC
 LIMIT 4;
