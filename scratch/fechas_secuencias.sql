-- PASO 1 de 2 — Rellenar la fecha de vencimiento de las secuencias e-CF.
--
-- POR QUE
-- -------
-- `ecf_sequences.sequence_expiry` esta vacia para el e-32 y el e-34 de Latin
-- Doors. Cuando falta, el codigo NO se detiene: pone `31-12-2026` a pelo y esa
-- fecha viaja dentro del comprobante como `FechaVencimientoSecuencia`. Es un
-- dato fiscal inventado.
--
-- Han salido ya 27 comprobantes e-32 con esa fecha. Fueron a TesteCF, asi que
-- no hay dano. Pero antes de conmutar al ambiente real hay que poner las
-- fechas de verdad, porque despues cada comprobante es una presentacion firme.
--
-- COMO SE USA
-- -----------
-- 1. Abre tu autorizacion SACF de la DGII.
-- 2. Sustituye las dos fechas de abajo por las que diga ese documento,
--    en formato dd-MM-aaaa.
-- 3. Ejecuta. Si dejas los valores de ejemplo, el script se niega a correr.
--
-- El PASO 2 (quitar del codigo el `31-12-2026` fijo) va DESPUES de esto.
-- En ese orden no se rompe nada: para cuando el codigo exija la fecha, ya
-- estara puesta.

DO $$
DECLARE
  -- ─────────────────────────────────────────────────────────────────────
  --  PON AQUI TUS FECHAS REALES  (formato dd-MM-aaaa)
  v_fecha_e32 text := 'RELLENAR';   -- p. ej. '31-12-2027'
  v_fecha_e34 text := 'RELLENAR';   -- p. ej. '31-12-2027'
  -- ─────────────────────────────────────────────────────────────────────
  v_empresa  uuid;
  v_n        integer;
  r          record;
BEGIN
  IF v_fecha_e32 = 'RELLENAR' OR v_fecha_e34 = 'RELLENAR' THEN
    RAISE EXCEPTION 'Faltan las fechas. Sustituye v_fecha_e32 y v_fecha_e34 por las de tu autorizacion de la DGII.';
  END IF;

  -- Formato dd-MM-aaaa, y que sea una fecha que existe. Un '31-02-2027'
  -- pasaria un simple LIKE y no es una fecha.
  IF v_fecha_e32 !~ '^\d{2}-\d{2}-\d{4}$' OR v_fecha_e34 !~ '^\d{2}-\d{2}-\d{4}$' THEN
    RAISE EXCEPTION 'Las fechas deben ir en formato dd-MM-aaaa. Recibido: % y %', v_fecha_e32, v_fecha_e34;
  END IF;
  PERFORM to_date(v_fecha_e32, 'DD-MM-YYYY');
  PERFORM to_date(v_fecha_e34, 'DD-MM-YYYY');

  IF to_date(v_fecha_e32, 'DD-MM-YYYY') <= current_date
     OR to_date(v_fecha_e34, 'DD-MM-YYYY') <= current_date THEN
    RAISE EXCEPTION 'Alguna fecha ya paso (% / %). Una autorizacion vencida no sirve para emitir.',
      v_fecha_e32, v_fecha_e34;
  END IF;

  -- La empresa que factura: la unica con usuario Y contrasena de mSeller.
  SELECT cs.company_id INTO v_empresa
    FROM company_settings cs
   WHERE cs.mseller_email IS NOT NULL AND cs.mseller_password_encrypted IS NOT NULL;

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'No se encontro una empresa con credenciales de mSeller completas.';
  END IF;

  -- Solo las de modo PRODUCCION y solo las que NO tienen fecha. Las de PRUEBA
  -- se dejan como estan: su vencimiento no es una autorizacion real.
  UPDATE ecf_sequences
     SET sequence_expiry = v_fecha_e32, updated_at = now()
   WHERE company_id = v_empresa AND modo = 'PRODUCCION' AND ecf_type = '32'
     AND deleted_at IS NULL
     AND coalesce(btrim(sequence_expiry), '') = '';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'e-32: % secuencia(s) actualizada(s) a %.', v_n, v_fecha_e32;

  UPDATE ecf_sequences
     SET sequence_expiry = v_fecha_e34, updated_at = now()
   WHERE company_id = v_empresa AND modo = 'PRODUCCION' AND ecf_type = '34'
     AND deleted_at IS NULL
     AND coalesce(btrim(sequence_expiry), '') = '';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'e-34: % secuencia(s) actualizada(s) a %.', v_n, v_fecha_e34;

  -- Comprobacion final: ninguna secuencia de PRODUCCION puede quedar sin
  -- fecha, porque cualquiera de ellas acabaria declarando la inventada.
  FOR r IN
    SELECT ecf_type FROM ecf_sequences
     WHERE company_id = v_empresa AND modo = 'PRODUCCION' AND deleted_at IS NULL
       AND coalesce(btrim(sequence_expiry), '') = ''
       AND expiry_date IS NULL
  LOOP
    RAISE EXCEPTION 'La secuencia e-% sigue sin fecha de vencimiento. Rellenala antes de seguir.', r.ecf_type;
  END LOOP;

  RAISE NOTICE 'Todas las secuencias de PRODUCCION tienen fecha. Se puede aplicar el paso 2.';
END $$;

-- Como quedaron.
SELECT s.ecf_type AS "tipo e-CF",
       s.current_sequence AS "actual",
       s.max_sequence AS "hasta",
       coalesce(nullif(btrim(s.sequence_expiry), ''), s.expiry_date::text, '(SIN FECHA)') AS "vence",
       s.status AS "estado"
  FROM ecf_sequences s
  JOIN company_settings cs ON cs.company_id = s.company_id
 WHERE s.modo = 'PRODUCCION' AND s.deleted_at IS NULL
   AND cs.mseller_email IS NOT NULL AND cs.mseller_password_encrypted IS NOT NULL
 ORDER BY s.ecf_type;
