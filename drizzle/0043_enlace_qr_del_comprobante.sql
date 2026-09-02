-- ============================================================================
--  0043  --  El enlace del QR lo da mSeller, no lo inventa el sistema
-- ============================================================================
--
--  EL PROBLEMA (hallazgo DB-24)
--  ----------------------------
--  El enlace de consulta de la DGII que devuelve mSeller no tenia columna:
--  vivia dentro del JSON del envio, igual que el codigo de seguridad, y se
--  perdia por el mismo motivo (ver la migracion 0042).
--
--  Y cuando faltaba, tres rutas -- impresion, PDF y correo -- ARMABAN la URL a
--  mano:
--
--      https://ecf.dgii.gov.do/e-cf/Consulta?rncEmisor=...&fechaFirma=...
--
--  Ese no es el endpoint de consulta de la DGII. El QR impreso en el
--  comprobante llevaba a una direccion que no existe, y el cliente que lo
--  escaneaba no podia verificar nada.
--
--  El enlace correcto cambia con el ambiente (produccion o pruebas) y con el
--  tipo de comprobante. Quien lo sabe es mSeller. Se guarda el suyo y no se
--  construye ninguno -- mismo criterio que con el codigo de seguridad: si no lo
--  devuelve, no hay QR.
--
--  `text` y no `varchar`: es una URL con parametros y no tiene sentido ponerle
--  un tope arbitrario que la trunque a la mitad.
-- ============================================================================

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "qr_url" text;

COMMENT ON COLUMN "invoices"."qr_url" IS
  'Enlace de consulta de la DGII tal como lo devuelve mSeller. Nulo si aun no lo ha devuelto. NUNCA se construye: ver hallazgo DB-24.';


-- ── RECUPERACION DE LOS ENVIOS QUE TODAVIA LO CONSERVAN ──────────────
--
-- Mismo criterio que en la 0042: el CASE guarda el cast (Postgres puede evaluar
-- un WHERE en cualquier orden), y DISTINCT ON coge el intento mas reciente que
-- traiga enlace. Solo se recupera si es una URL: mSeller devuelve a veces la
-- imagen del QR en base64, y eso no se guarda.
WITH enlaces AS (
  SELECT DISTINCT ON (e.invoice_id)
         e.invoice_id,
         e.company_id,
         COALESCE(e.p ->> 'qr_url', e.p ->> 'qrCode', e.p ->> 'qr_code', e.p ->> 'qrUrl') AS enlace
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
   WHERE COALESCE(e.p ->> 'qr_url', e.p ->> 'qrCode', e.p ->> 'qr_code', e.p ->> 'qrUrl') ~* '^https?://'
   ORDER BY e.invoice_id, e.created_at DESC
)
UPDATE invoices i
   SET qr_url = enlaces.enlace
  FROM enlaces
 WHERE enlaces.invoice_id = i.id
   AND enlaces.company_id = i.company_id
   AND i.qr_url IS NULL;


-- ── VERIFICACION ────────────────────────────────────────────────────
SELECT count(*)                                          AS facturas,
       count(*) FILTER (WHERE qr_url IS NOT NULL)        AS con_enlace,
       count(*) FILTER (WHERE status = 'accepted'
                          AND qr_url IS NULL)            AS aceptadas_sin_enlace
FROM invoices
WHERE deleted_at IS NULL;
-- `aceptadas_sin_enlace` son las que hay que volver a sincronizar. Hasta
-- entonces se imprimen sin QR, que es lo correcto: mejor sin QR que con uno que
-- lleva a ninguna parte.
