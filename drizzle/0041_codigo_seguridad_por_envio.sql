-- 0041 — El codigo de seguridad de la DGII deja de vivir dentro de un JSON
-- que otra cosa puede pisar.
--
-- QUE PASABA
-- ----------
-- El codigo de seguridad que emite la DGII al aceptar un e-CF -- el que va
-- impreso en el comprobante y dentro del QR de consulta -- se guardaba
-- UNICAMENTE dentro de `dgii_submissions.response_payload`, como una clave mas
-- del JSON que devolvio mSeller.
--
-- Y ese JSON lo pisan las dos rutas de sincronizacion:
--
--     UPDATE dgii_submissions
--        SET response_payload = <respuesta de la CONSULTA DE ESTADO>
--      WHERE invoice_id = ? AND company_id = ? AND modo = ?
--
-- La respuesta de la consulta de estado no lleva codigo de seguridad: no es su
-- trabajo. Asi que sincronizar una factura BORRABA su codigo. Al reimprimirla,
-- las cuatro rutas que la imprimen hacian esto:
--
--     if (!securityCode) securityCode = sha256(id + ncf).slice(0,16).toUpperCase()
--
-- es decir, se inventaban uno. Ese es el sintoma que se reporto: "cuando
-- sincronizo una factura y vuelvo a imprimirla me genera un codigo de
-- seguridad que no es el mismo que me da mSeller".
--
-- Y ademas ese UPDATE no dice QUE intento actualiza: con dos filas (emision y
-- reenvio) tocaba las dos, incluida la aceptada. Es el mismo patron que
-- `0035_envio_dgii_por_intento` corrigio en los trabajos de la cola y que en
-- estas dos rutas quedo sin corregir.
--
-- QUE HACE ESTA MIGRACION
-- -----------------------
-- Le da al codigo su propia columna. Un dato fiscal que hay que poder mostrar
-- ante la DGII no puede depender de que nadie sobrescriba un JSON.
--
--   - `security_code`: NULLABLE y SIN DEFAULT. A proposito. NULL significa
--     "no consta", que es distinto de "vacio" y muy distinto de un valor
--     inventado. Toda esta auditoria va de eso.
--
-- El relleno de las filas existentes se hace desde el propio `response_payload`
-- de cada una, y solo cuando el codigo esta ahi de verdad. Las que ya lo
-- perdieron se quedan en NULL: no hay de donde sacarlo, y NULL es la verdad.
-- Para esas facturas el codigo se recupera volviendo a consultar a mSeller.
--
-- La lectura se hace fila a fila y no con un UPDATE de una sola pasada. No es
-- pereza: en esta columna hay de todo (respuestas de mSeller, mensajes de
-- error sueltos, texto truncado), `texto::jsonb` revienta con lo que no sea
-- JSON, y Postgres puede evaluar esa conversion ANTES que la condicion que
-- pretenda protegerla. Fila a fila cada conversion lleva su propio manejo de
-- error. Son pocas filas; el coste da igual.

DO $$
DECLARE
  r            record;
  v_json       jsonb;
  v_codigo     text;
  v_rellenadas integer := 0;
  v_sin_codigo integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'dgii_submissions'
       AND column_name = 'security_code'
  ) THEN
    ALTER TABLE public.dgii_submissions ADD COLUMN security_code varchar(64);
  END IF;

  -- Se buscan los mismos nombres que lee `src/services/dgii/codigoSeguridad.ts`
  -- al primer nivel del payload. Lo anidado en `dgiiResponse` no se intenta
  -- aqui: en SQL habria que adivinar la forma, y una lectura a medias que
  -- falle en silencio es peor que un NULL honesto. El codigo de la aplicacion
  -- si mira dentro, y la proxima sincronizacion lo recogera.
  FOR r IN
    SELECT id, response_payload
      FROM public.dgii_submissions
     WHERE security_code IS NULL
       AND response_payload IS NOT NULL
       AND btrim(response_payload) <> ''
  LOOP
    BEGIN
      v_json := r.response_payload::jsonb;
    EXCEPTION WHEN others THEN
      CONTINUE;  -- no era JSON: no hay nada que leer
    END;

    IF jsonb_typeof(v_json) <> 'object' THEN
      CONTINUE;
    END IF;

    v_codigo := COALESCE(
      NULLIF(btrim(v_json ->> 'securityCode'), ''),
      NULLIF(btrim(v_json ->> 'codigoSeguridad'), ''),
      NULLIF(btrim(v_json ->> 'CodigoSeguridad'), ''),
      NULLIF(btrim(v_json ->> 'codigo_seguridad'), ''),
      NULLIF(btrim(v_json ->> 'security_code'), '')
    );

    IF v_codigo IS NOT NULL THEN
      UPDATE public.dgii_submissions
         SET security_code = left(v_codigo, 64)
       WHERE id = r.id;
      v_rellenadas := v_rellenadas + 1;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_sin_codigo
    FROM public.dgii_submissions
   WHERE status = 'accepted' AND security_code IS NULL;

  RAISE NOTICE '0041: codigo recuperado del payload en % envio(s).', v_rellenadas;
  RAISE NOTICE '0041: quedan % envio(s) ACEPTADOS sin codigo de seguridad.', v_sin_codigo;
  IF v_sin_codigo > 0 THEN
    RAISE NOTICE '0041: para esos hay que volver a consultar a mSeller. No se inventa ninguno.';
  END IF;

  -- Comprobacion final: la columna existe y admite NULL.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'dgii_submissions'
       AND column_name = 'security_code' AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION '0041: security_code no quedo creada como NULLABLE.';
  END IF;
END $$;
