-- ============================================================================
--  0042  --  El codigo de seguridad y la fecha de firma viven en la factura
-- ============================================================================
--
--  EL PROBLEMA (hallazgos DB-22 y DB-23)
--  -------------------------------------
--  El codigo de seguridad y la fecha de firma que devuelve mSeller no tenian
--  columna. Vivian dentro del JSON de `dgii_submissions.response_payload`.
--
--  DB-22 -- La sincronizacion los borraba. Las dos rutas de consulta de estado
--  hacen:
--
--      UPDATE dgii_submissions
--         SET response_payload = <respuesta de la CONSULTA DE ESTADO>
--       WHERE invoice_id = ... AND company_id = ... AND modo = ...
--
--  Sin id de envio, de modo que pisan TODOS los intentos de esa factura. Y la
--  respuesta de una consulta de estado no es la de un envio: trae `estado`,
--  `mensajes` y `dgiiResponse`, y no trae ni el codigo de seguridad ni la fecha
--  de firma. Sincronizar una factura ya aceptada le borraba los dos datos.
--
--  DB-23 -- Y al leerlos, se inventaban. Cuatro rutas (PDF, impresion, correo y
--  detalle) hacen, cuando no encuentran el codigo:
--
--      securityCode = sha256(invoice.id + invoice.ncf).slice(0,16).toUpperCase()
--
--  Ese codigo inventado entra en el QR y en la URL de consulta de la DGII del
--  comprobante. Quien lo escanee obtiene una consulta que no valida. Y la fecha
--  de firma caia a `created_at`, que es cuando se creo la factura, no cuando se
--  firmo.
--
--  LA CORRECCION
--  -------------
--  Los dos datos pasan a la factura, que es de quien son, y sobreviven a
--  cualquier reenvio o sincronizacion. Se escriben cuando mSeller los devuelve y
--  NUNCA se sobrescribe un valor bueno con uno vacio.
--
--  `signature_date` es texto: se guarda tal cual lo devuelve mSeller. Es lo que
--  viaja en la URL de consulta de la DGII, y reformatear una fecha fiscal es
--  como se introducen los desfases de un dia.
--
--  NULLABLE: las facturas ya emitidas no lo tienen guardado. Se recupera al
--  sincronizarlas, si mSeller lo devuelve.
-- ============================================================================

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "security_code"  varchar(64);

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "signature_date" varchar(40);

COMMENT ON COLUMN "invoices"."security_code" IS
  'Codigo de seguridad devuelto por mSeller/DGII. Nulo si el comprobante aun no esta firmado o si el envio es anterior a la migracion 0042. NUNCA se rellena con un valor calculado: ver hallazgo DB-23.';

COMMENT ON COLUMN "invoices"."signature_date" IS
  'Fecha y hora de firma tal como la devuelve mSeller, sin reformatear. Es la que viaja en la URL de consulta de la DGII.';


-- ── RECUPERACION DE LO QUE TODAVIA SE PUEDA SALVAR ───────────────────
--
-- Los envios cuyo `response_payload` conserve los datos (los que no han sido
-- sincronizados desde entonces) se vuelcan a la factura. Los que ya fueron
-- pisados por una consulta de estado estan perdidos: se recuperan volviendo a
-- sincronizar, cuando mSeller los devuelva.
--
-- El CASE es la guarda del cast, no el WHERE. Postgres puede evaluar las
-- condiciones de un WHERE en cualquier orden, de modo que `payload::jsonb` con
-- un filtro `payload ~ '^\s*\{'` al lado puede intentar el cast ANTES de filtrar
-- y reventar la migracion con un texto que no sea JSON. Dentro de un CASE el
-- orden si esta garantizado.
--
-- DISTINCT ON: una factura puede tener varios intentos con payload. Se coge el
-- mas reciente que traiga codigo de seguridad.
WITH firmas AS (
  SELECT DISTINCT ON (e.invoice_id)
         e.invoice_id,
         e.company_id,
         COALESCE(e.p ->> 'securityCode', e.p ->> 'codigoSeguridad') AS codigo,
         COALESCE(e.p ->> 'signedDate',   e.p ->> 'fechaFirma',
                  e.p ->> 'FechaFirma',   e.p ->> 'FechaHoraFirma')  AS fecha
    FROM (
      SELECT s.invoice_id,
             s.company_id,
             s.created_at,
             CASE WHEN s.response_payload ~ '^\s*\{'
                  THEN s.response_payload::jsonb
             END AS p
        FROM dgii_submissions s
       WHERE s.response_payload IS NOT NULL
         AND s.response_payload <> ''
    ) e
   WHERE COALESCE(e.p ->> 'securityCode', e.p ->> 'codigoSeguridad') IS NOT NULL
   ORDER BY e.invoice_id, e.created_at DESC
)
UPDATE invoices i
   SET security_code  = firmas.codigo,
       signature_date = COALESCE(firmas.fecha, i.signature_date)
  FROM firmas
 WHERE firmas.invoice_id = i.id
   AND firmas.company_id = i.company_id
   AND i.security_code IS NULL
   -- Un valor mas largo que la columna es una coincidencia equivocada, no un dato.
   AND length(firmas.codigo) <= 64
   AND (firmas.fecha IS NULL OR length(firmas.fecha) <= 40);


-- ── VERIFICACION ────────────────────────────────────────────────────
SELECT count(*)                                        AS facturas,
       count(*) FILTER (WHERE security_code  IS NOT NULL) AS con_codigo,
       count(*) FILTER (WHERE signature_date IS NOT NULL) AS con_fecha,
       count(*) FILTER (WHERE status = 'accepted'
                          AND security_code IS NULL)      AS aceptadas_sin_codigo
FROM invoices
WHERE deleted_at IS NULL;
-- `aceptadas_sin_codigo` son las que hay que volver a sincronizar para
-- recuperar el dato. Hasta entonces su QR no puede construirse de verdad.
