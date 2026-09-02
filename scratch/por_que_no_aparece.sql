-- ============================================================================
--  POR QUE NO APARECE UNA FACTURA EN EL BUSCADOR DE LA NOTA DE CREDITO
-- ============================================================================
--
--  El buscador pide exactamente esto:
--
--      /api/v1/ecf?q=<lo que escribas>
--                 &status=accepted        <-- SOLO ACEPTADAS
--                 &excludeAdjusted=true   <-- SIN nota que las ajuste
--                 &per_page=30            <-- SOLO LAS 30 MAS RECIENTES
--
--  y luego la pantalla se queda con los tipos que admiten nota.
--
--  Hay CUATRO motivos por los que una factura puede no salir, y solo uno es el
--  que se corrigio hoy. Esta consulta dice cual es, para cada factura, en vez
--  de adivinarlo:
--
--    1. NO ESTA ACEPTADA. Si sigue en "Enviado" no aparece. Y desde que
--       sabemos que el veredicto de la DGII llega DESPUES del envio, ese es el
--       estado normal durante un rato. Se resuelve consultando el estado
--       -- ahora automatico -- o con el boton Sincronizar.
--
--    2. YA TIENE UNA NOTA que la ajusta. Correcto si la nota existe; era el
--       fallo cuando la nota estaba RECHAZADA. Corregido, pero hace falta
--       DESPLEGAR para que surta efecto.
--
--    3. SU TIPO NO ADMITE NOTA. Antes solo salian 31, 32 y 45; el 44 y el 46
--       se quedaban fuera. Corregido, tambien pendiente de desplegar.
--
--    4. NO ESTA ENTRE LAS 30 MAS RECIENTES y no escribiste nada en el buscador.
--       Esto NO es un fallo: se arregla escribiendo el e-NCF en la caja.
--
--  El modo tambien cuenta: el buscador solo ve las facturas del modo en el que
--  estas. Una factura de PRODUCCION no sale si el sistema esta en PRUEBA.
-- ============================================================================

WITH admite_nota(ecf_type) AS (
  VALUES ('31'), ('32'), ('44'), ('45'), ('46')
),
la_nota AS (
  SELECT modified_invoice_id, modified_ncf, modo
    FROM invoices
   WHERE ncf = 'E340000000002' AND deleted_at IS NULL
)
SELECT i.ncf                                       AS "e-NCF",
       'e-' || i.ecf_type                          AS "Tipo",
       i.modo                                      AS "Modo",
       i.status                                    AS "Estado",
       to_char(i.created_at, 'DD-MM HH24:MI')      AS "Emitida",
       i.total                                     AS "Total",

       -- Motivo 1
       CASE WHEN i.status = 'accepted' THEN 'si' ELSE 'NO -> por eso no sale' END
                                                   AS "Aceptada?",
       -- Motivo 3
       CASE WHEN a.ecf_type IS NOT NULL THEN 'si' ELSE 'NO -> tipo sin nota' END
                                                   AS "Admite nota?",
       -- Motivo 2: notas que le apuntan, y en que estado
       coalesce((SELECT string_agg(n.ncf || ' (' || n.status || ')', ', ')
                   FROM invoices n
                  WHERE n.modified_invoice_id = i.id
                    AND n.deleted_at IS NULL),
                '(ninguna)')                       AS "Notas que la ajustan",
       -- Motivo 2, ya con el criterio NUEVO: solo bloquean las que no estan
       -- rechazadas ni anuladas.
       CASE WHEN EXISTS (SELECT 1 FROM invoices n
                          WHERE n.modified_invoice_id = i.id
                            AND n.deleted_at IS NULL
                            AND n.status NOT IN ('rejected', 'void'))
            THEN 'NO -> ya ajustada'
            ELSE 'si' END                          AS "Libre para nota?",
       -- Motivo 4
       row_number() OVER (PARTITION BY i.modo ORDER BY i.created_at DESC)
                                                   AS "Puesto (30 caben)"
  FROM invoices i
  LEFT JOIN admite_nota a ON a.ecf_type = i.ecf_type
 WHERE i.deleted_at IS NULL
   AND i.ncf IS NOT NULL
   AND i.ecf_type NOT IN ('33', '34')
   AND (
        -- La factura que modificaba la nota 02, venga de donde venga
        i.id = (SELECT modified_invoice_id FROM la_nota)
     OR i.ncf = (SELECT modified_ncf FROM la_nota)
        -- y las ultimas de cada modo, para ver el panorama
     OR i.created_at > now() - interval '30 days'
       )
 ORDER BY (i.id = (SELECT modified_invoice_id FROM la_nota)) DESC,
          i.created_at DESC
 LIMIT 25;
