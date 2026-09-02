-- ============================================================================
--  QUE QUEDO GUARDADO TRAS EL "read ECONNRESET"
-- ============================================================================
--
--  QUE ES UN ECONNRESET
--  --------------------
--  La conexion se corto MIENTRAS se leia la respuesta. La peticion salio. Lo
--  que no sabemos es si mSeller llego a procesarla.
--
--  O sea: el comprobante PUEDE estar emitido y aceptado en la DGII, o puede no
--  haber llegado nunca. Son los dos casos posibles y no se distinguen desde
--  aqui: hay que preguntarle a mSeller por ese e-NCF.
--
--  LO QUE EL SISTEMA HIZO CON ESO
--  ------------------------------
--  Lo guardo como RECHAZADO POR LA DGII.
--
--  `invoiceSubmissionService` clasifica el error mirando si el texto contiene
--  'timeout', 'connection', 'aborted', 'fetcherror'... "read ECONNRESET" no
--  contiene ninguno ("econnreset" no es "connection"), asi que cae en el `else`
--  final: `throw new EcfRejectedError`. Y un EcfRejectedError se guarda como
--  factura 'rejected' con su NCF.
--
--  Es el mismo patron de toda la auditoria, del reves: donde antes el silencio
--  se leia como "Aceptado", aqui se lee como "Rechazado". Las dos cosas son el
--  mismo error -- afirmar un desenlace que no consta.
--
--  QUE HACER, EN ESTE ORDEN
--  ------------------------
--  1. Correr esto para ver el e-NCF exacto y como quedo.
--  2. Abrir esa factura y pulsar SINCRONIZAR. Eso CONSULTA el estado; no
--     reenvia nada. Es seguro.
--  3. Segun lo que conteste mSeller:
--       - Si el e-NCF existe y esta aceptado -> la factura estaba bien y solo
--         hay que corregirle el estado. NO se re-emite.
--       - Si mSeller no lo conoce -> ese NCF no llego. Entonces si se puede
--         reenviar, con el MISMO NCF.
--
--  LO QUE NO HAY QUE HACER: emitir otra factura para la misma venta. Si el
--  primer NCF si llego, quedarian dos comprobantes fiscales para una sola
--  operacion, y eso ya no se retira.
-- ============================================================================

SELECT i.ncf                                          AS "e-NCF",
       'e-' || i.ecf_type                             AS "Tipo",
       i.modo                                         AS "Modo",
       i.status                                       AS "Estado guardado",
       to_char(i.created_at, 'DD-MM HH24:MI:SS')      AS "Emitida",
       i.total                                        AS "Total",
       coalesce(i.mseller_track_id, '(nulo)')         AS "Track ID",
       coalesce(i.security_code, '(nulo)')            AS "Cod. seguridad",
       left(coalesce(i.dgii_message, '(nulo)'), 200)  AS "Mensaje guardado",
       coalesce(d.status, '(sin fila de envio)')      AS "Estado envio",
       left(coalesce(d.response_message, '(nulo)'), 120) AS "Mensaje del envio",
       left(coalesce(d.response_payload, '(vacio)'), 600) AS "JSON"
  FROM invoices i
  LEFT JOIN LATERAL (
        SELECT * FROM dgii_submissions d2
         WHERE d2.invoice_id = i.id
         ORDER BY d2.created_at DESC LIMIT 1
       ) d ON true
 WHERE i.deleted_at IS NULL
   AND i.ecf_type = '44'
 ORDER BY i.created_at DESC
 LIMIT 5;
